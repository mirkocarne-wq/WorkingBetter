-- platform_events ha tenant_id facoltativo: la policy lascia leggere tutto al contesto di piattaforma (nessun app.tenant_id impostato)
-- e, in un contesto tenant, solo gli eventi di quel tenant. platform_users non ha tenant_id.
ALTER TABLE platform_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON platform_events USING (coalesce(current_setting('app.tenant_id', true), '') = '' OR tenant_id = app_tenant_id()) WITH CHECK (coalesce(current_setting('app.tenant_id', true), '') = '' OR tenant_id = app_tenant_id());
