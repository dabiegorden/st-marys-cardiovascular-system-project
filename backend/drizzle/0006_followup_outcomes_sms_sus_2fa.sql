CREATE TYPE "public"."case_status" AS ENUM('open', 'acknowledged', 'reviewed', 'referred', 'closed');--> statement-breakpoint
CREATE TYPE "public"."assessment_outcome" AS ENUM('cvd_confirmed', 'cvd_excluded');--> statement-breakpoint
CREATE TABLE "case_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" uuid NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "high_risk_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"assigned_to_id" text,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by_id" text,
	"closed_at" timestamp with time zone,
	"closed_by_id" text,
	"escalated_at" timestamp with time zone,
	"escalation_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "high_risk_cases_assessment_id_unique" UNIQUE("assessment_id")
);
--> statement-breakpoint
CREATE TABLE "sms_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"recipient_user_id" text,
	"recipient_phone" text NOT NULL,
	"assessment_id" uuid,
	"message" text NOT NULL,
	"status" "notification_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "sus_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"role" text,
	"answers" smallint[] NOT NULL,
	"score" double precision NOT NULL,
	"comment" text,
	"assessment_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factors" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "decision_threshold" double precision;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "form_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "outcome" "assessment_outcome";--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "outcome_source" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "outcome_note" text;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "outcome_recorded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assessments" ADD COLUMN "outcome_recorded_by_id" text;--> statement-breakpoint
ALTER TABLE "model_versions" ADD COLUMN "decision_threshold" double precision;--> statement-breakpoint
ALTER TABLE "model_versions" ADD COLUMN "risk_bands" jsonb;--> statement-breakpoint
ALTER TABLE "model_versions" ADD COLUMN "threshold_reason" text;--> statement-breakpoint
ALTER TABLE "model_versions" ADD COLUMN "threshold_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model_versions" ADD COLUMN "threshold_updated_by_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sms_alerts" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "two_factor_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sus_dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_case_id_high_risk_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."high_risk_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_events" ADD CONSTRAINT "case_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "high_risk_cases" ADD CONSTRAINT "high_risk_cases_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "high_risk_cases" ADD CONSTRAINT "high_risk_cases_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "high_risk_cases" ADD CONSTRAINT "high_risk_cases_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "high_risk_cases" ADD CONSTRAINT "high_risk_cases_acknowledged_by_id_users_id_fk" FOREIGN KEY ("acknowledged_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "high_risk_cases" ADD CONSTRAINT "high_risk_cases_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notifications" ADD CONSTRAINT "sms_notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_notifications" ADD CONSTRAINT "sms_notifications_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sus_responses" ADD CONSTRAINT "sus_responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "case_events_case_idx" ON "case_events" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "high_risk_cases_status_idx" ON "high_risk_cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "high_risk_cases_created_at_idx" ON "high_risk_cases" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sms_notifications_due_idx" ON "sms_notifications" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "sms_notifications_assessment_idx" ON "sms_notifications" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "sus_responses_created_at_idx" ON "sus_responses" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "two_factors_user_idx" ON "two_factors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factors_secret_idx" ON "two_factors" USING btree ("secret");--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_outcome_recorded_by_id_users_id_fk" FOREIGN KEY ("outcome_recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_threshold_updated_by_id_users_id_fk" FOREIGN KEY ("threshold_updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;