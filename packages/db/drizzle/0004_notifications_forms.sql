CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."form_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."form_response_status" AS ENUM('draft', 'submitted');--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"notification_id" uuid,
	"to_email" text NOT NULL,
	"to_name" text,
	"subject" text NOT NULL,
	"text" text NOT NULL,
	"html" text,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"in_app" boolean DEFAULT true NOT NULL,
	"email" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"person_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"email_queued" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"response_id" uuid NOT NULL,
	"form_key" text NOT NULL,
	"section_key" text NOT NULL,
	"field_key" text NOT NULL,
	"field_type" text NOT NULL,
	"value_number" numeric(18, 4),
	"value_text" text,
	"value_options" text[],
	"subject_person_id" uuid
);
--> statement-breakpoint
CREATE TABLE "form_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'generic' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "form_status" DEFAULT 'draft' NOT NULL,
	"schema" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "form_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"form_definition_id" uuid NOT NULL,
	"form_key" text NOT NULL,
	"form_version" integer NOT NULL,
	"respondent_person_id" uuid,
	"subject_person_id" uuid,
	"context_type" text,
	"context_id" uuid,
	"status" "form_response_status" DEFAULT 'draft' NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" numeric(6, 4),
	"section_scores" jsonb,
	"submitted_at" timestamp with time zone,
	"due_date" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "email_outbox_status_idx" ON "email_outbox" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "job_runs_job_idx" ON "job_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_uq" ON "notification_preferences" USING btree ("tenant_id","user_id","type");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("tenant_id","dedupe_key") WHERE dedupe_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "form_answers_response_idx" ON "form_answers" USING btree ("tenant_id","response_id");--> statement-breakpoint
CREATE INDEX "form_answers_field_idx" ON "form_answers" USING btree ("tenant_id","form_key","field_key");--> statement-breakpoint
CREATE UNIQUE INDEX "form_definitions_key_version_uq" ON "form_definitions" USING btree ("tenant_id","key","version");--> statement-breakpoint
CREATE INDEX "form_definitions_status_idx" ON "form_definitions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "form_responses_def_idx" ON "form_responses" USING btree ("tenant_id","form_definition_id","status");--> statement-breakpoint
CREATE INDEX "form_responses_respondent_idx" ON "form_responses" USING btree ("tenant_id","respondent_person_id","status");--> statement-breakpoint
CREATE INDEX "form_responses_context_idx" ON "form_responses" USING btree ("tenant_id","context_type","context_id");