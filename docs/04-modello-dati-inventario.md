# 04-bis — Inventario delle tabelle

> Generato da `pnpm docs:generate` dallo schema Drizzle (`packages/db/src/schema`). **Non modificare a mano.** 70 tabelle; ogni tabella con `tenant_id` ha Row-Level Security e policy `tenant_isolation` (verificato da `packages/db/src/rls.test.ts`). Le migrazioni SQL sono in `packages/db/drizzle`.

Colonne comuni alle tabelle multi-tenant: `id` (uuid), `tenant_id`, `created_at`, `updated_at`, `created_by`.

## Core

### `tenants`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | not null, default, PK |
| `created_at` | timestamptz | not null, default |
| `updated_at` | timestamptz | not null, default |
| `created_by` | uuid |  |
| `name` | text | not null |
| `slug` | text | not null |
| `default_locale` | text | not null, default |
| `timezone` | text | not null, default |
| `currency` | text | not null, default |
| `settings` | jsonb | not null, default |
| `status` | text | not null, default |

### `org_units`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `code` | text |  |
| `parent_id` | uuid |  |
| `path` | text | not null, default |
| `archived_at` | timestamptz |  |

Indici: `org_units_tenant_idx`, `org_units_path_idx`

### `persons`

| Colonna | Tipo | Note |
|---|---|---|
| `first_name` | text | not null |
| `last_name` | text | not null |
| `email` | text |  |
| `employee_number` | text |  |
| `job_title` | text |  |
| `job_level` | text |  |
| `job_profile_id` | uuid |  |
| `location` | text |  |
| `hire_date` | date |  |
| `termination_date` | date |  |
| `org_unit_id` | uuid |  |
| `manager_id` | uuid |  |
| `status` | person_status | not null, default |
| `custom_fields` | jsonb | not null, default |

Indici: `persons_tenant_email_uq`, `persons_tenant_manager_idx`, `persons_tenant_org_idx`

### `users`

| Colonna | Tipo | Note |
|---|---|---|
| `person_id` | uuid |  |
| `email` | text | not null |
| `external_subject` | text |  |
| `password_hash` | text |  |
| `last_login_at` | timestamptz |  |
| `disabled_at` | timestamptz |  |
| `invited_at` | timestamptz |  |
| `invite_token_hash` | text |  |
| `invite_expires_at` | timestamptz |  |
| `invite_accepted_at` | timestamptz |  |
| `reset_token_hash` | text |  |
| `reset_expires_at` | timestamptz |  |
| `password_updated_at` | timestamptz |  |
| `failed_logins` | integer | not null, default |
| `locked_until` | timestamptz |  |
| `auth_provider` | text |  |
| `mfa_secret_enc` | text |  |
| `mfa_pending_secret_enc` | text |  |
| `mfa_enabled_at` | timestamptz |  |
| `mfa_recovery_hashes` | jsonb |  |
| `sessions_revoked_at` | timestamptz |  |
| `calendar_feed_token` | text |  |

Indici: `users_tenant_email_uq`, `users_calendar_feed_token_uq`

### `person_history`

| Colonna | Tipo | Note |
|---|---|---|
| `person_id` | uuid | not null |
| `field` | text | not null |
| `value` | text |  |
| `valid_from` | date | not null |
| `valid_to` | date |  |

Indici: `person_history_idx`

### `role_assignments`

| Colonna | Tipo | Note |
|---|---|---|
| `user_id` | uuid | not null |
| `role` | text | not null |
| `scope_type` | text | not null, default |
| `scope_id` | uuid |  |
| `scope_person_ids` | jsonb |  |

Indici: `role_assignments_user_idx`

### `naming_overrides`

| Colonna | Tipo | Note |
|---|---|---|
| `concept` | text | not null |
| `locale` | text | not null |
| `singular` | text | not null |
| `plural` | text | not null |

Indici: `naming_overrides_uq`

### `audit_log`

| Colonna | Tipo | Note |
|---|---|---|
| `at` | timestamptz | not null, default |
| `actor_user_id` | uuid |  |
| `action` | text | not null |
| `entity_type` | text | not null |
| `entity_id` | uuid |  |
| `before` | jsonb |  |
| `after` | jsonb |  |
| `ip` | text |  |
| `user_agent` | text |  |
| `request_id` | text |  |

Indici: `audit_log_tenant_at_idx`, `audit_log_entity_idx`

## Obiettivi (OKR)

### `cycles`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `start_date` | date | not null |
| `end_date` | date | not null |
| `definition_opens_at` | date |  |
| `definition_closes_at` | date |  |
| `lock_at` | date |  |
| `check_in_cadence_days` | integer | not null, default |
| `status` | text | not null, default |

Indici: `cycles_tenant_idx`

### `objectives`

| Colonna | Tipo | Note |
|---|---|---|
| `cycle_id` | uuid | not null |
| `title` | text | not null |
| `description` | text |  |
| `level` | objective_level | not null |
| `owner_person_id` | uuid |  |
| `owner_org_unit_id` | uuid |  |
| `parent_id` | uuid |  |
| `status` | objective_status | not null, default |
| `visibility` | objective_visibility | not null, default |
| `weight` | numeric(6, 3) |  |
| `progress_mode` | progress_mode | not null, default |
| `progress` | numeric(6, 4) |  |
| `manual_progress` | numeric(6, 4) |  |
| `confidence` | confidence |  |
| `start_date` | date |  |
| `due_date` | date |  |
| `tags` | text[] |  |
| `outcome` | objective_outcome |  |
| `final_score` | numeric(6, 4) |  |
| `closed_note` | text |  |
| `is_development` | text |  |

Indici: `objectives_tenant_cycle_idx`, `objectives_tenant_owner_idx`, `objectives_tenant_parent_idx`

### `key_results`

| Colonna | Tipo | Note |
|---|---|---|
| `objective_id` | uuid | not null |
| `title` | text | not null |
| `type` | kr_type | not null, default |
| `direction` | kr_direction | not null, default |
| `unit` | text |  |
| `start_value` | numeric(18, 4) | not null, default |
| `target_value` | numeric(18, 4) | not null, default |
| `current_value` | numeric(18, 4) | not null, default |
| `weight` | numeric(6, 3) |  |
| `owner_person_id` | uuid |  |
| `progress` | numeric(6, 4) | not null, default |
| `confidence` | confidence |  |
| `last_check_in_at` | date |  |
| `position` | integer | not null, default |

Indici: `key_results_objective_idx`

### `check_ins`

| Colonna | Tipo | Note |
|---|---|---|
| `key_result_id` | uuid | not null |
| `author_person_id` | uuid |  |
| `value` | numeric(18, 4) | not null |
| `confidence` | confidence | not null |
| `comment` | text |  |

Indici: `check_ins_kr_idx`

### `objective_contributors`

| Colonna | Tipo | Note |
|---|---|---|
| `objective_id` | uuid | not null |
| `person_id` | uuid | not null |

Indici: `objective_contributors_idx`

## 1:1 (ONE)

### `one_on_one_relations`

| Colonna | Tipo | Note |
|---|---|---|
| `person_a_id` | uuid | not null |
| `person_b_id` | uuid | not null |
| `kind` | one_on_one_kind | not null, default |
| `cadence_days` | integer |  |
| `duration_min` | integer | not null, default |
| `meeting_url` | text |  |
| `archived_at` | timestamptz |  |

Indici: `one_on_one_relations_a_idx`, `one_on_one_relations_b_idx`

### `meetings`

| Colonna | Tipo | Note |
|---|---|---|
| `relation_id` | uuid | not null |
| `scheduled_at` | timestamptz | not null |
| `duration_min` | integer | not null, default |
| `status` | meeting_status | not null, default |
| `completed_at` | timestamptz |  |
| `completed_by_person_id` | uuid |  |
| `ical_sequence` | integer | not null, default |

Indici: `meetings_relation_idx`

### `talking_points`

| Colonna | Tipo | Note |
|---|---|---|
| `meeting_id` | uuid | not null |
| `relation_id` | uuid | not null |
| `author_person_id` | uuid |  |
| `text` | text | not null |
| `source` | talking_point_source | not null, default |
| `ref_type` | text |  |
| `ref_id` | uuid |  |
| `discussed` | boolean | not null, default |
| `position` | integer | not null, default |
| `carried_from_meeting_id` | uuid |  |

Indici: `talking_points_meeting_idx`

### `meeting_notes`

| Colonna | Tipo | Note |
|---|---|---|
| `meeting_id` | uuid | not null |
| `relation_id` | uuid | not null |
| `author_person_id` | uuid | not null |
| `visibility` | note_visibility | not null |
| `body` | text | not null, default |
| `encrypted` | boolean | not null, default |

Indici: `meeting_notes_meeting_idx`

### `action_items`

| Colonna | Tipo | Note |
|---|---|---|
| `relation_id` | uuid |  |
| `meeting_id` | uuid |  |
| `owner_person_id` | uuid | not null |
| `title` | text | not null |
| `due_date` | date |  |
| `status` | action_item_status | not null, default |
| `done_at` | timestamptz |  |
| `source` | text | not null, default |

Indici: `action_items_owner_idx`, `action_items_relation_idx`

## Feedback e riconoscimenti (FBK)

### `company_values`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `description` | text |  |
| `icon` | text |  |
| `position` | integer | not null, default |
| `active` | boolean | not null, default |

Indici: `company_values_tenant_idx`

### `feedback`

| Colonna | Tipo | Note |
|---|---|---|
| `from_person_id` | uuid | not null |
| `to_person_id` | uuid | not null |
| `kind` | feedback_kind | not null, default |
| `body` | text | not null |
| `visibility` | feedback_visibility | not null, default |
| `value_id` | uuid |  |
| `objective_id` | uuid |  |
| `request_recipient_id` | uuid |  |
| `shared_with_manager_at` | timestamptz |  |
| `in_record_at` | timestamptz |  |
| `acknowledged_at` | timestamptz |  |
| `helpful` | boolean |  |

Indici: `feedback_to_idx`, `feedback_from_idx`

### `feedback_requests`

| Colonna | Tipo | Note |
|---|---|---|
| `requester_person_id` | uuid | not null |
| `about_person_id` | uuid | not null |
| `question` | text | not null |
| `due_date` | date |  |
| `closed_at` | timestamptz |  |

Indici: `feedback_requests_about_idx`

### `feedback_request_recipients`

| Colonna | Tipo | Note |
|---|---|---|
| `request_id` | uuid | not null |
| `person_id` | uuid | not null |
| `status` | feedback_request_recipient_status | not null, default |
| `feedback_id` | uuid |  |
| `decline_reason` | text |  |
| `responded_at` | timestamptz |  |

Indici: `feedback_request_recipients_person_idx`, `feedback_request_recipients_request_idx`

### `recognitions`

| Colonna | Tipo | Note |
|---|---|---|
| `from_person_id` | uuid | not null |
| `message` | text | not null |
| `hidden_at` | timestamptz |  |
| `hidden_by_user_id` | uuid |  |

Indici: `recognitions_tenant_created_idx`

### `recognition_recipients`

| Colonna | Tipo | Note |
|---|---|---|
| `recognition_id` | uuid | not null |
| `person_id` | uuid | not null |

Indici: `recognition_recipients_person_idx`, `recognition_recipients_rec_idx`

### `recognition_values`

| Colonna | Tipo | Note |
|---|---|---|
| `recognition_id` | uuid | not null |
| `value_id` | uuid | not null |

Indici: `recognition_values_rec_idx`

### `recognition_reactions`

| Colonna | Tipo | Note |
|---|---|---|
| `recognition_id` | uuid | not null |
| `person_id` | uuid | not null |
| `emoji` | text | not null, default |

Indici: `recognition_reactions_rec_idx`

## Notifiche e job (INT)

### `notifications`

| Colonna | Tipo | Note |
|---|---|---|
| `user_id` | uuid | not null |
| `person_id` | uuid |  |
| `type` | text | not null |
| `title` | text | not null |
| `body` | text | not null, default |
| `link` | text |  |
| `data` | jsonb | not null, default |
| `dedupe_key` | text |  |
| `read_at` | timestamptz |  |
| `email_queued` | boolean | not null, default |

Indici: `notifications_user_idx`, `notifications_dedupe_uq`

### `notification_preferences`

| Colonna | Tipo | Note |
|---|---|---|
| `user_id` | uuid | not null |
| `type` | text | not null |
| `in_app` | boolean | not null, default |
| `email` | boolean | not null, default |

Indici: `notification_preferences_uq`

### `email_outbox`

| Colonna | Tipo | Note |
|---|---|---|
| `notification_id` | uuid |  |
| `to_email` | text | not null |
| `to_name` | text |  |
| `subject` | text | not null |
| `text` | text | not null |
| `html` | text |  |
| `attachments` | jsonb |  |
| `status` | email_status | not null, default |
| `attempts` | integer | not null, default |
| `last_error` | text |  |
| `sent_at` | timestamptz |  |
| `scheduled_for` | timestamptz | not null, default |

Indici: `email_outbox_status_idx`

### `job_runs`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | uuid | not null, default, PK |
| `job` | text | not null |
| `started_at` | timestamptz | not null, default |
| `finished_at` | timestamptz |  |
| `ok` | boolean |  |
| `summary` | jsonb |  |
| `error` | text |  |

Indici: `job_runs_job_idx`

## Form engine (APP)

### `form_definitions`

| Colonna | Tipo | Note |
|---|---|---|
| `key` | text | not null |
| `name` | text | not null |
| `kind` | text | not null, default |
| `version` | integer | not null, default |
| `status` | form_status | not null, default |
| `schema` | jsonb | not null |
| `published_at` | timestamptz |  |
| `parent_id` | uuid |  |

Indici: `form_definitions_key_version_uq`, `form_definitions_status_idx`

### `form_responses`

| Colonna | Tipo | Note |
|---|---|---|
| `form_definition_id` | uuid | not null |
| `form_key` | text | not null |
| `form_version` | integer | not null |
| `respondent_person_id` | uuid |  |
| `subject_person_id` | uuid |  |
| `context_type` | text |  |
| `context_id` | uuid |  |
| `status` | form_response_status | not null, default |
| `answers` | jsonb | not null, default |
| `score` | numeric(6, 4) |  |
| `section_scores` | jsonb |  |
| `submitted_at` | timestamptz |  |
| `due_date` | timestamptz |  |

Indici: `form_responses_def_idx`, `form_responses_respondent_idx`, `form_responses_context_idx`

### `form_answers`

| Colonna | Tipo | Note |
|---|---|---|
| `response_id` | uuid | not null |
| `form_key` | text | not null |
| `section_key` | text | not null |
| `field_key` | text | not null |
| `field_type` | text | not null |
| `value_number` | numeric(18, 4) |  |
| `value_text` | text |  |
| `value_options` | text[] |  |
| `subject_person_id` | uuid |  |

Indici: `form_answers_response_idx`, `form_answers_field_idx`

## Performance review (REV)

### `review_templates`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `description` | text |  |
| `self_form_key` | text |  |
| `manager_form_key` | text | not null |
| `self_due_days` | integer | not null, default |
| `manager_due_days` | integer | not null, default |
| `manager_sees_self` | review_self_visibility | not null, default |
| `require_signature` | boolean | not null, default |
| `include_objectives` | boolean | not null, default |
| `rating_scale` | jsonb | not null, default |
| `overall_rating_field` | text |  |
| `archived_at` | timestamptz |  |

Indici: `review_templates_tenant_idx`

### `review_cycles`

| Colonna | Tipo | Note |
|---|---|---|
| `template_id` | uuid | not null |
| `name` | text | not null |
| `period_start` | date | not null |
| `period_end` | date | not null |
| `okr_cycle_id` | uuid |  |
| `status` | review_cycle_status | not null, default |
| `population` | jsonb | not null, default |
| `launched_at` | timestamptz |  |
| `self_due_at` | date |  |
| `manager_due_at` | date |  |
| `closed_at` | timestamptz |  |
| `template_snapshot` | jsonb |  |

Indici: `review_cycles_tenant_idx`

### `reviews`

| Colonna | Tipo | Note |
|---|---|---|
| `cycle_id` | uuid | not null |
| `subject_person_id` | uuid | not null |
| `manager_person_id` | uuid |  |
| `status` | review_status | not null, default |
| `self_response_id` | uuid |  |
| `manager_response_id` | uuid |  |
| `self_submitted_at` | timestamptz |  |
| `manager_submitted_at` | timestamptz |  |
| `shared_at` | timestamptz |  |
| `shared_by_person_id` | uuid |  |
| `conversation_at` | timestamptz |  |
| `signed_at` | timestamptz |  |
| `sign_comment` | text |  |
| `disagreed` | boolean | not null, default |
| `final_score` | numeric(6, 4) |  |
| `final_rating` | integer |  |
| `final_rating_label` | text |  |
| `rating_overridden_by` | uuid |  |
| `rating_override_note` | text |  |
| `objectives_snapshot` | jsonb |  |
| `closed_at` | timestamptz |  |
| `app_instance_id` | uuid |  |

Indici: `reviews_cycle_idx`, `reviews_subject_idx`, `reviews_manager_idx`

## Survey (ENG)

### `surveys`

| Colonna | Tipo | Note |
|---|---|---|
| `title` | text | not null |
| `description` | text |  |
| `kind` | text | not null, default |
| `form_definition_id` | uuid | not null |
| `anonymous` | boolean | not null, default |
| `anonymity_threshold` | integer | not null, default |
| `population` | jsonb | not null, default |
| `status` | survey_status | not null, default |
| `closes_at` | timestamptz |  |
| `launched_at` | timestamptz |  |
| `closed_at` | timestamptz |  |
| `shared_at` | timestamptz |  |
| `drivers` | jsonb | not null, default |
| `enps_field` | text |  |
| `summary` | text |  |
| `rotation` | integer | not null, default |

Indici: `surveys_tenant_status_idx`

### `survey_invitations`

| Colonna | Tipo | Note |
|---|---|---|
| `survey_id` | uuid | not null |
| `person_id` | uuid | not null |
| `responded_at` | timestamptz |  |
| `reminded_at` | timestamptz |  |

Indici: `survey_invitations_uq`, `survey_invitations_person_idx`

### `survey_responses`

| Colonna | Tipo | Note |
|---|---|---|
| `survey_id` | uuid | not null |
| `submitted_at` | timestamptz | not null, default |
| `answers` | jsonb | not null, default |
| `person_id` | uuid |  |
| `org_unit_id` | uuid |  |
| `org_path` | text | not null, default |
| `manager_id` | uuid |  |
| `tenure_band` | text |  |
| `score` | numeric(6, 4) |  |

Indici: `survey_responses_survey_idx`

## Welfare (WEL)

### `welfare_plans`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `year` | integer | not null |
| `period_start` | date | not null |
| `period_end` | date | not null |
| `population` | jsonb | not null, default |
| `regulation` | text |  |
| `rollover_rule` | text | not null, default |
| `rollover_percent` | integer | not null, default |
| `enabled_categories` | jsonb | not null, default |
| `premium` | jsonb | not null, default |
| `status` | welfare_plan_status | not null, default |
| `activated_at` | timestamptz |  |
| `closed_at` | timestamptz |  |

Indici: `welfare_plans_tenant_idx`

### `welfare_budget_sources`

| Colonna | Tipo | Note |
|---|---|---|
| `plan_id` | uuid | not null |
| `name` | text | not null |
| `kind` | text | not null, default |
| `amount_per_person` | numeric(12, 2) | not null, default |
| `credit_at` | date | not null |
| `expires_at` | date |  |
| `credited_at` | timestamptz |  |

Indici: `welfare_sources_plan_idx`

### `welfare_movements`

| Colonna | Tipo | Note |
|---|---|---|
| `plan_id` | uuid | not null |
| `person_id` | uuid | not null |
| `kind` | welfare_movement_kind | not null |
| `amount` | numeric(12, 2) | not null |
| `year` | integer | not null |
| `category_key` | text |  |
| `source_id` | uuid |  |
| `request_id` | uuid |  |
| `expires_at` | date |  |
| `note` | text |  |

Indici: `welfare_movements_person_idx`, `welfare_movements_plan_idx`

### `welfare_categories`

| Colonna | Tipo | Note |
|---|---|---|
| `key` | text | not null |
| `name` | text | not null |
| `description` | text |  |
| `regime` | text | not null, default |
| `beneficiaries` | jsonb | not null, default |
| `required_docs` | text |  |
| `note` | text |  |
| `active` | boolean | not null, default |

Indici: `welfare_categories_key_uq`

### `welfare_thresholds`

| Colonna | Tipo | Note |
|---|---|---|
| `year` | integer | not null |
| `category_key` | text | not null |
| `condition` | text |  |
| `amount` | numeric(12, 2) | not null |

Indici: `welfare_thresholds_year_idx`

### `welfare_catalog_items`

| Colonna | Tipo | Note |
|---|---|---|
| `plan_id` | uuid |  |
| `name` | text | not null |
| `description` | text |  |
| `category_key` | text | not null |
| `kind` | text | not null, default |
| `price` | numeric(12, 2) |  |
| `min_amount` | numeric(12, 2) |  |
| `max_amount` | numeric(12, 2) |  |
| `provider` | text | not null, default |
| `instructions` | text |  |
| `available` | boolean | not null, default |

Indici: `welfare_catalog_tenant_idx`

### `welfare_requests`

| Colonna | Tipo | Note |
|---|---|---|
| `plan_id` | uuid | not null |
| `person_id` | uuid | not null |
| `item_id` | uuid |  |
| `kind` | text | not null, default |
| `category_key` | text | not null |
| `amount` | numeric(12, 2) | not null |
| `beneficiary` | text | not null, default |
| `beneficiary_name` | text |  |
| `expense_date` | date |  |
| `attachment_name` | text |  |
| `declaration_accepted` | boolean | not null, default |
| `note` | text |  |
| `status` | welfare_request_status | not null, default |
| `taxable_portion` | numeric(12, 2) | not null, default |
| `reviewer_user_id` | uuid |  |
| `review_note` | text |  |
| `decided_at` | timestamptz |  |
| `payroll_batch_id` | uuid |  |
| `voucher_code` | text |  |
| `fulfilled_at` | timestamptz |  |

Indici: `welfare_requests_person_idx`, `welfare_requests_status_idx`

### `welfare_declarations`

| Colonna | Tipo | Note |
|---|---|---|
| `person_id` | uuid | not null |
| `year` | integer | not null |
| `key` | text | not null |
| `value` | boolean | not null |
| `declared_at` | timestamptz | not null, default |

Indici: `welfare_declarations_uq`

### `welfare_initiatives`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `description` | text |  |
| `conditions` | text |  |
| `how_to` | text |  |
| `kind` | text | not null, default |
| `capacity` | integer |  |
| `active` | boolean | not null, default |

Indici: `welfare_initiatives_tenant_idx`

### `welfare_initiative_members`

| Colonna | Tipo | Note |
|---|---|---|
| `initiative_id` | uuid | not null |
| `person_id` | uuid | not null |

Indici: `welfare_initiative_members_uq`

### `welfare_payroll_batches`

| Colonna | Tipo | Note |
|---|---|---|
| `period` | text | not null |
| `status` | text | not null, default |
| `items_count` | integer | not null, default |
| `total_amount` | numeric(12, 2) | not null, default |
| `exported_at` | timestamptz |  |
| `confirmed_at` | timestamptz |  |

Indici: `welfare_payroll_tenant_idx`

- `welfare_payroll_items`: **non trovata nello schema**

## Reportistica (ANA)

### `mart_person_facts`

| Colonna | Tipo | Note |
|---|---|---|
| `snapshot_date` | date | not null |
| `person_id` | uuid | not null |
| `manager_id` | uuid |  |
| `org_unit_id` | uuid |  |
| `org_path` | text | not null, default |
| `cycle_id` | uuid |  |
| `fact_key` | text | not null |
| `value` | numeric(18, 4) | not null |

Indici: `mart_person_facts_day_idx`, `mart_person_facts_person_idx`

### `saved_reports`

| Colonna | Tipo | Note |
|---|---|---|
| `owner_user_id` | uuid | not null |
| `name` | text | not null |
| `description` | text |  |
| `folder` | text |  |
| `definition` | jsonb | not null |
| `sharing` | jsonb | not null, default |
| `schedule` | jsonb |  |
| `next_run_at` | timestamptz |  |
| `last_run_at` | timestamptz |  |

Indici: `saved_reports_owner_idx`, `saved_reports_next_run_idx`

## Sviluppo e carriera (DEV)

### `competencies`

| Colonna | Tipo | Note |
|---|---|---|
| `key` | text | not null |
| `name` | text | not null |
| `kind` | competency_kind | not null, default |
| `description` | text |  |
| `levels` | jsonb | not null, default |
| `active` | boolean | not null, default |

Indici: `competencies_key_uq`

### `job_profiles`

| Colonna | Tipo | Note |
|---|---|---|
| `title` | text | not null |
| `family` | text |  |
| `level` | text |  |
| `description` | text |  |
| `expected` | jsonb | not null, default |
| `next_profile_id` | uuid |  |
| `active` | boolean | not null, default |

Indici: `job_profiles_tenant_idx`

### `competency_assessments`

| Colonna | Tipo | Note |
|---|---|---|
| `person_id` | uuid | not null |
| `competency_key` | text | not null |
| `source` | assessment_source | not null |
| `level` | integer | not null |
| `note` | text |  |
| `assessed_by_person_id` | uuid |  |
| `assessed_at` | timestamptz | not null, default |

Indici: `competency_assessments_person_idx`

### `development_plans`

| Colonna | Tipo | Note |
|---|---|---|
| `person_id` | uuid | not null |
| `title` | text | not null |
| `status` | dev_plan_status | not null, default |
| `period_start` | date |  |
| `period_end` | date |  |
| `submitted_at` | timestamptz |  |
| `approved_at` | timestamptz |  |
| `approved_by_person_id` | uuid |  |
| `manager_note` | text |  |
| `completed_at` | timestamptz |  |

Indici: `development_plans_person_idx`

### `development_actions`

| Colonna | Tipo | Note |
|---|---|---|
| `plan_id` | uuid | not null |
| `person_id` | uuid | not null |
| `title` | text | not null |
| `description` | text |  |
| `kind` | dev_action_kind | not null, default |
| `competency_key` | text |  |
| `source` | text | not null, default |
| `due_date` | date |  |
| `status` | dev_action_status | not null, default |
| `evidence` | text |  |
| `completed_at` | timestamptz |  |
| `created_by_person_id` | uuid |  |

Indici: `development_actions_plan_idx`, `development_actions_person_idx`

### `talent_assessments`

| Colonna | Tipo | Note |
|---|---|---|
| `person_id` | uuid | not null |
| `potential` | integer | not null |
| `performance` | integer |  |
| `note` | text | not null |
| `session` | text |  |
| `assessed_by_person_id` | uuid | not null |

Indici: `talent_assessments_person_idx`

## Feedback 360° (F360)

### `f360_campaigns`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `description` | text |  |
| `status` | f360_campaign_status | not null, default |
| `competency_keys` | jsonb | not null, default |
| `scale` | jsonb | not null, default |
| `open_questions` | jsonb | not null, default |
| `categories` | jsonb | not null, default |
| `nomination_by` | text | not null, default |
| `require_approval` | boolean | not null, default |
| `release_rule` | text | not null, default |
| `manager_sees_report` | boolean | not null, default |
| `anonymity_threshold` | integer | not null, default |
| `population` | jsonb | not null, default |
| `nomination_due_at` | date |  |
| `collection_due_at` | date |  |
| `launched_at` | timestamptz |  |
| `collection_started_at` | timestamptz |  |
| `closed_at` | timestamptz |  |

Indici: `f360_campaigns_tenant_idx`

### `f360_subjects`

| Colonna | Tipo | Note |
|---|---|---|
| `campaign_id` | uuid | not null |
| `person_id` | uuid | not null |
| `manager_person_id` | uuid |  |
| `org_unit_id` | uuid |  |
| `status` | f360_subject_status | not null, default |
| `nomination_submitted_at` | timestamptz |  |
| `approved_at` | timestamptz |  |
| `approved_by_person_id` | uuid |  |
| `report` | jsonb |  |
| `report_generated_at` | timestamptz |  |
| `released_at` | timestamptz |  |
| `released_by_person_id` | uuid |  |
| `debrief_at` | timestamptz |  |
| `debrief_note` | text |  |

Indici: `f360_subjects_uq`, `f360_subjects_person_idx`, `f360_subjects_manager_idx`

### `f360_requests`

| Colonna | Tipo | Note |
|---|---|---|
| `campaign_id` | uuid | not null |
| `subject_id` | uuid | not null |
| `category` | f360_rater_category | not null |
| `rater_person_id` | uuid |  |
| `external_email` | text |  |
| `external_name` | text |  |
| `token_hash` | text |  |
| `status` | f360_request_status | not null, default |
| `nominated_by_person_id` | uuid |  |
| `decline_reason` | text |  |
| `draft` | jsonb |  |
| `invited_at` | timestamptz |  |
| `submitted_at` | timestamptz |  |
| `reminded_at` | timestamptz |  |
| `expires_at` | timestamptz |  |

Indici: `f360_requests_subject_idx`, `f360_requests_rater_idx`, `f360_requests_token_uq`

### `f360_responses`

| Colonna | Tipo | Note |
|---|---|---|
| `campaign_id` | uuid | not null |
| `subject_id` | uuid | not null |
| `category` | f360_rater_category | not null |
| `request_id` | uuid |  |
| `submitted_at` | timestamptz | not null, default |
| `ratings` | jsonb | not null, default |
| `comments` | jsonb | not null, default |
| `open_answers` | jsonb | not null, default |

Indici: `f360_responses_subject_idx`

## Onboarding (ONB)

### `onboarding_templates`

| Colonna | Tipo | Note |
|---|---|---|
| `name` | text | not null |
| `kind` | onboarding_kind | not null, default |
| `description` | text |  |
| `phases` | jsonb | not null, default |
| `tasks` | jsonb | not null, default |
| `rules` | jsonb | not null, default |
| `is_default` | boolean | not null, default |
| `active` | boolean | not null, default |

Indici: `onboarding_templates_tenant_idx`

### `onboarding_journeys`

| Colonna | Tipo | Note |
|---|---|---|
| `template_id` | uuid |  |
| `person_id` | uuid | not null |
| `kind` | onboarding_kind | not null, default |
| `manager_person_id` | uuid |  |
| `buddy_person_id` | uuid |  |
| `hr_person_id` | uuid |  |
| `it_person_id` | uuid |  |
| `anchor_date` | date | not null |
| `status` | onboarding_journey_status | not null, default |
| `template_name` | text | not null |
| `phases` | jsonb | not null, default |
| `started_at` | timestamptz | not null, default |
| `completed_at` | timestamptz |  |
| `cancelled_at` | timestamptz |  |
| `milestones` | jsonb | not null, default |

Indici: `onboarding_journeys_person_idx`, `onboarding_journeys_manager_idx`, `onboarding_journeys_buddy_idx`

### `onboarding_tasks`

| Colonna | Tipo | Note |
|---|---|---|
| `journey_id` | uuid | not null |
| `person_id` | uuid | not null |
| `key` | text | not null |
| `phase` | text | not null |
| `title` | text | not null |
| `description` | text |  |
| `role` | onboarding_task_role | not null |
| `kind` | onboarding_task_kind | not null, default |
| `assignee_person_id` | uuid |  |
| `due_date` | date |  |
| `link` | text |  |
| `form_key` | text |  |
| `survey_key` | text |  |
| `required` | boolean | not null, default |
| `status` | onboarding_task_status | not null, default |
| `completed_at` | timestamptz |  |
| `completed_by_person_id` | uuid |  |
| `note` | text |  |

Indici: `onboarding_tasks_journey_key_uq`, `onboarding_tasks_assignee_idx`, `onboarding_tasks_journey_idx`

### `onboarding_survey_responses`

| Colonna | Tipo | Note |
|---|---|---|
| `journey_id` | uuid | not null |
| `person_id` | uuid | not null |
| `survey_key` | text | not null |
| `answers` | jsonb | not null, default |
| `comment` | text |  |
| `score` | numeric(4, 2) |  |
| `low` | boolean | not null, default |
| `submitted_at` | timestamptz | not null, default |

Indici: `onboarding_survey_uq`, `onboarding_survey_person_idx`

## App Studio (APP)

### `apps`

| Colonna | Tipo | Note |
|---|---|---|
| `key` | text | not null |
| `name` | text | not null |
| `version` | integer | not null, default |
| `status` | app_status | not null, default |
| `definition` | jsonb | not null |
| `template_key` | text |  |
| `published_at` | timestamptz |  |
| `archived_at` | timestamptz |  |
| `parent_id` | uuid |  |

Indici: `apps_key_version_uq`, `apps_status_idx`

### `app_instances`

| Colonna | Tipo | Note |
|---|---|---|
| `app_id` | uuid |  |
| `app_key` | text | not null |
| `app_version` | integer | not null |
| `definition` | jsonb | not null |
| `subject_person_id` | uuid | not null |
| `launcher_person_id` | uuid |  |
| `actors` | jsonb | not null, default |
| `status` | app_instance_status | not null, default |
| `current_stages` | jsonb | not null, default |
| `title` | text |  |
| `outcome` | text |  |
| `started_at` | timestamptz | not null, default |
| `completed_at` | timestamptz |  |
| `cancelled_at` | timestamptz |  |

Indici: `app_instances_app_idx`, `app_instances_subject_idx`, `app_instances_launcher_idx`

### `app_stage_runs`

| Colonna | Tipo | Note |
|---|---|---|
| `instance_id` | uuid | not null |
| `stage_key` | text | not null |
| `attempt` | integer | not null, default |
| `type` | text | not null |
| `actor_person_id` | uuid |  |
| `status` | app_stage_run_status | not null, default |
| `form_response_id` | uuid |  |
| `outcome` | text |  |
| `comment` | text |  |
| `answers` | jsonb |  |
| `due_date` | date |  |
| `activated_at` | timestamptz |  |
| `completed_at` | timestamptz |  |
| `completed_by_person_id` | uuid |  |

Indici: `app_stage_runs_uq`, `app_stage_runs_actor_idx`

### `app_instance_events`

| Colonna | Tipo | Note |
|---|---|---|
| `instance_id` | uuid | not null |
| `at` | timestamptz | not null, default |
| `actor_person_id` | uuid |  |
| `type` | text | not null |
| `stage_key` | text |  |
| `data` | jsonb | not null, default |

Indici: `app_instance_events_idx`
