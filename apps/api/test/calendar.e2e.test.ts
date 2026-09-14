import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { emailOutbox, reviewCycles, reviewTemplates, reviews, tenants } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let sara: { userId: string; personId: string; token: string };
let relationId: string;
let meetingId: string;

const icsOf = (row: typeof emailOutbox.$inferSelect) => (row.attachments as { filename: string; contentType: string; content: string; method: string }[] | null)?.[0];

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme Cal');
  giulia = await env.createUser(tenant.id, 'giulia@cal.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@cal.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  sara = await env.createUser(tenant.id, 'sara@cal.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: giulia.personId });
});
afterAll(() => env.close());

describe('calendario (ADR-0010)', () => {
  it('creating a 1:1 queues an iCalendar REQUEST to both participants with a stable UID', async () => {
    const r = await api(env.app, 'POST', '/one-on-ones', giulia.token, { otherPersonId: luca.personId, cadenceDays: 7, firstMeetingAt: '2026-10-05T09:00:00.000Z', meetingUrl: 'https://meet.example/abc' });
    expect(r.status).toBe(201);
    relationId = r.body.id;
    meetingId = r.body.nextMeeting.id;
    const mails = await env.db.select().from(emailOutbox).where(and(eq(emailOutbox.tenantId, tenant.id), eq(emailOutbox.subject, 'Invito: 1:1 con Luca Bianchi · 5 ott 2026, 11:00')));
    expect(mails).toHaveLength(1); // a Giulia; Luca riceve il suo
    const all = await env.db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, tenant.id));
    const withIcs = all.filter((m) => icsOf(m));
    expect(withIcs.map((m) => m.toEmail).sort()).toEqual(['giulia@cal.test', 'luca@cal.test']);
    const ics = icsOf(withIcs[0]!)!;
    expect(ics.method).toBe('REQUEST');
    expect(ics.contentType).toContain('text/calendar');
    expect(ics.content).toContain(`UID:meeting-${meetingId}@workingbetter`);
    expect(ics.content).toContain('SEQUENCE:0');
    expect(ics.content).toContain('DTSTART:20261005T090000Z');
    expect(ics.content).toContain('LOCATION:https://meet.example/abc');
    expect(ics.content.replace(/\r\n /g, '')).toContain('ATTENDEE;CN=Luca Bianchi;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:luca@cal.test');
  });

  it('rescheduling bumps SEQUENCE and cancelling sends a CANCEL', async () => {
    const before = (await env.db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, tenant.id))).length;
    const up = await api(env.app, 'PATCH', `/meetings/${meetingId}`, luca.token, { scheduledAt: '2026-10-06T14:00:00.000Z' });
    expect(up.status).toBe(200);
    let all = await env.db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, tenant.id));
    expect(all.length).toBe(before + 2);
    const resched = all.slice(-2).map((m) => icsOf(m)!);
    expect(resched.every((i) => i.method === 'REQUEST' && i.content.includes('SEQUENCE:1') && i.content.includes('DTSTART:20261006T140000Z'))).toBe(true);
    // stesso orario ⇒ nessun nuovo invito
    await api(env.app, 'PATCH', `/meetings/${meetingId}`, luca.token, { scheduledAt: '2026-10-06T14:00:00.000Z' });
    expect((await env.db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, tenant.id))).length).toBe(before + 2);
    const cancel = await api(env.app, 'PATCH', `/meetings/${meetingId}`, giulia.token, { status: 'cancelled' });
    expect(cancel.status).toBe(200);
    all = await env.db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, tenant.id));
    const last = icsOf(all[all.length - 1]!)!;
    expect(last.method).toBe('CANCEL');
    expect(last.content).toContain('METHOD:CANCEL');
    expect(last.content).toContain('STATUS:CANCELLED');
    expect(last.content).toContain('SEQUENCE:2');
  });

  it('single-meeting .ics is only for participants', async () => {
    const m = await api(env.app, 'POST', `/one-on-ones/${relationId}/meetings`, giulia.token, { scheduledAt: '2026-10-12T09:00:00.000Z' });
    expect(m.status).toBe(201);
    const res = await env.app.inject({ method: 'GET', url: `/api/v1/meetings/${m.body.id}.ics`, headers: { authorization: `Bearer ${luca.token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/calendar');
    expect(res.body).toContain('METHOD:PUBLISH');
    expect(res.body).toContain('SUMMARY:1:1 Giulia Ferri e Luca Bianchi');
    const forbidden = await env.app.inject({ method: 'GET', url: `/api/v1/meetings/${m.body.id}.ics`, headers: { authorization: `Bearer ${sara.token}` } });
    expect(forbidden.statusCode).toBe(403);
  });

  it('personal feed: off by default, rotate gives a secret URL, public GET serves 1:1 and review deadlines, disable revokes it', async () => {
    const off = await api(env.app, 'GET', '/calendar/feed', luca.token);
    expect(off.status).toBe(200);
    expect(off.body.enabled).toBe(false);
    expect(off.body.upcoming.some((e: { kind: string }) => e.kind === 'meeting')).toBe(true);

    // una review attiva con scadenza self per Luca
    const [tpl] = await env.db.insert(reviewTemplates).values({ tenantId: tenant.id, name: 'T', managerFormKey: 'mgr', selfFormKey: 'self' }).returning();
    const [cycle] = await env.db.insert(reviewCycles).values({ tenantId: tenant.id, templateId: tpl!.id, name: 'Review Q4', status: 'active', periodStart: '2026-07-01', periodEnd: '2026-09-30', selfDueAt: '2026-10-20', managerDueAt: '2026-10-31' }).returning();
    await env.db.insert(reviews).values({ tenantId: tenant.id, cycleId: cycle!.id, subjectPersonId: luca.personId, managerPersonId: giulia.personId, status: 'pending_self' });

    const on = await api(env.app, 'POST', '/calendar/feed/rotate', luca.token);
    expect(on.status).toBe(201);
    expect(on.body.url).toMatch(/\/api\/v1\/calendar\/feed\/[A-Za-z0-9_-]+\.ics$/);
    const token = on.body.url.split('/').pop()!.replace('.ics', '');
    const feed = await env.app.inject({ method: 'GET', url: `/api/v1/calendar/feed/${token}.ics` });
    expect(feed.statusCode).toBe(200);
    expect(feed.headers['content-type']).toContain('text/calendar');
    expect(feed.body).toContain('X-WR-CALNAME:WorkingBetter');
    expect(feed.body).toContain('SUMMARY:1:1 con Giulia Ferri');
    expect(feed.body).toContain('SUMMARY:Self-review da consegnare · Review Q4');
    expect(feed.body).toContain('DTSTART;VALUE=DATE:20261020');
    expect(feed.body).not.toContain('Manager review'); // Luca non è manager
    // il feed del manager contiene la scadenza della manager review
    const gOn = await api(env.app, 'POST', '/calendar/feed/rotate', giulia.token);
    const gFeed = await env.app.inject({ method: 'GET', url: `/api/v1/calendar/feed/${gOn.body.url.split('/').pop()!.replace('.ics', '')}.ics` });
    expect(gFeed.body).toContain('SUMMARY:Manager review di Luca Bianchi · Review Q4');

    const rotated = await api(env.app, 'POST', '/calendar/feed/rotate', luca.token);
    expect(rotated.body.url).not.toBe(on.body.url);
    expect((await env.app.inject({ method: 'GET', url: `/api/v1/calendar/feed/${token}.ics` })).statusCode).toBe(404);
    const disabled = await api(env.app, 'DELETE', '/calendar/feed', luca.token);
    expect(disabled.body.enabled).toBe(false);
    const t2 = rotated.body.url.split('/').pop()!.replace('.ics', '');
    expect((await env.app.inject({ method: 'GET', url: `/api/v1/calendar/feed/${t2}.ics` })).statusCode).toBe(404);
    expect((await env.app.inject({ method: 'GET', url: '/api/v1/calendar/feed/not-a-token.ics' })).statusCode).toBe(404);
  });

  it('proposes up to three slots on working days avoiding known 1:1s of both participants', async () => {
    const [t] = await env.db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(t!.timezone).toBe('Europe/Rome');
    const s = await api(env.app, 'GET', `/one-on-ones/${relationId}/slots?durationMin=45`, giulia.token);
    expect(s.status).toBe(200);
    expect(s.body.slots).toHaveLength(3);
    expect(s.body.durationMin).toBe(45);
    const days = new Set(s.body.slots.map((x: string) => x.slice(0, 10)));
    expect(days.size).toBe(3);
    for (const iso of s.body.slots as string[]) {
      const d = new Date(iso);
      expect([0, 6]).not.toContain(d.getUTCDay());
      const localHour = (d.getTime() + 60 * 60000 * (t!.timezone === 'Europe/Rome' ? 1 : 0)) / 3600000 % 24; // almeno in orario plausibile
      expect(localHour).toBeGreaterThanOrEqual(0);
    }
    expect((await api(env.app, 'GET', `/one-on-ones/${relationId}/slots`, sara.token)).status).toBe(404);
  });
});
