ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON automation_rules USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON automation_runs USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
