CREATE TYPE "public"."action_item_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'done', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('shared', 'private');--> statement-breakpoint
CREATE TYPE "public"."one_on_one_kind" AS ENUM('manager_report', 'mentoring', 'skip_level', 'peer');--> statement-breakpoint
CREATE TYPE "public"."talking_point_source" AS ENUM('manual', 'carry_over', 'objective', 'feedback', 'action_item', 'check_in', 'template');--> statement-breakpoint
CREATE TYPE "public"."feedback_kind" AS ENUM('praise', 'suggestion', 'observation');--> statement-breakpoint
CREATE TYPE "public"."feedback_visibility" AS ENUM('private', 'manager');--> statement-breakpoint
CREATE TYPE "public"."feedback_request_recipient_status" AS ENUM('pending', 'answered', 'declined');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"relation_id" uuid,
	"meeting_id" uuid,
	"owner_person_id" uuid NOT NULL,
	"title" text NOT NULL,
	"due_date" date,
	"status" "action_item_status" DEFAULT 'open' NOT NULL,
	"done_at" timestamp with time zone,
	"source" text DEFAULT 'one_on_one' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"relation_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"visibility" "note_visibility" NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"encrypted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"relation_id" uuid NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_person_id" uuid
);
--> statement-breakpoint
CREATE TABLE "one_on_one_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"kind" "one_on_one_kind" DEFAULT 'manager_report' NOT NULL,
	"cadence_days" integer,
	"duration_min" integer DEFAULT 30 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "talking_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"relation_id" uuid NOT NULL,
	"author_person_id" uuid,
	"text" text NOT NULL,
	"source" "talking_point_source" DEFAULT 'manual' NOT NULL,
	"ref_type" text,
	"ref_id" uuid,
	"discussed" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"carried_from_meeting_id" uuid
);
--> statement-breakpoint
CREATE TABLE "company_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"position" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"from_person_id" uuid NOT NULL,
	"to_person_id" uuid NOT NULL,
	"kind" "feedback_kind" DEFAULT 'praise' NOT NULL,
	"body" text NOT NULL,
	"visibility" "feedback_visibility" DEFAULT 'private' NOT NULL,
	"value_id" uuid,
	"objective_id" uuid,
	"request_recipient_id" uuid,
	"shared_with_manager_at" timestamp with time zone,
	"in_record_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"helpful" boolean
);
--> statement-breakpoint
CREATE TABLE "feedback_request_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" "feedback_request_recipient_status" DEFAULT 'pending' NOT NULL,
	"feedback_id" uuid,
	"decline_reason" text,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"requester_person_id" uuid NOT NULL,
	"about_person_id" uuid NOT NULL,
	"question" text NOT NULL,
	"due_date" date,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recognition_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"recognition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"emoji" text DEFAULT '👏' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recognition_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"recognition_id" uuid NOT NULL,
	"person_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recognition_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"recognition_id" uuid NOT NULL,
	"value_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recognitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"from_person_id" uuid NOT NULL,
	"message" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"hidden_by_user_id" uuid
);
--> statement-breakpoint
CREATE INDEX "action_items_owner_idx" ON "action_items" USING btree ("tenant_id","owner_person_id","status");--> statement-breakpoint
CREATE INDEX "action_items_relation_idx" ON "action_items" USING btree ("tenant_id","relation_id");--> statement-breakpoint
CREATE INDEX "meeting_notes_meeting_idx" ON "meeting_notes" USING btree ("tenant_id","meeting_id","visibility");--> statement-breakpoint
CREATE INDEX "meetings_relation_idx" ON "meetings" USING btree ("tenant_id","relation_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "one_on_one_relations_a_idx" ON "one_on_one_relations" USING btree ("tenant_id","person_a_id");--> statement-breakpoint
CREATE INDEX "one_on_one_relations_b_idx" ON "one_on_one_relations" USING btree ("tenant_id","person_b_id");--> statement-breakpoint
CREATE INDEX "talking_points_meeting_idx" ON "talking_points" USING btree ("tenant_id","meeting_id");--> statement-breakpoint
CREATE INDEX "company_values_tenant_idx" ON "company_values" USING btree ("tenant_id","position");--> statement-breakpoint
CREATE INDEX "feedback_to_idx" ON "feedback" USING btree ("tenant_id","to_person_id","created_at");--> statement-breakpoint
CREATE INDEX "feedback_from_idx" ON "feedback" USING btree ("tenant_id","from_person_id");--> statement-breakpoint
CREATE INDEX "feedback_request_recipients_person_idx" ON "feedback_request_recipients" USING btree ("tenant_id","person_id","status");--> statement-breakpoint
CREATE INDEX "feedback_request_recipients_request_idx" ON "feedback_request_recipients" USING btree ("tenant_id","request_id");--> statement-breakpoint
CREATE INDEX "feedback_requests_about_idx" ON "feedback_requests" USING btree ("tenant_id","about_person_id");--> statement-breakpoint
CREATE INDEX "recognition_reactions_rec_idx" ON "recognition_reactions" USING btree ("tenant_id","recognition_id");--> statement-breakpoint
CREATE INDEX "recognition_recipients_person_idx" ON "recognition_recipients" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "recognition_recipients_rec_idx" ON "recognition_recipients" USING btree ("tenant_id","recognition_id");--> statement-breakpoint
CREATE INDEX "recognition_values_rec_idx" ON "recognition_values" USING btree ("tenant_id","recognition_id");--> statement-breakpoint
CREATE INDEX "recognitions_tenant_created_idx" ON "recognitions" USING btree ("tenant_id","created_at");