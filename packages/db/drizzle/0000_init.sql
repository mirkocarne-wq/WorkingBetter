CREATE TYPE "public"."person_status" AS ENUM('invited', 'active', 'leaving', 'terminated', 'suspended', 'anonymized');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('on_track', 'at_risk', 'off_track');--> statement-breakpoint
CREATE TYPE "public"."kr_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."kr_type" AS ENUM('number', 'percent', 'currency', 'boolean', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."objective_level" AS ENUM('company', 'unit', 'team', 'individual');--> statement-breakpoint
CREATE TYPE "public"."objective_outcome" AS ENUM('achieved', 'partially', 'not_achieved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."objective_status" AS ENUM('draft', 'pending_approval', 'active', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."objective_visibility" AS ENUM('public', 'team', 'private');--> statement-breakpoint
CREATE TYPE "public"."progress_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"request_id" text
);
--> statement-breakpoint
CREATE TABLE "naming_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"locale" text NOT NULL,
	"singular" text NOT NULL,
	"plural" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"parent_id" uuid,
	"path" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"field" text NOT NULL,
	"value" text,
	"valid_from" date NOT NULL,
	"valid_to" date
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"employee_number" text,
	"job_title" text,
	"job_level" text,
	"location" text,
	"hire_date" date,
	"termination_date" date,
	"org_unit_id" uuid,
	"manager_id" uuid,
	"status" "person_status" DEFAULT 'active' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"scope_type" text DEFAULT 'tenant' NOT NULL,
	"scope_id" uuid,
	"scope_person_ids" jsonb
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"default_locale" text DEFAULT 'it' NOT NULL,
	"timezone" text DEFAULT 'Europe/Rome' NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid,
	"email" text NOT NULL,
	"external_subject" text,
	"password_hash" text,
	"last_login_at" timestamp with time zone,
	"disabled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"key_result_id" uuid NOT NULL,
	"author_person_id" uuid,
	"value" numeric(18, 4) NOT NULL,
	"confidence" "confidence" NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"definition_opens_at" date,
	"definition_closes_at" date,
	"lock_at" date,
	"check_in_cadence_days" integer DEFAULT 7 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "kr_type" DEFAULT 'number' NOT NULL,
	"direction" "kr_direction" DEFAULT 'increase' NOT NULL,
	"unit" text,
	"start_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"target_value" numeric(18, 4) DEFAULT '1' NOT NULL,
	"current_value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"weight" numeric(6, 3),
	"owner_person_id" uuid,
	"progress" numeric(6, 4) DEFAULT '0' NOT NULL,
	"confidence" "confidence",
	"last_check_in_at" date,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objective_contributors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"person_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"level" "objective_level" NOT NULL,
	"owner_person_id" uuid,
	"owner_org_unit_id" uuid,
	"parent_id" uuid,
	"status" "objective_status" DEFAULT 'draft' NOT NULL,
	"visibility" "objective_visibility" DEFAULT 'public' NOT NULL,
	"weight" numeric(6, 3),
	"progress_mode" "progress_mode" DEFAULT 'auto' NOT NULL,
	"progress" numeric(6, 4),
	"manual_progress" numeric(6, 4),
	"confidence" "confidence",
	"start_date" date,
	"due_date" date,
	"tags" text[],
	"outcome" "objective_outcome",
	"final_score" numeric(6, 4),
	"closed_note" text,
	"is_development" text
);
--> statement-breakpoint
CREATE INDEX "audit_log_tenant_at_idx" ON "audit_log" USING btree ("tenant_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "naming_overrides_uq" ON "naming_overrides" USING btree ("tenant_id","concept","locale");--> statement-breakpoint
CREATE INDEX "org_units_tenant_idx" ON "org_units" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE INDEX "org_units_path_idx" ON "org_units" USING btree ("tenant_id","path");--> statement-breakpoint
CREATE INDEX "person_history_idx" ON "person_history" USING btree ("tenant_id","person_id","field","valid_from");--> statement-breakpoint
CREATE UNIQUE INDEX "persons_tenant_email_uq" ON "persons" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "persons_tenant_manager_idx" ON "persons" USING btree ("tenant_id","manager_id");--> statement-breakpoint
CREATE INDEX "persons_tenant_org_idx" ON "persons" USING btree ("tenant_id","org_unit_id");--> statement-breakpoint
CREATE INDEX "role_assignments_user_idx" ON "role_assignments" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_email_uq" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "check_ins_kr_idx" ON "check_ins" USING btree ("tenant_id","key_result_id","created_at");--> statement-breakpoint
CREATE INDEX "cycles_tenant_idx" ON "cycles" USING btree ("tenant_id","start_date");--> statement-breakpoint
CREATE INDEX "key_results_objective_idx" ON "key_results" USING btree ("tenant_id","objective_id");--> statement-breakpoint
CREATE INDEX "objective_contributors_idx" ON "objective_contributors" USING btree ("tenant_id","objective_id");--> statement-breakpoint
CREATE INDEX "objectives_tenant_cycle_idx" ON "objectives" USING btree ("tenant_id","cycle_id");--> statement-breakpoint
CREATE INDEX "objectives_tenant_owner_idx" ON "objectives" USING btree ("tenant_id","owner_person_id");--> statement-breakpoint
CREATE INDEX "objectives_tenant_parent_idx" ON "objectives" USING btree ("tenant_id","parent_id");