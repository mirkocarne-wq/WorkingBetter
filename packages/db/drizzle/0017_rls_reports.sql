ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON saved_reports USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
