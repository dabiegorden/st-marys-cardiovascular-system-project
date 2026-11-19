/**
 * db/schema.js  –  PostgreSQL (Neon) schema, defined with Drizzle ORM
 * ====================================================================
 * Auth (managed by Better Auth – see src/auth/auth.js)
 *   users, sessions, accounts, verifications
 *
 * Domain
 *   patients        – identified only by the hospital folder number (data minimisation)
 *   model_versions  – every trained Random Forest (candidate → active → retired)
 *   training_jobs   – admin retraining runs (dataset upload → Python → candidate)
 *   assessments     – one prediction for one patient by one user with one model version
 *   audit_logs      – who did what, when (logins, predictions, admin actions …)
 *   email_notifications – outbox of alert / digest emails sent through Resend
 *
 * After changing this file:
 *   npm run db:generate -- --name <change>   then   npm run db:migrate
 */

import {
  pgTable,
  pgEnum,
  uuid,
  bigserial,
  text,
  boolean,
  integer,
  smallint,
  doublePrecision,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const tz = (name) => timestamp(name, { withTimezone: true });
const createdAt = () => tz("created_at").notNull().defaultNow();
const updatedAt = () =>
  tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ============================================================
 * AUTH  (column set required by Better Auth + admin plugin)
 * ============================================================ */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // admin plugin
  role: text("role").notNull().default("clinician"), // "admin" | "clinician"
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: tz("ban_expires"),
  // application
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  highRiskAlerts: boolean("high_risk_alerts").notNull().default(true), // email preference
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: tz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tz("access_token_expires_at"),
    refreshTokenExpiresAt: tz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"), // scrypt hash, never plain text
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: tz("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ============================================================
 * ENUMS
 * ============================================================ */
export const modelStatusEnum = pgEnum("model_status", [
  "candidate",
  "active",
  "retired",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const riskBandEnum = pgEnum("risk_band", ["low", "moderate", "high"]);

/* ============================================================
 * PATIENTS
 * ============================================================ */
export const patients = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  hospitalNumber: text("hospital_number").notNull().unique(),
  createdById: text("created_by_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ============================================================
 * MODEL VERSIONS
 * ============================================================ */
export const modelVersions = pgTable(
  "model_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version").notNull().unique(), // "rf-v1", "rf-20261120-101500"
    algorithm: text("algorithm").notNull().default("random_forest"),
    status: modelStatusEnum("status").notNull().default("candidate"),
    artifactDir: text("artifact_dir").notNull(), // relative to MODEL_STORE_DIR
    manifest: jsonb("manifest").notNull(), // full training/evaluation manifest
    trainingJobId: uuid("training_job_id"),
    createdById: text("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activatedAt: tz("activated_at"),
    activatedById: text("activated_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // At most one active model at any time
    uniqueIndex("model_versions_single_active_uq")
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
  ],
);

/* ============================================================
 * TRAINING JOBS
 * ============================================================ */
export const trainingJobs = pgTable(
  "training_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    status: jobStatusEnum("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    message: text("message").notNull().default(""),
    searchMode: text("search_mode").notNull().default("full"),
    datasetFilename: text("dataset_filename").notNull(),
    datasetSizeBytes: integer("dataset_size_bytes"),
    modelVersionId: uuid("model_version_id").references(() => modelVersions.id, {
      onDelete: "set null",
    }),
    result: jsonb("result"),
    error: text("error"),
    startedById: text("started_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    startedAt: tz("started_at"),
    finishedAt: tz("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("training_jobs_status_idx").on(t.status),
    check(
      "training_jobs_progress_check",
      sql`${t.progress} >= 0 AND ${t.progress} <= 100`,
    ),
  ],
);

/* ============================================================
 * ASSESSMENTS
 * ============================================================ */
export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    modelVersionId: uuid("model_version_id")
      .notNull()
      .references(() => modelVersions.id, { onDelete: "restrict" }),

    inputFeatures: jsonb("input_features").notNull(), // { feature: value | null }
    imputedFeatures: text("imputed_features").array().notNull().default([]),
    warnings: jsonb("warnings").notNull().default([]), // outside training range, …
    explanation: jsonb("explanation"), // per-feature sensitivity

    prediction: smallint("prediction").notNull(), // 1 = CVD likely
    probability: doublePrecision("probability").notNull(),
    riskBand: riskBandEnum("risk_band").notNull(),

    clinicianNote: text("clinician_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("assessments_patient_idx").on(t.patientId),
    index("assessments_user_idx").on(t.userId),
    index("assessments_created_at_idx").on(t.createdAt),
    check("assessments_prediction_check", sql`${t.prediction} IN (0, 1)`),
    check(
      "assessments_probability_check",
      sql`${t.probability} >= 0 AND ${t.probability} <= 1`,
    ),
  ],
);

/* ============================================================
 * AUDIT LOG
 * ============================================================ */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorEmail: text("actor_email"),
    action: text("action").notNull(), // "auth.login", "assessment.create", …
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    details: jsonb("details"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_created_at_idx").on(t.createdAt),
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_action_idx").on(t.action),
  ],
);

/* ============================================================
 * EMAIL NOTIFICATIONS (transactional outbox)
 * One row per recipient per event. The rendered email is stored so every
 * retry sends an identical payload (required by Resend idempotency keys).
 * ============================================================ */
export const notificationStatusEnum = pgEnum("notification_status", [
  "pending",
  "sending",
  "sent",
  "failed",
  "skipped",
]);

export const emailNotifications = pgTable(
  "email_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // "high_risk_alert" | "daily_digest" | "test"
    dedupeKey: text("dedupe_key").notNull().unique(), // also the Resend idempotency key
    recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
    recipientEmail: text("recipient_email").notNull(),
    assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "set null" }),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    text: text("text").notNull(),
    status: notificationStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: tz("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    providerMessageId: text("provider_message_id"),
    sentAt: tz("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("email_notifications_due_idx").on(t.status, t.nextAttemptAt),
    index("email_notifications_assessment_idx").on(t.assessmentId),
    index("email_notifications_created_at_idx").on(t.createdAt),
  ],
);
