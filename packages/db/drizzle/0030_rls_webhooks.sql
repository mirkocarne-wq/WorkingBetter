ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON webhook_deliveries USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
