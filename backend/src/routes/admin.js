/**
 * routes/admin.js – admin-only endpoints (mounted behind requireRole("admin"))
 * ===========================================================================
 *   GET   /api/admin/models                    list versions (summary)
 *   GET   /api/admin/models/:id                full evaluation manifest
 *   POST  /api/admin/models/:id/activate       promote a version
 *   GET   /api/admin/training-jobs             list
 *   POST  /api/admin/training-jobs             multipart: dataset, searchMode
 *   GET   /api/admin/training-jobs/:id         status / progress
 *   GET   /api/admin/users                     list
 *   POST  /api/admin/users                     create (temporary password)
 *   PATCH /api/admin/users/:id                 { role?, active? }
 *   POST  /api/admin/users/:id/reset-password  new temporary password
 *   GET   /api/admin/audit-logs                filterable
 *   GET   /api/admin/assessments/export.csv    CSV export (audited)
 *   GET   /api/admin/notifications             email delivery log + summary
 *   POST  /api/admin/notifications/test        send a test email to yourself
 *   POST  /api/admin/notifications/digest      queue today's digest now
 *   POST  /api/admin/notifications/:id/retry   re-queue a failed/skipped email
 *   PUT   /api/admin/models/:id/operating-point decision threshold + risk bands
 *   GET   /api/admin/monitoring/drift          population stability index per input
 *   GET   /api/admin/usability (+ /export.csv) SUS results and task timing
 *   GET   /api/admin/sms · POST /sms/test · POST /sms/:id/retry   Arkesel SMS
 *   POST  /api/admin/users/:id/reset-2fa       remove a user's authenticator
 */

import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { z } from "zod";
import { and, count, desc, eq, gte, lte, ilike, or } from "drizzle-orm";
import { fromNodeHeaders } from "better-auth/node";

import { db } from "../db/db.js";
import { modelVersions, trainingJobs, users, auditLogs, assessments, patients, emailNotifications, smsNotifications, twoFactors, susResponses } from "../db/schema.js";
import { enqueueTestSms, retrySms } from "../notifications/sms-outbox.js";
import { getBalance, getSenderIdStatus } from "../notifications/arkesel.js";
import { normalizeGhanaPhone } from "../notifications/sms-templates.js";
import { driftReport, usabilityReport, SUS_ITEMS } from "../services/insights.js";
import { enqueueDailyDigest, enqueueTestEmail, retryNotification } from "../notifications/outbox.js";
import { jobSchedule } from "../notifications/scheduler.js";
import { isUndeliverableAddress } from "../notifications/templates.js";
import { asyncHandler, HttpError, parse } from "../middleware/errorHandler.js";
import { activateVersion, getActiveModel, updateOperatingPoint } from "../ml/registry.js";
import { startTrainingJob } from "../services/training.js";
import { audit } from "../services/audit.js";
import { auth, ROLE_NAMES } from "../auth/auth.js";
import { config } from "../config.js";
import { assessmentFilters, assessmentListColumns } from "./clinical.js";

const router = express.Router();
const idParam = z.object({ id: z.string().min(1).max(64) });
const uuidParam = z.object({ id: z.string().uuid("Invalid id.") });

/* ---------------- model versions ---------------- */
function summarise(row) {
  const m = row.manifest;
  const pick = (x) => x && { accuracy: x.accuracy, recall: x.recall, specificity: x.specificity, f1: x.f1, roc_auc: x.roc_auc };
  return {
    id: row.id,
    version: row.version,
    status: row.status,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
    trainingData: m.training_data?.name,
    nTrain: m.training_data?.n_train,
    internal: pick(m.evaluation?.internal_test),
    external: pick(m.evaluation?.external?.[0]?.metrics),
    operatingPoint: {
      threshold: row.decisionThreshold ?? m.decision_threshold,
      riskBands: row.riskBands ?? m.risk_bands,
      custom: row.decisionThreshold !== null && row.decisionThreshold !== undefined,
      reason: row.thresholdReason ?? null,
      updatedAt: row.thresholdUpdatedAt ?? null,
    },
  };
}

router.get(
  "/models",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(modelVersions).orderBy(desc(modelVersions.createdAt));
    res.json({ success: true, items: rows.map(summarise), activeId: getActiveModel()?.row.id ?? null });
  }),
);

router.get(
  "/models/:id",
  asyncHandler(async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const [row] = await db.select().from(modelVersions).where(eq(modelVersions.id, id));
    if (!row) throw new HttpError(404, "Model version not found.");
    const { parity_fixtures, ...manifest } = row.manifest;
    res.json({ success: true, model: { ...summarise(row), manifest } });
  }),
);

router.post(
  "/models/:id/activate",
  asyncHandler(async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const previous = getActiveModel()?.row.version ?? null;
    const row = await activateVersion(id, req.user.id);
    await audit(req, "model.activate", {
      entityType: "model_version",
      entityId: id,
      details: { version: row.version, previous },
    });
    res.json({ success: true, model: summarise(row) });
  }),
);

router.put(
  "/models/:id/operating-point",
  asyncHandler(async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const body = parse(
      z
        .object({
          threshold: z.number().min(0.05).max(0.95),
          lowMax: z.number().min(0.05).max(0.9),
          highMin: z.number().min(0.1).max(0.95),
          reason: z.string().trim().min(10, "Explain the clinical reason (at least 10 characters).").max(1000),
        })
        .refine((b) => b.lowMax < b.highMin, { message: "The low-risk limit must be below the high-risk limit.", path: ["lowMax"] }),
      req.body,
    );
    const [before] = await db.select().from(modelVersions).where(eq(modelVersions.id, id));
    if (!before) throw new HttpError(404, "Model version not found.");
    const row = await updateOperatingPoint(id, body, req.user.id);
    await audit(req, "model.operating_point", {
      entityType: "model_version",
      entityId: id,
      details: {
        version: row.version,
        from: { threshold: before.decisionThreshold ?? before.manifest.decision_threshold },
        to: { threshold: body.threshold, lowMax: body.lowMax, highMin: body.highMin },
        reason: body.reason,
      },
    });
    res.json({ success: true, model: summarise(row) });
  }),
);

/* ---------------- monitoring & usability ---------------- */
router.get(
  "/monitoring/drift",
  asyncHandler(async (req, res) => {
    const { days } = parse(z.object({ days: z.coerce.number().int().min(7).max(365).default(config.monitoring.driftWindowDays) }), req.query);
    res.json({ success: true, drift: await driftReport(days) });
  }),
);

router.get(
  "/usability",
  asyncHandler(async (_req, res) => {
    res.json({ success: true, usability: await usabilityReport() });
  }),
);

router.get(
  "/usability/export.csv",
  asyncHandler(async (req, res) => {
    const rows = await db.select().from(susResponses).orderBy(susResponses.createdAt);
    const esc = (v) => {
      const t = v == null ? "" : String(v);
      return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const header = ["response_id", "created_at", "role", "assessments_done", ...SUS_ITEMS.map((_, i) => `q${i + 1}`), "sus_score", "comment"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([r.id, new Date(r.createdAt).toISOString(), r.role, r.assessmentCount, ...r.answers, r.score, r.comment].map(esc).join(","));
    }
    await audit(req, "usability.export", { details: { rows: rows.length } });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="sus-responses-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join("\n"));
  }),
);

/* ---------------- training jobs ---------------- */
fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = [".csv", ".xlsx", ".xls"].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new HttpError(400, "Only .csv, .xlsx and .xls files are accepted."), ok);
  },
});

router.get(
  "/training-jobs",
  asyncHandler(async (_req, res) => {
    const items = await db
      .select({
        id: trainingJobs.id,
        status: trainingJobs.status,
        progress: trainingJobs.progress,
        message: trainingJobs.message,
        datasetFilename: trainingJobs.datasetFilename,
        searchMode: trainingJobs.searchMode,
        error: trainingJobs.error,
        modelVersionId: trainingJobs.modelVersionId,
        createdAt: trainingJobs.createdAt,
        finishedAt: trainingJobs.finishedAt,
        startedBy: users.name,
      })
      .from(trainingJobs)
      .leftJoin(users, eq(trainingJobs.startedById, users.id))
      .orderBy(desc(trainingJobs.createdAt))
      .limit(50);
    res.json({ success: true, items });
  }),
);

router.post(
  "/training-jobs",
  upload.single("dataset"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new HttpError(400, "Upload a dataset file in the 'dataset' field.");
    const { searchMode } = parse(z.object({ searchMode: z.enum(["full", "fast"]).default("full") }), req.body);
    const job = await startTrainingJob({ file: req.file, searchMode, user: req.user });
    await audit(req, "model.training_started", {
      entityType: "training_job",
      entityId: job.id,
      details: { dataset: req.file.originalname, searchMode },
    });
    res.status(202).json({ success: true, job });
  }),
);

router.get(
  "/training-jobs/:id",
  asyncHandler(async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const [job] = await db.select().from(trainingJobs).where(eq(trainingJobs.id, id));
    if (!job) throw new HttpError(404, "Training job not found.");
    res.json({ success: true, job });
  }),
);

/* ---------------- users ---------------- */
const publicUser = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  banned: users.banned,
  mustChangePassword: users.mustChangePassword,
  highRiskAlerts: users.highRiskAlerts,
  smsAlerts: users.smsAlerts,
  phoneNumber: users.phoneNumber,
  twoFactorEnabled: users.twoFactorEnabled,
  createdAt: users.createdAt,
};

function phoneOrError(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const phone = normalizeGhanaPhone(value);
  if (!phone) throw new HttpError(400, "Enter a valid Ghana mobile number, e.g. 024 123 4567.");
  return phone;
}

function temporaryPassword() {
  // 14 chars, unambiguous alphabet, cryptographically random
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(14), (b) => alphabet[b % alphabet.length]).join("");
}

router.get(
  "/users",
  asyncHandler(async (_req, res) => {
    const items = await db.select(publicUser).from(users).orderBy(users.name);
    res.json({ success: true, items });
  }),
);

router.post(
  "/users",
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(100),
        email: z.string().trim().toLowerCase().email(),
        role: z.enum(ROLE_NAMES),
        phoneNumber: z.string().trim().max(20).nullable().optional(),
      }),
      req.body,
    );
    const phone = phoneOrError(body.phoneNumber);
    delete body.phoneNumber;
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
    if (exists) throw new HttpError(409, "A user with this email already exists.");

    const password = temporaryPassword();
    const created = await auth.api.createUser({
      body: { ...body, password, data: { mustChangePassword: true } },
      headers: fromNodeHeaders(req.headers),
    });
    const id = created.user.id;
    // additionalFields with input:false may be ignored by createUser – enforce it
    await db.update(users).set({ mustChangePassword: true, ...(phone ? { phoneNumber: phone } : {}) }).where(eq(users.id, id));

    await audit(req, "user.create", { entityType: "user", entityId: id, details: { email: body.email, role: body.role } });
    const [user] = await db.select(publicUser).from(users).where(eq(users.id, id));
    res.status(201).json({ success: true, user, temporaryPassword: password });
  }),
);

router.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const body = parse(
      z.object({
        role: z.enum(ROLE_NAMES).optional(),
        active: z.boolean().optional(),
        name: z.string().trim().min(2).max(100).optional(),
        email: z.string().trim().toLowerCase().email().optional(),
        phoneNumber: z.string().trim().max(20).nullable().optional(),
      }),
      req.body,
    );
    const phone = phoneOrError(body.phoneNumber);
    if (id === req.user.id && (body.role || body.active !== undefined)) {
      throw new HttpError(400, "You cannot change your own role or status.");
    }
    const headers = fromNodeHeaders(req.headers);

    if (body.name || body.email || phone !== undefined) {
      if (body.email) {
        const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
        if (taken && taken.id !== id) throw new HttpError(409, "Another user already has this email.");
      }
      const details = {
        ...(body.name ? { name: body.name } : {}),
        ...(body.email ? { email: body.email } : {}),
        ...(phone !== undefined ? { phoneNumber: phone } : {}),
      };
      await db.update(users).set(details).where(eq(users.id, id));
      await audit(req, "user.details_update", { entityType: "user", entityId: id, details });
    }

    if (body.role) {
      await auth.api.setRole({ body: { userId: id, role: body.role }, headers });
      await audit(req, "user.role_change", { entityType: "user", entityId: id, details: { role: body.role } });
    }
    if (body.active === false) {
      await auth.api.banUser({ body: { userId: id, banReason: "Disabled by administrator" }, headers });
      await audit(req, "user.disable", { entityType: "user", entityId: id });
    } else if (body.active === true) {
      await auth.api.unbanUser({ body: { userId: id }, headers });
      await audit(req, "user.enable", { entityType: "user", entityId: id });
    }
    const [user] = await db.select(publicUser).from(users).where(eq(users.id, id));
    if (!user) throw new HttpError(404, "User not found.");
    res.json({ success: true, user });
  }),
);

router.post(
  "/users/:id/reset-password",
  asyncHandler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    const password = temporaryPassword();
    const headers = fromNodeHeaders(req.headers);
    await auth.api.setUserPassword({ body: { userId: id, newPassword: password }, headers });
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, id));
    if (id !== req.user.id) {
      await auth.api.revokeUserSessions({ body: { userId: id }, headers });
    }
    await audit(req, "user.password_reset", { entityType: "user", entityId: id });
    res.json({ success: true, temporaryPassword: password });
  }),
);

router.post(
  "/users/:id/reset-2fa",
  asyncHandler(async (req, res) => {
    const { id } = parse(idParam, req.params);
    if (id === req.user.id) throw new HttpError(400, "Use Settings to manage your own two-factor authentication.");
    await db.delete(twoFactors).where(eq(twoFactors.userId, id));
    const [u] = await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, id)).returning({ id: users.id });
    if (!u) throw new HttpError(404, "User not found.");
    await auth.api.revokeUserSessions({ body: { userId: id }, headers: fromNodeHeaders(req.headers) });
    await audit(req, "user.2fa_reset", { entityType: "user", entityId: id });
    res.json({ success: true });
  }),
);

/* ---------------- audit log ---------------- */
router.get(
  "/audit-logs",
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(50),
        action: z.string().max(60).optional(),
        q: z.string().max(100).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
      req.query,
    );
    const conds = [];
    if (q.action) conds.push(ilike(auditLogs.action, `${q.action}%`));
    if (q.q) conds.push(or(ilike(auditLogs.actorEmail, `%${q.q}%`), ilike(auditLogs.entityId, `%${q.q}%`)));
    if (q.from) conds.push(gte(auditLogs.createdAt, q.from));
    if (q.to) conds.push(lte(auditLogs.createdAt, q.to));
    const where = conds.length ? and(...conds) : undefined;

    const [items, [{ total }]] = await Promise.all([
      db
        .select({
          id: auditLogs.id,
          createdAt: auditLogs.createdAt,
          action: auditLogs.action,
          actorEmail: auditLogs.actorEmail,
          userName: users.name,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          details: auditLogs.details,
          ipAddress: auditLogs.ipAddress,
        })
        .from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ total: count() }).from(auditLogs).where(where),
    ]);
    res.json({ success: true, items, total, page: q.page, pageSize: q.pageSize });
  }),
);

/* ---------------- CSV export ---------------- */
router.get(
  "/assessments/export.csv",
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({
        riskBand: z.enum(["low", "moderate", "high"]).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      }),
      req.query,
    );
    const rows = await db
      .select({ ...assessmentListColumns, inputFeatures: assessments.inputFeatures })
      .from(assessments)
      .innerJoin(patients, eq(assessments.patientId, patients.id))
      .leftJoin(users, eq(assessments.userId, users.id))
      .innerJoin(modelVersions, eq(assessments.modelVersionId, modelVersions.id))
      .where(assessmentFilters(q, req.user))
      .orderBy(desc(assessments.createdAt));

    const featureNames = getActiveModel()?.model.order ?? [];
    const header = ["assessment_id", "created_at", "hospital_number", "clinician", "model_version", "prediction", "probability", "risk_band", ...featureNames];
    const esc = (v) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [r.id, new Date(r.createdAt).toISOString(), r.hospitalNumber, r.clinicianName, r.modelVersion, r.prediction, r.probability.toFixed(4), r.riskBand,
          ...featureNames.map((f) => r.inputFeatures?.[f])].map(esc).join(","),
      );
    }
    await audit(req, "assessment.export", { details: { rows: rows.length, filters: q } });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="assessments-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(lines.join("\n"));
  }),
);

/* ---------------- email notifications ---------------- */
router.get(
  "/notifications",
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        status: z.enum(["pending", "sending", "sent", "failed", "skipped"]).optional(),
        kind: z.enum(["high_risk_alert", "daily_digest", "test"]).optional(),
      }),
      req.query,
    );
    const conds = [];
    if (q.status) conds.push(eq(emailNotifications.status, q.status));
    if (q.kind) conds.push(eq(emailNotifications.kind, q.kind));
    const where = conds.length ? and(...conds) : undefined;
    const weekAgo = new Date(Date.now() - 7 * 864e5);

    const [items, [{ total }], summary, badAddresses] = await Promise.all([
      db
        .select({
          id: emailNotifications.id,
          kind: emailNotifications.kind,
          status: emailNotifications.status,
          recipientEmail: emailNotifications.recipientEmail,
          recipientName: users.name,
          subject: emailNotifications.subject,
          assessmentId: emailNotifications.assessmentId,
          attempts: emailNotifications.attempts,
          lastError: emailNotifications.lastError,
          nextAttemptAt: emailNotifications.nextAttemptAt,
          sentAt: emailNotifications.sentAt,
          createdAt: emailNotifications.createdAt,
        })
        .from(emailNotifications)
        .leftJoin(users, eq(emailNotifications.recipientUserId, users.id))
        .where(where)
        .orderBy(desc(emailNotifications.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ total: count() }).from(emailNotifications).where(where),
      db
        .select({ status: emailNotifications.status, total: count() })
        .from(emailNotifications)
        .where(gte(emailNotifications.createdAt, weekAgo))
        .groupBy(emailNotifications.status),
      db.select({ id: users.id, name: users.name, email: users.email, highRiskAlerts: users.highRiskAlerts }).from(users),
    ]);

    res.json({
      success: true,
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      summary: Object.fromEntries(summary.map((s) => [s.status, s.total])),
      settings: {
        enabled: config.email.enabled,
        from: config.email.from,
        recipients: config.email.recipients,
        showHospitalNumber: config.email.showHospitalNumber,
        ...jobSchedule(),
      },
      undeliverableUsers: badAddresses.filter((u) => isUndeliverableAddress(u.email)).map(({ id, name, email }) => ({ id, name, email })),
      optedOutUsers: badAddresses.filter((u) => !u.highRiskAlerts).map(({ id, name }) => ({ id, name })),
    });
  }),
);

router.post(
  "/notifications/test",
  asyncHandler(async (req, res) => {
    const row = await enqueueTestEmail(req.user);
    await audit(req, "notification.test", { entityType: "email_notification", entityId: row.id, details: { to: req.user.email } });
    res.status(202).json({ success: true, notification: { id: row.id, recipientEmail: row.recipientEmail, status: row.status } });
  }),
);

router.post(
  "/notifications/digest",
  asyncHandler(async (req, res) => {
    const queued = await enqueueDailyDigest();
    await audit(req, "notification.digest_manual", { details: { queued } });
    res.status(202).json({ success: true, queued });
  }),
);

router.post(
  "/notifications/:id/retry",
  asyncHandler(async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const row = await retryNotification(id);
    if (!row) throw new HttpError(404, "No failed or skipped notification with this id.");
    await audit(req, "notification.retry", { entityType: "email_notification", entityId: id });
    res.json({ success: true });
  }),
);

/* ---------------- SMS (Arkesel) ---------------- */
router.get(
  "/sms",
  asyncHandler(async (req, res) => {
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        status: z.enum(["pending", "sending", "sent", "failed", "skipped"]).optional(),
      }),
      req.query,
    );
    const where = q.status ? eq(smsNotifications.status, q.status) : undefined;
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const [items, [{ total }], summary, staff, balance, sender] = await Promise.all([
      db
        .select({
          id: smsNotifications.id,
          kind: smsNotifications.kind,
          status: smsNotifications.status,
          recipientPhone: smsNotifications.recipientPhone,
          recipientName: users.name,
          message: smsNotifications.message,
          assessmentId: smsNotifications.assessmentId,
          attempts: smsNotifications.attempts,
          lastError: smsNotifications.lastError,
          nextAttemptAt: smsNotifications.nextAttemptAt,
          sentAt: smsNotifications.sentAt,
          createdAt: smsNotifications.createdAt,
        })
        .from(smsNotifications)
        .leftJoin(users, eq(smsNotifications.recipientUserId, users.id))
        .where(where)
        .orderBy(desc(smsNotifications.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ total: count() }).from(smsNotifications).where(where),
      db.select({ status: smsNotifications.status, total: count() }).from(smsNotifications).where(gte(smsNotifications.createdAt, weekAgo)).groupBy(smsNotifications.status),
      db.select({ id: users.id, name: users.name, phoneNumber: users.phoneNumber, smsAlerts: users.smsAlerts, banned: users.banned }).from(users),
      getBalance(),
      getSenderIdStatus(),
    ]);
    res.json({
      success: true,
      items,
      total,
      page: q.page,
      pageSize: q.pageSize,
      summary: Object.fromEntries(summary.map((s) => [s.status, s.total])),
      settings: { enabled: config.sms.enabled, sender: config.sms.sender, sandbox: config.sms.sandbox, keyConfigured: Boolean(config.sms.apiKey) },
      balance,
      senderStatus: sender,
      usersWithoutPhone: staff.filter((u) => !u.banned && !u.phoneNumber).map(({ id, name }) => ({ id, name })),
      optedOutUsers: staff.filter((u) => !u.smsAlerts).map(({ id, name }) => ({ id, name })),
    });
  }),
);

router.post(
  "/sms/test",
  asyncHandler(async (req, res) => {
    const [me] = await db.select({ id: users.id, name: users.name, phoneNumber: users.phoneNumber }).from(users).where(eq(users.id, req.user.id));
    const row = await enqueueTestSms(me);
    await audit(req, "sms.test", { entityType: "sms_notification", entityId: row.id });
    res.status(202).json({ success: true, notification: { id: row.id, status: row.status } });
  }),
);

router.post(
  "/sms/:id/retry",
  asyncHandler(async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const row = await retrySms(id);
    if (!row) throw new HttpError(404, "No failed or skipped SMS with this id.");
    await audit(req, "sms.retry", { entityType: "sms_notification", entityId: id });
    res.json({ success: true });
  }),
);

export default router;
