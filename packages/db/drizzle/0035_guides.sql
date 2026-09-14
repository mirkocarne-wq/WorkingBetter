CREATE TABLE "guide_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"profile" text NOT NULL,
	"done_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dismissed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "guide_states_uq" ON "guide_states" USING btree ("tenant_id","user_id","profile");--> statement-breakpoint
CREATE INDEX "guide_states_user_idx" ON "guide_states" USING btree ("tenant_id","user_id");