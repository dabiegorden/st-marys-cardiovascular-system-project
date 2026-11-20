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
  phoneNumber: text("phone_number"), // international format without "+", e.g. 233241234567
  smsAlerts: boolean("sms_alerts").notNull().default(true), // SMS preference
  twoFactorEnabled: boolean("two_factor_enabled").default(false), // Better Auth twoFactor plugin
  susDismissedAt: tz("sus_dismissed_at"), // usability questionnaire postponed
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

export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(), // encrypted TOTP secret
    backupCodes: text("backup_codes").notNull(), // encrypted
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: tz("locked_until"),
  },
  (t) => [index("two_factors_user_idx").on(t.userId), index("two_factors_secret_idx").on(t.secret)],
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
export const outcomeEnum = pgEnum("assessment_outcome", ["cvd_confirmed", "cvd_excluded"]);
export const caseStatusEnum = pgEnum("case_status", ["open", "acknowledged", "reviewed", "referred", "closed"]);

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
    // Operating point chosen by an administrator (overrides the manifest defaults)
    decisionThreshold: doublePrecision("decision_threshold"),
    riskBands: jsonb("risk_bands"),
    thresholdReason: text("threshold_reason"),
    thresholdUpdatedAt: tz("threshold_updated_at"),
    thresholdUpdatedById: text("threshold_updated_by_id").references(() => users.id, { onDelete: "set null" }),
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
    decisionThreshold: doublePrecision("decision_threshold"), // operating point used
    formDurationMs: integer("form_duration_ms"), // time to complete the form (usability)

    clinicianNote: text("clinician_note"),

    // Confirmed outcome, recorded later (local validation)
    outcome: outcomeEnum("outcome"),
    outcomeSource: text("outcome_source"), // e.g. "Echocardiogram", "Cardiology review"
    outcomeNote: text("outcome_note"),
    outcomeRecordedAt: tz("outcome_recorded_at"),
    outcomeRecordedById: text("outcome_recorded_by_id").references(() => users.id, { onDelete: "set null" }),
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

/* ============================================================
 * HIGH-RISK FOLLOW-UP CASES
 * Every high-risk assessment opens a case that must be acknowledged and
 * closed; unacknowledged cases are escalated by a background job.
 * ============================================================ */
export const highRiskCases = pgTable(
  "high_risk_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .unique()
      .references(() => assessments.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    status: caseStatusEnum("status").notNull().default("open"),
    assignedToId: text("assigned_to_id").references(() => users.id, { onDelete: "set null" }),
    acknowledgedAt: tz("acknowledged_at"),
    acknowledgedById: text("acknowledged_by_id").references(() => users.id, { onDelete: "set null" }),
    closedAt: tz("closed_at"),
    closedById: text("closed_by_id").references(() => users.id, { onDelete: "set null" }),
    escalatedAt: tz("escalated_at"),
    escalationCount: integer("escalation_count").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("high_risk_cases_status_idx").on(t.status), index("high_risk_cases_created_at_idx").on(t.createdAt)],
);

export const caseEvents = pgTable(
  "case_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => highRiskCases.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // created | acknowledged | reviewed | referred | closed | reopened | note | escalated
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("case_events_case_idx").on(t.caseId)],
);

/* ============================================================
 * SMS NOTIFICATIONS (outbox, delivered through Arkesel)
 * ============================================================ */
export const smsNotifications = pgTable(
  "sms_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(), // "high_risk_alert" | "case_escalation" | "test"
    dedupeKey: text("dedupe_key").notNull().unique(),
    recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "set null" }),
    recipientPhone: text("recipient_phone").notNull(),
    assessmentId: uuid("assessment_id").references(() => assessments.id, { onDelete: "set null" }),
    message: text("message").notNull(),
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
    index("sms_notifications_due_idx").on(t.status, t.nextAttemptAt),
    index("sms_notifications_assessment_idx").on(t.assessmentId),
  ],
);

/* ============================================================
 * USABILITY STUDY – System Usability Scale (SUS) responses
 * ============================================================ */
export const susResponses = pgTable(
  "sus_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    role: text("role"),
    answers: smallint("answers").array().notNull(), // 10 answers, 1-5
    score: doublePrecision("score").notNull(), // 0-100
    comment: text("comment"),
    assessmentCount: integer("assessment_count"), // experience at time of response
    createdAt: createdAt(),
  },
  (t) => [index("sus_responses_created_at_idx").on(t.createdAt)],
);
