CREATE TYPE "public"."metrics_source" AS ENUM('initial', 'retrained');--> statement-breakpoint
CREATE TYPE "public"."training_status" AS ENUM('pending', 'training', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "model_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_name" text NOT NULL,
	"source" "metrics_source" DEFAULT 'initial' NOT NULL,
	"accuracy" double precision,
	"precision" double precision,
	"recall" double precision,
	"f1" double precision,
	"f1_score" double precision,
	"auc" double precision,
	"auc_roc" double precision,
	"cv_mean" double precision,
	"cv_std" double precision,
	"confusion_matrix" jsonb,
	"trained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_name" text NOT NULL,
	"input_features" jsonb NOT NULL,
	"scaled_features" double precision[],
	"prediction" smallint NOT NULL,
	"probability" double precision NOT NULL,
	"label" text,
	"all_model_results" jsonb,
	"request_ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "predictions_prediction_check" CHECK ("predictions"."prediction" IN (0, 1)),
	CONSTRAINT "predictions_probability_check" CHECK ("predictions"."probability" >= 0 AND "predictions"."probability" <= 1)
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"session_id" text PRIMARY KEY NOT NULL,
	"model_type" text NOT NULL,
	"status" "training_status" DEFAULT 'pending' NOT NULL,
	"original_filename" text,
	"file_size_bytes" integer,
	"num_samples" integer,
	"num_features" integer,
	"feature_names" text[],
	"progress" integer DEFAULT 0 NOT NULL,
	"current_message" text DEFAULT '' NOT NULL,
	"current_model" text,
	"metrics" jsonb,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"start_time" timestamp with time zone DEFAULT now() NOT NULL,
	"end_time" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_progress_check" CHECK ("training_sessions"."progress" >= 0 AND "training_sessions"."progress" <= 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "model_metrics_model_source_uq" ON "model_metrics" USING btree ("model_name","source");--> statement-breakpoint
CREATE INDEX "predictions_model_name_idx" ON "predictions" USING btree ("model_name");--> statement-breakpoint
CREATE INDEX "predictions_created_at_idx" ON "predictions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "training_sessions_status_idx" ON "training_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "training_sessions_end_time_idx" ON "training_sessions" USING btree ("end_time");