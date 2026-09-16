import { Injectable } from '@nestjs/common';
import { and, eq, isNull, or } from 'drizzle-orm';
import { orgUnits, persons } from '@wb/db';
import { principal, tx } from '../common/context.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { parseCsv } from './csv.js';
import { PeopleService } from './people.service.js';
import { PersonFieldsService } from './person-fields.service.js';
import { validateCustomFields, type PersonFieldDef } from '@wb/shared';
import { OrgUnitsService } from './org-units.service.js';

/** Colonne accettate (CORE-012). `manager_email` risolve tra le persone già presenti o nel file stesso. */
export const IMPORT_COLUMNS = ['first_name', 'last_name', 'email', 'employee_number', 'job_title', 'job_level', 'location', 'hire_date', 'org_unit', 'manager_email', 'status'] as const;
const REQUIRED = ['first_name', 'last_name', 'email'] as const;

export interface ImportRowError { row: number; field: string; message: string }
export interface ImportReport {
  dryRun: boolean;
  totalRows: number;
  valid: number;
  invalid: number;
  created: number;
  updated: number;
  orgUnitsCreated: number;
  errors: ImportRowError[];
  preview: Array<{ row: number; action: 'create' | 'update' | 'error'; values: Record<string, string | null> }>;
  unknownColumns: string[];
}

interface ParsedRow {
  row: number;
  values: Record<string, string>;
  errors: ImportRowError[];
}

@Injectable()
export class PeopleImportService {
  constructor(private readonly audit: AuditService, private readonly notifier: NotificationsService, private readonly people: PeopleService, private readonly orgUnitsSvc: OrgUnitsService, private readonly fields: PersonFieldsService) {}

  async importCsv(csv: string, opts: { dryRun: boolean; createOrgUnits: boolean }): Promise<ImportReport> {
    const p = principal();
    const { headers, rows } = parseCsv(csv);
    // colonne `custom:<chiave>` (CORE-011): accettate solo se la chiave è nel catalogo attivo
    const defs = await this.fields.activeDefs();
    const defByKey = new Map<string, PersonFieldDef>(defs.map((d) => [d.key, d]));
    const customCols = headers.filter((h) => h.startsWith('custom:') && defByKey.has(h.slice(7)));
    const known = new Set<string>([...IMPORT_COLUMNS, ...customCols]);
    const unknownColumns = headers.filter((h) => !known.has(h));
    const missing = REQUIRED.filter((c) => !headers.includes(c));
    if (missing.length) {
      return { dryRun: opts.dryRun, totalRows: rows.length, valid: 0, invalid: rows.length, created: 0, updated: 0, orgUnitsCreated: 0, errors: [{ row: 0, field: missing.join(','), message: `Colonne obbligatorie mancanti: ${missing.join(', ')}` }], preview: [], unknownColumns };
    }
    const parsed: ParsedRow[] = rows.map((cells, i) => {
      const values: Record<string, string> = {};
      headers.forEach((h, j) => { if (known.has(h)) values[h] = (cells[j] ?? '').trim(); });
      return { row: i + 2, values, errors: [] };
    });

    // validazione per riga
    const emailsInFile = new Map<string, number>();
    for (const r of parsed) {
      const v = r.values;
      for (const c of REQUIRED) if (!v[c]) r.errors.push({ row: r.row, field: c, message: 'Obbligatorio' });
      if (v.email) {
        v.email = v.email.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) r.errors.push({ row: r.row, field: 'email', message: 'Email non valida' });
        else if (emailsInFile.has(v.email)) r.errors.push({ row: r.row, field: 'email', message: `Duplicata nel file (riga ${emailsInFile.get(v.email)})` });
        else emailsInFile.set(v.email, r.row);
      }
      if (v.hire_date && !isValidIsoDate(v.hire_date)) r.errors.push({ row: r.row, field: 'hire_date', message: 'Data non valida (AAAA-MM-GG)' });
      if (v.status && !['active', 'invited', 'leaving', 'suspended'].includes(v.status)) r.errors.push({ row: r.row, field: 'status', message: 'Valori ammessi: active, invited, leaving, suspended' });
      if (v.manager_email) v.manager_email = v.manager_email.toLowerCase();
      if (v.manager_email && v.manager_email === v.email) r.errors.push({ row: r.row, field: 'manager_email', message: 'Una persona non può essere manager di sé stessa' });
      if (customCols.length) {
        const raw = Object.fromEntries(customCols.map((c) => [c.slice(7), v[c] ?? '']));
        const { errors } = validateCustomFields(defs, raw);
        for (const [k, msg] of Object.entries(errors)) r.errors.push({ row: r.row, field: `custom:${k}`, message: msg });
      }
    }

    // esistenti
    const existing = await tx().select().from(persons);
    const byEmail = new Map(existing.filter((e) => e.email).map((e) => [e.email!, e]));
    const units = await tx().select().from(orgUnits).where(isNull(orgUnits.archivedAt));
    const unitByName = new Map(units.map((u) => [u.name.toLowerCase(), u]));
    const unitByCode = new Map(units.filter((u) => u.code).map((u) => [u.code!.toLowerCase(), u]));
    for (const r of parsed) {
      const m = r.values.manager_email;
      if (m && !byEmail.has(m) && !emailsInFile.has(m)) r.errors.push({ row: r.row, field: 'manager_email', message: 'Manager non trovato né nel file né tra le persone esistenti' });
      const u = r.values.org_unit?.toLowerCase();
      if (u && !unitByName.has(u) && !unitByCode.has(u) && !opts.createOrgUnits) r.errors.push({ row: r.row, field: 'org_unit', message: 'Unità non trovata (attiva "crea unità mancanti")' });
    }

    const errors = parsed.flatMap((r) => r.errors);
    const validRows = parsed.filter((r) => r.errors.length === 0);
    const preview = parsed.slice(0, 50).map((r) => ({ row: r.row, action: (r.errors.length ? 'error' : byEmail.has(r.values.email ?? '') ? 'update' : 'create') as 'create' | 'update' | 'error', values: Object.fromEntries([...IMPORT_COLUMNS, ...customCols].map((c) => [c, r.values[c] ?? null])) as Record<string, string | null> }));
    const report: ImportReport = { dryRun: opts.dryRun, totalRows: rows.length, valid: validRows.length, invalid: parsed.length - validRows.length, created: 0, updated: 0, orgUnitsCreated: 0, errors, preview, unknownColumns };
    if (opts.dryRun || validRows.length === 0) return report;

    // unità mancanti
    for (const r of validRows) {
      const u = r.values.org_unit;
      if (u && !unitByName.has(u.toLowerCase()) && !unitByCode.has(u.toLowerCase())) {
        const created = await this.orgUnitsSvc.create({ name: u });
        unitByName.set(u.toLowerCase(), created);
        report.orgUnitsCreated++;
      }
    }
    // passata 1: crea/aggiorna senza manager; passata 2: manager
    const idByEmail = new Map<string, string>(existing.filter((e) => e.email).map((e) => [e.email!, e.id]));
    for (const r of validRows) {
      const v = r.values;
      const unit = v.org_unit ? (unitByName.get(v.org_unit.toLowerCase()) ?? unitByCode.get(v.org_unit.toLowerCase())) : undefined;
      const base = {
        firstName: v.first_name!, lastName: v.last_name!, email: v.email,
        employeeNumber: v.employee_number || undefined, jobTitle: v.job_title || undefined, jobLevel: v.job_level || undefined,
        location: v.location || undefined, hireDate: v.hire_date || undefined, orgUnitId: unit?.id,
        ...(customCols.length ? { customFields: Object.fromEntries(customCols.filter((c) => v[c]).map((c) => [c.slice(7), v[c]])) } : {}),
      };
      const ex = byEmail.get(v.email!);
      if (ex) {
        await this.people.update(ex.id, { ...base, status: (v.status as 'active' | 'leaving' | 'suspended') || undefined });
        report.updated++;
      } else {
        const created = await this.people.create(base, 'import');
        idByEmail.set(v.email!, created.id);
        report.created++;
      }
    }
    for (const r of validRows) {
      const m = r.values.manager_email;
      if (!m) continue;
      const personId = idByEmail.get(r.values.email!);
      const managerId = idByEmail.get(m);
      if (personId && managerId && personId !== managerId) {
        const [cur] = await tx().select({ managerId: persons.managerId }).from(persons).where(eq(persons.id, personId));
        if (cur?.managerId !== managerId) await this.people.update(personId, { managerId });
      }
    }
    await this.audit.log({ action: 'people.import', entityType: 'person', after: { created: report.created, updated: report.updated, errors: errors.length, orgUnitsCreated: report.orgUnitsCreated } });
    await this.notifier.send({ userId: p.userId, type: 'people.import.completed', data: { created: report.created, updated: report.updated, errors: errors.length }, link: '/people' });
    return report;
  }

  /** Template CSV scaricabile (CORE-012). */
  template(): string {
    return `${IMPORT_COLUMNS.join(',')}\nMario,Rossi,mario.rossi@example.com,EMP001,Account Executive,Mid,Milano,2024-03-01,Vendite,paolo.neri@example.com,active\n`;
  }
}

export { and, or };

function isValidIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
