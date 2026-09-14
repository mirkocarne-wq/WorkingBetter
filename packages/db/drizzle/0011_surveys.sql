CREATE TYPE "public"."survey_status" AS ENUM('draft', 'open', 'closed', 'shared');--> statement-breakpoint
CREATE TABLE "survey_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"responded_at" timestamp with time zone,
	"reminded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"person_id" uuid,
	"org_unit_id" uuid,
	"org_path" text DEFAULT '' NOT NULL,
	"manager_id" uuid,
	"tenure_band" text,
	"score" numeric(6, 4)
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" text DEFAULT 'engagement' NOT NULL,
	"form_definition_id" uuid NOT NULL,
	"anonymous" boolean DEFAULT true NOT NULL,
	"anonymity_threshold" integer DEFAULT 5 NOT NULL,
	"population" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "survey_status" DEFAULT 'draft' NOT NULL,
	"closes_at" timestamp with time zone,
	"launched_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"drivers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enps_field" text,
	"summary" text,
	"rotation" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "survey_invitations_uq" ON "survey_invitations" USING btree ("survey_id","person_id");--> statement-breakpoint
CREATE INDEX "survey_invitations_person_idx" ON "survey_invitations" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "survey_responses_survey_idx" ON "survey_responses" USING btree ("tenant_id","survey_id");--> statement-breakpoint
CREATE INDEX "surveys_tenant_status_idx" ON "surveys" USING btree ("tenant_id","status");