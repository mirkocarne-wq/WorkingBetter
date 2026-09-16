CREATE TABLE "role_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_role" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "role_definitions_key_uq" ON "role_definitions" USING btree ("tenant_id","key");
