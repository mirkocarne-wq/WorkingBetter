CREATE TABLE "calendar_event_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text,
	"join_url" text,
	"html_link" text,
	"op" text DEFAULT 'upsert' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chat_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"target" text NOT NULL,
	"user_id" uuid,
	"text" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notification_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "connector_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"user_id" uuid,
	"person_id" uuid,
	"external_id" text,
	"display_name" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"scopes" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_used_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "chat" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_links_uq" ON "calendar_event_links" USING btree ("meeting_id","account_id");--> statement-breakpoint
CREATE INDEX "calendar_event_links_pending_idx" ON "calendar_event_links" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "chat_outbox_pending_idx" ON "chat_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_accounts_uq" ON "connector_accounts" USING btree ("tenant_id","provider",coalesce("user_id", '00000000-0000-0000-0000-000000000000'::uuid));