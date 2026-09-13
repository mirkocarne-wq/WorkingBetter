CREATE TABLE "mart_person_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"person_id" uuid NOT NULL,
	"manager_id" uuid,
	"org_unit_id" uuid,
	"org_path" text DEFAULT '' NOT NULL,
	"cycle_id" uuid,
	"fact_key" text NOT NULL,
	"value" numeric(18, 4) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "mart_person_facts_day_idx" ON "mart_person_facts" USING btree ("tenant_id","snapshot_date","fact_key");--> statement-breakpoint
CREATE INDEX "mart_person_facts_person_idx" ON "mart_person_facts" USING btree ("tenant_id","person_id","snapshot_date");