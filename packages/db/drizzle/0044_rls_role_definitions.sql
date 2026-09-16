ALTER TABLE role_definitions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON role_definitions USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
