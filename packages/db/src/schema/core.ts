import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Colonne comuni (docs/04-modello-dati.md). */
export const audited = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by'),
};
export const tenantScoped = {
  ...audited,
  tenantId: uuid('tenant_id').notNull(),
};

export const tenants = pgTable('tenants', {
  ...audited,
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  defaultLocale: text('default_locale').notNull().default('it'),
  timezone: text('timezone').notNull().default('Europe/Rome'),
  currency: text('currency').notNull().default('EUR'),
  settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
  status: text('status').notNull().default('active'),
});

export const personStatus = pgEnum('person_status', ['invited', 'active', 'leaving', 'terminated', 'suspended', 'anonymized']);

export const orgUnits = pgTable(
  'org_units',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    code: text('code'),
    parentId: uuid('parent_id'),
    path: text('path').notNull().default(''), // materialized path: /root-id/child-id/
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [index('org_units_tenant_idx').on(t.tenantId, t.parentId), index('org_units_path_idx').on(t.tenantId, t.path)],
);

export const persons = pgTable(
  'persons',
  {
    ...tenantScoped,
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email'),
    employeeNumber: text('employee_number'),
    jobTitle: text('job_title'),
    jobLevel: text('job_level'),
    /** job profile del modulo Sviluppo (DEV-002): competenze attese */
    jobProfileId: uuid('job_profile_id'),
    location: text('location'),
    hireDate: date('hire_date'),
    terminationDate: date('termination_date'),
    orgUnitId: uuid('org_unit_id'),
    managerId: uuid('manager_id'),
    status: personStatus('status').notNull().default('active'),
    customFields: jsonb('custom_fields').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    uniqueIndex('persons_tenant_email_uq').on(t.tenantId, t.email),
    index('persons_tenant_manager_idx').on(t.tenantId, t.managerId),
    index('persons_tenant_org_idx').on(t.tenantId, t.orgUnitId),
  ],
);

export const users = pgTable(
  'users',
  {
    ...tenantScoped,
    personId: uuid('person_id'),
    email: text('email').notNull(),
    externalSubject: text('external_subject'), // sub dell'IdP
    passwordHash: text('password_hash'), // scrypt, vedi packages/db/src/auth/password.ts (ADR-0007)
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    /** invito (CORE-014): hash del token monouso e scadenza */
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    inviteTokenHash: text('invite_token_hash'),
    inviteExpiresAt: timestamp('invite_expires_at', { withTimezone: true }),
    inviteAcceptedAt: timestamp('invite_accepted_at', { withTimezone: true }),
    /** reset password (CORE-030) */
    resetTokenHash: text('reset_token_hash'),
    resetExpiresAt: timestamp('reset_expires_at', { withTimezone: true }),
    passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }),
    /** protezione brute force: tentativi falliti consecutivi e blocco temporaneo */
    failedLogins: integer('failed_logins').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** ultimo metodo di accesso usato: password | oidc | dev */
    authProvider: text('auth_provider'),
    /** MFA TOTP (CORE-030): segreto cifrato con la chiave del tenant, segreto in attesa di conferma, codici di recupero (hash) */
    mfaSecretEnc: text('mfa_secret_enc'),
    mfaPendingSecretEnc: text('mfa_pending_secret_enc'),
    mfaEnabledAt: timestamp('mfa_enabled_at', { withTimezone: true }),
    mfaRecoveryHashes: jsonb('mfa_recovery_hashes'),
    /** revoca sessioni (CORE-030): i token emessi prima di questo istante non sono più validi */
    sessionsRevokedAt: timestamp('sessions_revoked_at', { withTimezone: true }),
    /** feed iCalendar personale (INT-022): URL segreto revocabile; null = disattivato */
    calendarFeedToken: text('calendar_feed_token'),
  },
  (t) => [uniqueIndex('users_tenant_email_uq').on(t.tenantId, t.email), uniqueIndex('users_calendar_feed_token_uq').on(t.calendarFeedToken)],
);

/** Storico manager e unità con validità temporale (CORE-017). */
export const personHistory = pgTable(
  'person_history',
  {
    ...tenantScoped,
    personId: uuid('person_id').notNull(),
    field: text('field').notNull(), // manager_id | org_unit_id | job_title | job_level
    value: text('value'),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
  },
  (t) => [index('person_history_idx').on(t.tenantId, t.personId, t.field, t.validFrom)],
);

export const roleAssignments = pgTable(
  'role_assignments',
  {
    ...tenantScoped,
    userId: uuid('user_id').notNull(),
    role: text('role').notNull(),
    scopeType: text('scope_type').notNull().default('tenant'), // tenant | org_unit | person_list
    scopeId: uuid('scope_id'),
    scopePersonIds: jsonb('scope_person_ids'),
  },
  (t) => [index('role_assignments_user_idx').on(t.tenantId, t.userId)],
);

export const namingOverrides = pgTable(
  'naming_overrides',
  {
    ...tenantScoped,
    concept: text('concept').notNull(), // objective | okr | review | one_on_one | feedback | recognition | competency
    locale: text('locale').notNull(),
    singular: text('singular').notNull(),
    plural: text('plural').notNull(),
  },
  (t) => [uniqueIndex('naming_overrides_uq').on(t.tenantId, t.concept, t.locale)],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(), // es. objective.create
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
  },
  (t) => [index('audit_log_tenant_at_idx').on(t.tenantId, t.at), index('audit_log_entity_idx').on(t.tenantId, t.entityType, t.entityId)],
);

export const orgUnitsRelations = relations(orgUnits, ({ one, many }) => ({
  parent: one(orgUnits, { fields: [orgUnits.parentId], references: [orgUnits.id], relationName: 'org_tree' }),
  children: many(orgUnits, { relationName: 'org_tree' }),
  people: many(persons),
}));
export const personsRelations = relations(persons, ({ one, many }) => ({
  orgUnit: one(orgUnits, { fields: [persons.orgUnitId], references: [orgUnits.id] }),
  manager: one(persons, { fields: [persons.managerId], references: [persons.id], relationName: 'reports' }),
  reports: many(persons, { relationName: 'reports' }),
  user: one(users, { fields: [persons.id], references: [users.personId] }),
}));

export const isActiveBool = boolean; // re-export helper to keep imports tidy

/** Catalogo dei campi custom della persona (CORE-011): i valori restano in persons.custom_fields e sono validati contro il catalogo. */
export const personFieldDefs = pgTable(
  'person_field_defs',
  {
    ...tenantScoped,
    key: text('key').notNull(), // es. contract_type, cost_center
    label: text('label').notNull(),
    type: text('type').notNull().default('text'), // text | number | date | boolean | single_choice
    options: jsonb('options').$type<{ value: string; label: string }[]>().notNull().default([]),
    section: text('section'),
    help: text('help'),
    required: boolean('required').notNull().default(false),
    visibility: text('visibility').notNull().default('hr'), // hr | manager | all
    position: integer('position').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('person_field_defs_key_uq').on(t.tenantId, t.key)],
);
