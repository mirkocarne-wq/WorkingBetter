CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"instance_id" uuid,
	"stage_key" text,
	"url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"last_status" integer,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "onboarding_journeys" ADD COLUMN "app_instance_id" uuid;--> statement-breakpoint
ALTER TABLE "onboarding_journeys" ADD COLUMN "external_email" text;--> statement-breakpoint
ALTER TABLE "onboarding_journeys" ADD COLUMN "external_token_hash" text;--> statement-breakpoint
ALTER TABLE "onboarding_journeys" ADD COLUMN "external_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD COLUMN "stage_key" text;--> statement-breakpoint
ALTER TABLE "app_instances" ADD COLUMN "module_link" text;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_pending_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");