CREATE TYPE "public"."assessment_source" AS ENUM('self', 'manager', 'review', '360');--> statement-breakpoint
CREATE TYPE "public"."competency_kind" AS ENUM('core', 'role', 'leadership');--> statement-breakpoint
CREATE TYPE "public"."dev_action_kind" AS ENUM('training', 'mentoring', 'experience', 'reading', 'other');--> statement-breakpoint
CREATE TYPE "public"."dev_action_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."dev_plan_status" AS ENUM('draft', 'pending_approval', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"kind" "competency_kind" DEFAULT 'core' NOT NULL,
	"description" text,
	"levels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competency_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"competency_key" text NOT NULL,
	"source" "assessment_source" NOT NULL,
	"level" integer NOT NULL,
	"note" text,
	"assessed_by_person_id" uuid,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "development_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" "dev_action_kind" DEFAULT 'other' NOT NULL,
	"competency_key" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"due_date" date,
	"status" "dev_action_status" DEFAULT 'open' NOT NULL,
	"evidence" text,
	"completed_at" timestamp with time zone,
	"created_by_person_id" uuid
);
--> statement-breakpoint
CREATE TABLE "development_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "dev_plan_status" DEFAULT 'draft' NOT NULL,
	"period_start" date,
	"period_end" date,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by_person_id" uuid,
	"manager_note" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "job_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"family" text,
	"level" text,
	"description" text,
	"expected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_profile_id" uuid,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "talent_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"potential" integer NOT NULL,
	"performance" integer,
	"note" text NOT NULL,
	"session" text,
	"assessed_by_person_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "job_profile_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "competencies_key_uq" ON "competencies" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "competency_assessments_person_idx" ON "competency_assessments" USING btree ("tenant_id","person_id","competency_key","source");--> statement-breakpoint
CREATE INDEX "development_actions_plan_idx" ON "development_actions" USING btree ("tenant_id","plan_id");--> statement-breakpoint
CREATE INDEX "development_actions_person_idx" ON "development_actions" USING btree ("tenant_id","person_id","status","due_date");--> statement-breakpoint
CREATE INDEX "development_plans_person_idx" ON "development_plans" USING btree ("tenant_id","person_id","status");--> statement-breakpoint
CREATE INDEX "job_profiles_tenant_idx" ON "job_profiles" USING btree ("tenant_id","family");--> statement-breakpoint
CREATE INDEX "talent_assessments_person_idx" ON "talent_assessments" USING btree ("tenant_id","person_id","created_at");