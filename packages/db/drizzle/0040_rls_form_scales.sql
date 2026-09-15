ALTER TABLE form_scales ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON form_scales USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
