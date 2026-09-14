ALTER TABLE calibration_sessions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON calibration_sessions USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE review_rating_changes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON review_rating_changes USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
