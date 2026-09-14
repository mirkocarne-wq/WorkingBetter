CREATE TYPE "public"."welfare_movement_kind" AS ENUM('credit', 'reserve', 'release', 'spend', 'refund', 'expire', 'adjust');--> statement-breakpoint
CREATE TYPE "public"."welfare_plan_status" AS ENUM('draft', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."welfare_request_status" AS ENUM('submitted', 'in_review', 'needs_docs', 'approved', 'in_payroll', 'paid', 'fulfilled', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TABLE "welfare_budget_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'on_top' NOT NULL,
	"amount_per_person" numeric(12, 2) DEFAULT '0' NOT NULL,
	"credit_at" date NOT NULL,
	"expires_at" date,
	"credited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "welfare_catalog_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category_key" text NOT NULL,
	"kind" text DEFAULT 'reimbursement' NOT NULL,
	"price" numeric(12, 2),
	"min_amount" numeric(12, 2),
	"max_amount" numeric(12, 2),
	"provider" text DEFAULT 'internal' NOT NULL,
	"instructions" text,
	"available" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"regime" text DEFAULT 'exempt' NOT NULL,
	"beneficiaries" jsonb DEFAULT '["self"]'::jsonb NOT NULL,
	"required_docs" text,
	"note" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"key" text NOT NULL,
	"value" boolean NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_initiative_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"initiative_id" uuid NOT NULL,
	"person_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_initiatives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"conditions" text,
	"how_to" text,
	"kind" text DEFAULT 'convention' NOT NULL,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welfare_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"plan_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "welfare_movement_kind" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"year" integer NOT NULL,
	"category_key" text,
	"source_id" uuid,
	"request_id" uuid,
	"expires_at" date,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "welfare_payroll_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"period" text NOT NULL,
	"status" text DEFAULT 'exported' NOT NULL,
	"items_count" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"exported_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "welfare_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"year" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"population" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"regulation" text,
	"rollover_rule" text DEFAULT 'none' NOT NULL,
	"rollover_percent" integer DEFAULT 0 NOT NULL,
	"enabled_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"premium" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL,
	"status" "welfare_plan_status" DEFAULT 'draft' NOT NULL,
	"activated_at" timestamp with time zone,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "welfare_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"item_id" uuid,
	"kind" text DEFAULT 'reimbursement' NOT NULL,
	"category_key" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"beneficiary" text DEFAULT 'self' NOT NULL,
	"beneficiary_name" text,
	"expense_date" date,
	"attachment_name" text,
	"declaration_accepted" boolean DEFAULT false NOT NULL,
	"note" text,
	"status" "welfare_request_status" DEFAULT 'submitted' NOT NULL,
	"taxable_portion" numeric(12, 2) DEFAULT '0' NOT NULL,
	"reviewer_user_id" uuid,
	"review_note" text,
	"decided_at" timestamp with time zone,
	"payroll_batch_id" uuid,
	"voucher_code" text,
	"fulfilled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "welfare_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"tenant_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"category_key" text NOT NULL,
	"condition" text,
	"amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "welfare_sources_plan_idx" ON "welfare_budget_sources" USING btree ("tenant_id","plan_id");--> statement-breakpoint
CREATE INDEX "welfare_catalog_tenant_idx" ON "welfare_catalog_items" USING btree ("tenant_id","available");--> statement-breakpoint
CREATE UNIQUE INDEX "welfare_categories_key_uq" ON "welfare_categories" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "welfare_declarations_uq" ON "welfare_declarations" USING btree ("tenant_id","person_id","year","key");--> statement-breakpoint
CREATE UNIQUE INDEX "welfare_initiative_members_uq" ON "welfare_initiative_members" USING btree ("initiative_id","person_id");--> statement-breakpoint
CREATE INDEX "welfare_initiatives_tenant_idx" ON "welfare_initiatives" USING btree ("tenant_id","active");--> statement-breakpoint
CREATE INDEX "welfare_movements_person_idx" ON "welfare_movements" USING btree ("tenant_id","person_id","year");--> statement-breakpoint
CREATE INDEX "welfare_movements_plan_idx" ON "welfare_movements" USING btree ("tenant_id","plan_id");--> statement-breakpoint
CREATE INDEX "welfare_payroll_tenant_idx" ON "welfare_payroll_batches" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "welfare_plans_tenant_idx" ON "welfare_plans" USING btree ("tenant_id","year","status");--> statement-breakpoint
CREATE INDEX "welfare_requests_person_idx" ON "welfare_requests" USING btree ("tenant_id","person_id");--> statement-breakpoint
CREATE INDEX "welfare_requests_status_idx" ON "welfare_requests" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "welfare_thresholds_year_idx" ON "welfare_thresholds" USING btree ("tenant_id","year","category_key");