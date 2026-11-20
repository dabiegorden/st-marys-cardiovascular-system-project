/**
 * ml/registry.js – which model version is active, loaded in memory
 * ================================================================
 * - On startup: if no versions are registered yet, the bundled initial
 *   model (model_store/rf-v1) is registered and activated.
 * - The active version is loaded once and swapped atomically when an
 *   admin activates a candidate.
 */

import fs from "fs";
import path from "path";
import { eq, ne, and } from "drizzle-orm";
import { db } from "../db/db.js";
import { modelVersions } from "../db/schema.js";
import { config } from "../config.js";
import { LoadedModel } from "./inference.js";

let active = null; // { row, model: LoadedModel }

export function versionDir(artifactDir) {
  return path.resolve(config.modelStoreDir, artifactDir);
}

export function readManifest(artifactDir) {
  return JSON.parse(
    fs.readFileSync(path.join(versionDir(artifactDir), "manifest.json"), "utf-8"),
  );
}

async function registerInitialModel() {
  const dir = config.initialModelVersion;
  if (!fs.existsSync(path.join(versionDir(dir), "manifest.json"))) {
    throw new Error(`Initial model not found in ${versionDir(dir)}. Run model_training/train_random_forest.py.`);
  }
  const manifest = readManifest(dir);
  const [row] = await db
    .insert(modelVersions)
    .values({
      version: manifest.version,
      artifactDir: dir,
      manifest,
      status: "active",
      activatedAt: new Date(),
    })
    .returning();
  console.log(`✓ Registered initial model ${row.version} as active`);
  return row;
}

export async function initModelRegistry() {
  let [row] = await db
    .select()
    .from(modelVersions)
    .where(eq(modelVersions.status, "active"))
    .limit(1);

  if (!row) {
    const [any] = await db.select({ id: modelVersions.id }).from(modelVersions).limit(1);
    if (any) {
      console.error("⚠  No active model version. An admin must activate one.");
      return;
    }
    row = await registerInitialModel();
  }
  await load(row);
}

export function bandsFromCuts(lowMax, highMin) {
  return [
    { name: "low", label: "Low", min: 0, max: lowMax },
    { name: "moderate", label: "Moderate", min: lowMax, max: highMin },
    { name: "high", label: "High", min: highMin, max: 1 },
  ];
}

async function loadModel(row) {
  const model = await LoadedModel.load(versionDir(row.artifactDir));
  model.setOperatingPoint(row.decisionThreshold ?? undefined, row.riskBands ?? undefined);
  return model;
}

async function load(row) {
  const model = await loadModel(row);
  active = { row, model };
  console.log(`✓ Active model: ${row.version} (${model.order.length} features)`);
}

export function getActiveModel() {
  return active;
}

/** Make `id` the only active version (transaction), then hot-swap it in. */
export async function activateVersion(id, userId) {
  const [target] = await db.select().from(modelVersions).where(eq(modelVersions.id, id));
  if (!target) {
    const err = new Error("Model version not found.");
    err.statusCode = 404;
    throw err;
  }
  // Load first: never switch the DB to a model that cannot be served.
  const model = await loadModel(target);

  const row = await db.transaction(async (tx) => {
    await tx
      .update(modelVersions)
      .set({ status: "retired" })
      .where(and(eq(modelVersions.status, "active"), ne(modelVersions.id, id)));
    const [updated] = await tx
      .update(modelVersions)
      .set({ status: "active", activatedAt: new Date(), activatedById: userId })
      .where(eq(modelVersions.id, id))
      .returning();
    return updated;
  });

  active = { row, model };
  console.log(`✓ Activated model ${row.version}`);
  return row;
}

/** Admin-chosen operating point for a version; applied immediately if it is active. */
export async function updateOperatingPoint(id, { threshold, lowMax, highMin, reason }, userId) {
  const riskBands = bandsFromCuts(lowMax, highMin);
  const [row] = await db
    .update(modelVersions)
    .set({ decisionThreshold: threshold, riskBands, thresholdReason: reason, thresholdUpdatedAt: new Date(), thresholdUpdatedById: userId })
    .where(eq(modelVersions.id, id))
    .returning();
  if (!row) {
    const err = new Error("Model version not found.");
    err.statusCode = 404;
    throw err;
  }
  if (active?.row.id === id) {
    active.model.setOperatingPoint(threshold, riskBands);
    active.row = row;
  }
  return row;
}
