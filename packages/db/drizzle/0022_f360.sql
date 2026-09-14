CREATE TYPE "public"."f360_campaign_status" AS ENUM('draft', 'nomination', 'collection', 'closed');--> statement-breakpoint
CREATE TYPE "public"."f360_rater_category" AS ENUM('self', 'manager', 'peer', 'report', 'other', 'external');--> statement-breakpoint
CREATE TYPE "public"."f360_request_status" AS ENUM('proposed', 'rejected', 'pending', 'submitted', 'declined', 'expired');--> statement-breakpoint
CREATE TYPE "public"."f360_subject_status" AS ENUM('nominating', 'pending_approval', 'approved', 'collecting', 'ready', 'released');--> statement-breakpoint
CREATE TABLE "f360_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "f360_campaign_status" DEFAULT 'draft' NOT NULL,
	"competency_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scale" jsonb DEFAULT '{"min":1,"max":5,"labels":{}}'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nomination_by" text DEFAULT 'subject' NOT NULL,
	"require_approval" boolean DEFAULT true NOT NULL,
	"release_rule" text DEFAULT 'after_debrief' NOT NULL,
	"manager_sees_report" boolean DEFAULT true NOT NULL,
	"anonymity_threshold" integer DEFAULT 3 NOT NULL,
	"population" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"nomination_due_at" date,
	"collection_due_at" date,
	"launched_at" timestamp with time zone,
	"collection_started_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "f360_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" "f360_rater_category" NOT NULL,
	"rater_person_id" uuid,
	"external_email" text,
	"external_name" text,
	"token_hash" text,
	"status" "f360_request_status" DEFAULT 'proposed' NOT NULL,
	"nominated_by_person_id" uuid,
	"decline_reason" text,
	"draft" jsonb,
	"invited_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"reminded_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "f360_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" "f360_rater_category" NOT NULL,
	"request_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ratings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"open_answers" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "f360_subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"manager_person_id" uuid,
	"org_unit_id" uuid,
	"status" "f360_subject_status" DEFAULT 'nominating' NOT NULL,
	"nomination_submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by_person_id" uuid,
	"report" jsonb,
	"report_generated_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"released_by_person_id" uuid,
	"debrief_at" timestamp with time zone,
	"debrief_note" text
);
--> statement-breakpoint
CREATE INDEX "f360_campaigns_tenant_idx" ON "f360_campaigns" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "f360_requests_subject_idx" ON "f360_requests" USING btree ("tenant_id","subject_id","category");--> statement-breakpoint
CREATE INDEX "f360_requests_rater_idx" ON "f360_requests" USING btree ("tenant_id","rater_person_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "f360_requests_token_uq" ON "f360_requests" USING btree ("token_hash") WHERE token_hash IS NOT NULL;--> statement-breakpoint
CREATE INDEX "f360_responses_subject_idx" ON "f360_responses" USING btree ("tenant_id","subject_id","category");--> statement-breakpoint
CREATE UNIQUE INDEX "f360_subjects_uq" ON "f360_subjects" USING btree ("campaign_id","person_id");--> statement-breakpoint
CREATE INDEX "f360_subjects_person_idx" ON "f360_subjects" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "f360_subjects_manager_idx" ON "f360_subjects" USING btree ("tenant_id","manager_person_id");