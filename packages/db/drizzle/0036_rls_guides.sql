ALTER TABLE guide_states ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON guide_states USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
