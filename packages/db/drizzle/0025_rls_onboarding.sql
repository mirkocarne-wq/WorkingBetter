ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON onboarding_templates USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE onboarding_journeys ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON onboarding_journeys USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE onboarding_tasks ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON onboarding_tasks USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());--> statement-breakpoint
ALTER TABLE onboarding_survey_responses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON onboarding_survey_responses USING (tenant_id = app_tenant_id()) WITH CHECK (tenant_id = app_tenant_id());
