ALTER TABLE mart_person_facts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON mart_person_facts USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
