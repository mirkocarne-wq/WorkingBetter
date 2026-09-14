CREATE TYPE "public"."onboarding_journey_status" AS ENUM('active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."onboarding_kind" AS ENUM('onboarding', 'role_change', 'offboarding');--> statement-breakpoint
CREATE TYPE "public"."onboarding_task_kind" AS ENUM('todo', 'read', 'sign', 'form', 'meeting', 'objective', 'survey');--> statement-breakpoint
CREATE TYPE "public"."onboarding_task_role" AS ENUM('newcomer', 'manager', 'hr', 'buddy', 'it');--> statement-breakpoint
CREATE TYPE "public"."onboarding_task_status" AS ENUM('open', 'done', 'skipped');--> statement-breakpoint
CREATE TABLE "onboarding_journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid,
	"person_id" uuid NOT NULL,
	"kind" "onboarding_kind" DEFAULT 'onboarding' NOT NULL,
	"manager_person_id" uuid,
	"buddy_person_id" uuid,
	"hr_person_id" uuid,
	"it_person_id" uuid,
	"anchor_date" date NOT NULL,
	"status" "onboarding_journey_status" DEFAULT 'active' NOT NULL,
	"template_name" text NOT NULL,
	"phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"journey_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"survey_key" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comment" text,
	"score" numeric(4, 2),
	"low" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"journey_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"key" text NOT NULL,
	"phase" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"role" "onboarding_task_role" NOT NULL,
	"kind" "onboarding_task_kind" DEFAULT 'todo' NOT NULL,
	"assignee_person_id" uuid,
	"due_date" date,
	"link" text,
	"form_key" text,
	"survey_key" text,
	"required" boolean DEFAULT true NOT NULL,
	"status" "onboarding_task_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_person_id" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "onboarding_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "onboarding_kind" DEFAULT 'onboarding' NOT NULL,
	"description" text,
	"phases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX "onboarding_journeys_person_idx" ON "onboarding_journeys" USING btree ("tenant_id","person_id","status");--> statement-breakpoint
CREATE INDEX "onboarding_journeys_manager_idx" ON "onboarding_journeys" USING btree ("tenant_id","manager_person_id");--> statement-breakpoint
CREATE INDEX "onboarding_journeys_buddy_idx" ON "onboarding_journeys" USING btree ("tenant_id","buddy_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_survey_uq" ON "onboarding_survey_responses" USING btree ("journey_id","survey_key");--> statement-breakpoint
CREATE INDEX "onboarding_survey_person_idx" ON "onboarding_survey_responses" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_tasks_journey_key_uq" ON "onboarding_tasks" USING btree ("journey_id","key");--> statement-breakpoint
CREATE INDEX "onboarding_tasks_assignee_idx" ON "onboarding_tasks" USING btree ("tenant_id","assignee_person_id","status","due_date");--> statement-breakpoint
CREATE INDEX "onboarding_tasks_journey_idx" ON "onboarding_tasks" USING btree ("tenant_id","journey_id");--> statement-breakpoint
CREATE INDEX "onboarding_templates_tenant_idx" ON "onboarding_templates" USING btree ("tenant_id","kind");