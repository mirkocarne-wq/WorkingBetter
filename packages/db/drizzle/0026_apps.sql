CREATE TYPE "public"."app_instance_status" AS ENUM('running', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."app_stage_run_status" AS ENUM('pending', 'active', 'done', 'rejected', 'skipped', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."app_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "app_instance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_person_id" uuid,
	"type" text NOT NULL,
	"stage_key" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"app_id" uuid NOT NULL,
	"app_key" text NOT NULL,
	"app_version" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"launcher_person_id" uuid,
	"actors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "app_instance_status" DEFAULT 'running' NOT NULL,
	"current_stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text,
	"outcome" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "app_stage_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"instance_id" uuid NOT NULL,
	"stage_key" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"actor_person_id" uuid,
	"status" "app_stage_run_status" DEFAULT 'pending' NOT NULL,
	"form_response_id" uuid,
	"outcome" text,
	"comment" text,
	"answers" jsonb,
	"due_date" date,
	"activated_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"completed_by_person_id" uuid
);
--> statement-breakpoint
CREATE TABLE "apps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" "app_status" DEFAULT 'draft' NOT NULL,
	"definition" jsonb NOT NULL,
	"template_key" text,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE INDEX "app_instance_events_idx" ON "app_instance_events" USING btree ("tenant_id","instance_id","at");--> statement-breakpoint
CREATE INDEX "app_instances_app_idx" ON "app_instances" USING btree ("tenant_id","app_key","status");--> statement-breakpoint
CREATE INDEX "app_instances_subject_idx" ON "app_instances" USING btree ("tenant_id","subject_person_id");--> statement-breakpoint
CREATE INDEX "app_instances_launcher_idx" ON "app_instances" USING btree ("tenant_id","launcher_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_stage_runs_uq" ON "app_stage_runs" USING btree ("instance_id","stage_key","attempt");--> statement-breakpoint
CREATE INDEX "app_stage_runs_actor_idx" ON "app_stage_runs" USING btree ("tenant_id","actor_person_id","status","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "apps_key_version_uq" ON "apps" USING btree ("tenant_id","key","version");--> statement-breakpoint
CREATE INDEX "apps_status_idx" ON "apps" USING btree ("tenant_id","status");