CREATE TABLE "form_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"min" integer DEFAULT 1 NOT NULL,
	"max" integer DEFAULT 5 NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allow_na" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "form_scales_key_uq" ON "form_scales" USING btree ("tenant_id","key");
