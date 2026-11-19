/**
 * services/training.js – run model_training/train_random_forest.py as a job
 * =========================================================================
 * One job at a time. Progress lines (PROGRESS:<pct>|<msg>) are written to
 * training_jobs; on success the produced version is registered as a
 * *candidate* – an admin must review and activate it explicitly.
 */

import fs from "fs/promises";
import path from "path";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { eq, inArray } from "drizzle-orm";

import { db } from "../db/db.js";
import { trainingJobs, modelVersions } from "../db/schema.js";
import { config } from "../config.js";
import { HttpError } from "../middleware/errorHandler.js";
import { writeAudit } from "./audit.js";

const execFileAsync = promisify(execFile);
let pythonCmd = null;

export async function detectPython() {
  if (pythonCmd) return pythonCmd;
  const candidates = config.pythonBin ? [config.pythonBin] : ["python", "py", "python3"];
  for (const cmd of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(cmd, ["--version"], { timeout: 10_000 });
      if (/Python 3\./.test(stdout + stderr)) {
        pythonCmd = cmd;
        return cmd;
      }
    } catch {
      /* try next */
    }
  }
  throw new HttpError(500, "Python 3 is not available on the server (set PYTHON_BIN).");
}

/** Jobs left "running" by a previous process can never finish. */
export async function failStaleJobs() {
  const stale = await db
    .update(trainingJobs)
    .set({ status: "failed", error: "Server restarted while the job was running.", finishedAt: new Date() })
    .where(inArray(trainingJobs.status, ["queued", "running"]))
    .returning({ id: trainingJobs.id });
  if (stale.length) console.warn(`⚠  Marked ${stale.length} interrupted training job(s) as failed`);
}

function timestampVersion() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `rf-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export async function startTrainingJob({ file, searchMode, user }) {
  const [running] = await db
    .select({ id: trainingJobs.id })
    .from(trainingJobs)
    .where(inArray(trainingJobs.status, ["queued", "running"]))
    .limit(1);
  if (running) {
    await fs.unlink(file.path).catch(() => {});
    throw new HttpError(409, "Another training job is already running.");
  }

  const python = await detectPython();
  const version = timestampVersion();
  const outputDir = path.join(config.modelStoreDir, version);

  const [job] = await db
    .insert(trainingJobs)
    .values({
      status: "running",
      progress: 1,
      message: "Starting…",
      searchMode,
      datasetFilename: file.originalname,
      datasetSizeBytes: file.size,
      startedById: user.id,
      startedAt: new Date(),
    })
    .returning();

  const args = [
    config.trainingScript,
    "--train-data", file.path,
    "--external-data", config.externalValidationData,
    "--version", version,
    "--output-dir", outputDir,
    "--search", searchMode,
  ];

  runJob({ job, python, args, version, outputDir, file, user }).catch((err) =>
    console.error("[training] unexpected runner error:", err),
  );
  return job;
}

async function runJob({ job, python, args, version, outputDir, file, user }) {
  const update = (values) => db.update(trainingJobs).set(values).where(eq(trainingJobs.id, job.id));
  let lastPct = 0;
  let result = null;
  let stderrTail = "";
  let buffer = "";

  const proc = spawn(python, args, { cwd: path.dirname(config.trainingScript) });

  const handleLine = (line) => {
    if (line.startsWith("PROGRESS:")) {
      const [pctStr, ...msg] = line.slice(9).split("|");
      const pct = Math.min(99, Number.parseInt(pctStr, 10) || 0);
      if (pct > lastPct) {
        lastPct = pct;
        update({ progress: pct, message: msg.join("|").trim() }).catch(() => {});
      }
    } else if (line.startsWith("RESULT_JSON:")) {
      result = JSON.parse(line.slice(12));
    }
  };

  proc.stdout.on("data", (d) => {
    buffer += d.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    lines.forEach(handleLine);
  });
  proc.stderr.on("data", (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-4000);
  });

  const code = await new Promise((resolve) => {
    proc.on("close", resolve);
    proc.on("error", (err) => {
      stderrTail += `\n${err.message}`;
      resolve(-1);
    });
  });
  if (buffer) handleLine(buffer);

  try {
    if (code !== 0 || !result?.success) {
      const reason =
        stderrTail.split(/\r?\n/).filter((l) => /Error|SystemExit|ValueError|Exception/.test(l)).pop() ??
        `Training process exited with code ${code}.`;
      throw new Error(reason.trim());
    }

    const manifest = JSON.parse(await fs.readFile(path.join(outputDir, "manifest.json"), "utf-8"));
    const [mv] = await db
      .insert(modelVersions)
      .values({
        version,
        artifactDir: version,
        manifest,
        status: "candidate",
        trainingJobId: job.id,
        createdById: user.id,
      })
      .returning();

    await update({
      status: "completed",
      progress: 100,
      message: "Training complete – review and activate the candidate model.",
      modelVersionId: mv.id,
      result,
      finishedAt: new Date(),
    });
    await writeAudit({
      action: "model.trained",
      userId: user.id,
      actorEmail: user.email,
      entityType: "model_version",
      entityId: mv.id,
      details: { version, dataset: file.originalname, internal: result.internal_test, external: result.external },
    });
  } catch (err) {
    await fs.rm(outputDir, { recursive: true, force: true }).catch(() => {});
    await update({ status: "failed", error: err.message, message: "Training failed.", finishedAt: new Date() });
    await writeAudit({
      action: "model.training_failed",
      userId: user.id,
      actorEmail: user.email,
      entityType: "training_job",
      entityId: job.id,
      details: { error: err.message, dataset: file.originalname },
    });
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
}
