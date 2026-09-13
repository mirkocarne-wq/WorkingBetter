CREATE TABLE "saved_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"folder" text,
	"definition" jsonb NOT NULL,
	"sharing" jsonb DEFAULT '{"roles":[],"userIds":[]}'::jsonb NOT NULL,
	"schedule" jsonb,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "saved_reports_owner_idx" ON "saved_reports" USING btree ("tenant_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "saved_reports_next_run_idx" ON "saved_reports" USING btree ("next_run_at");