ALTER TABLE "users" ADD COLUMN "calendar_feed_token" text;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "ical_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "one_on_one_relations" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD COLUMN "attachments" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "users_calendar_feed_token_uq" ON "users" USING btree ("calendar_feed_token");