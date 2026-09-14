CREATE TYPE "public"."calibration_session_status" AS ENUM('open', 'locked');--> statement-breakpoint
ALTER TYPE "public"."review_status" ADD VALUE 'pending_approval' BEFORE 'pending_share';--> statement-breakpoint
CREATE TABLE "calibration_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"org_unit_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"participant_person_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"facilitator_person_id" uuid,
	"expected_distribution" jsonb,
	"notes" text,
	"status" "calibration_session_status" DEFAULT 'open' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by_person_id" uuid
);
--> statement-breakpoint
CREATE TABLE "review_rating_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"session_id" uuid,
	"from_rating" integer,
	"to_rating" integer,
	"from_potential" integer,
	"to_potential" integer,
	"note" text NOT NULL,
	"by_person_id" uuid
);
--> statement-breakpoint
ALTER TABLE "review_templates" ADD COLUMN "approval_chain" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "proposed_rating" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "potential" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "calibrated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "calibration_session_id" uuid;--> statement-breakpoint
CREATE INDEX "calibration_sessions_cycle_idx" ON "calibration_sessions" USING btree ("tenant_id","cycle_id");--> statement-breakpoint
CREATE INDEX "review_rating_changes_review_idx" ON "review_rating_changes" USING btree ("tenant_id","review_id");