/**
 * config.js – validated environment configuration
 */

import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  // Public URL the browser uses (the Next.js app, which proxies /api/* here)
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:3000"),
  MODEL_STORE_DIR: z.string().default(path.join(backendRoot, "model_store")),
  INITIAL_MODEL_VERSION: z.string().default("rf-v1"),
  TRAINING_SCRIPT: z
    .string()
    .default(path.join(repoRoot, "model_training", "train_random_forest.py")),
  EXTERNAL_VALIDATION_DATA: z
    .string()
    .default(path.join(repoRoot, "model_training", "Heart_Disease x2.xlsx")),
  PYTHON_BIN: z.string().optional(),
  UPLOAD_DIR: z.string().default(path.join(backendRoot, "uploads")),

  // ── Email alerts (Resend) ─────────────────────────────────────────
  RESEND_API_KEY: z.string().optional(),
  RESEND_EMAIL_FROM: z.string().optional(), // e.g. "St. Mary's CVD Alerts <alerts@your-domain>"
  // Who receives a high-risk alert: the assessing clinician + all admins, or every active user
  ALERT_RECIPIENTS: z.enum(["assessor_and_admins", "all_staff"]).default("assessor_and_admins"),
  // Emails leave the hospital via Resend – the hospital number is masked unless explicitly enabled
  ALERT_SHOW_HOSPITAL_NUMBER: z.enum(["true", "false"]).default("false"),
  OUTBOX_CRON: z.string().default("* * * * *"), // retry / catch-up sweep
  DIGEST_CRON: z.string().default("0 7 * * *"), // daily summary to admins; "off" disables
  CRON_TIMEZONE: z.string().default("Africa/Accra"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  port: env.PORT,
  authSecret: env.BETTER_AUTH_SECRET,
  authUrl: env.BETTER_AUTH_URL,
  frontendOrigin: env.FRONTEND_ORIGIN,
  modelStoreDir: path.resolve(env.MODEL_STORE_DIR),
  initialModelVersion: env.INITIAL_MODEL_VERSION,
  trainingScript: path.resolve(env.TRAINING_SCRIPT),
  externalValidationData: env.EXTERNAL_VALIDATION_DATA,
  pythonBin: env.PYTHON_BIN,
  uploadDir: path.resolve(env.UPLOAD_DIR),
  backendRoot,
  email: {
    apiKey: env.RESEND_API_KEY || null,
    from: env.RESEND_EMAIL_FROM || null,
    enabled: Boolean(env.RESEND_API_KEY && env.RESEND_EMAIL_FROM),
    appUrl: env.BETTER_AUTH_URL.replace(/\/$/, ""),
    recipients: env.ALERT_RECIPIENTS,
    showHospitalNumber: env.ALERT_SHOW_HOSPITAL_NUMBER === "true",
    outboxCron: env.OUTBOX_CRON,
    digestCron: env.DIGEST_CRON,
    timezone: env.CRON_TIMEZONE,
  },
};
