CREATE TYPE "public"."review_cycle_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending_self', 'pending_manager', 'pending_share', 'shared', 'signed', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."review_self_visibility" AS ENUM('immediately', 'after_submit', 'never');--> statement-breakpoint
CREATE TABLE "review_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"okr_cycle_id" uuid,
	"status" "review_cycle_status" DEFAULT 'draft' NOT NULL,
	"population" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"launched_at" timestamp with time zone,
	"self_due_at" date,
	"manager_due_at" date,
	"closed_at" timestamp with time zone,
	"template_snapshot" jsonb
);
--> statement-breakpoint
CREATE TABLE "review_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"self_form_key" text,
	"manager_form_key" text NOT NULL,
	"self_due_days" integer DEFAULT 14 NOT NULL,
	"manager_due_days" integer DEFAULT 21 NOT NULL,
	"manager_sees_self" "review_self_visibility" DEFAULT 'after_submit' NOT NULL,
	"require_signature" boolean DEFAULT true NOT NULL,
	"include_objectives" boolean DEFAULT true NOT NULL,
	"rating_scale" jsonb DEFAULT '{"min":1,"max":5,"labels":{"1":"Non soddisfa","2":"Parzialmente","3":"Soddisfa","4":"Supera","5":"Eccezionale"}}'::jsonb NOT NULL,
	"overall_rating_field" text,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"subject_person_id" uuid NOT NULL,
	"manager_person_id" uuid,
	"status" "review_status" DEFAULT 'pending_self' NOT NULL,
	"self_response_id" uuid,
	"manager_response_id" uuid,
	"self_submitted_at" timestamp with time zone,
	"manager_submitted_at" timestamp with time zone,
	"shared_at" timestamp with time zone,
	"shared_by_person_id" uuid,
	"conversation_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"sign_comment" text,
	"disagreed" boolean DEFAULT false NOT NULL,
	"final_score" numeric(6, 4),
	"final_rating" integer,
	"final_rating_label" text,
	"rating_overridden_by" uuid,
	"rating_override_note" text,
	"objectives_snapshot" jsonb,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "review_cycles_tenant_idx" ON "review_cycles" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "review_templates_tenant_idx" ON "review_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "reviews_cycle_idx" ON "reviews" USING btree ("tenant_id","cycle_id","status");--> statement-breakpoint
CREATE INDEX "reviews_subject_idx" ON "reviews" USING btree ("tenant_id","subject_person_id");--> statement-breakpoint
CREATE INDEX "reviews_manager_idx" ON "reviews" USING btree ("tenant_id","manager_person_id","status");