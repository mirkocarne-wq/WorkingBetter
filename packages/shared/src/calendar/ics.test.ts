import { describe, expect, it } from 'vitest';
import { buildIcs, foldLine, icsEscape, proposeSlots, tzOffsetMinutes } from './index.js';

describe('iCalendar builder', () => {
  it('serializza un invito REQUEST con UID, SEQUENCE, partecipanti e promemoria', () => {
    const ics = buildIcs({
      method: 'REQUEST',
      events: [{ uid: 'meeting-1@workingbetter', sequence: 2, start: new Date('2026-09-15T08:00:00Z'), durationMin: 45, summary: '1:1 Giulia; Luca', description: 'Riga 1\nRiga 2, con virgola', url: 'https://app.test/one-on-ones/1', organizer: { email: 'no-reply@wb.test', name: 'WorkingBetter' }, attendees: [{ email: 'g@acme.test', name: 'Giulia Ferri' }, { email: 'l@acme.test', name: 'Luca Bianchi' }], alarmMinutes: 10, stamp: new Date('2026-09-13T10:00:00Z') }],
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('METHOD:REQUEST');
    expect(ics).toContain('UID:meeting-1@workingbetter');
    expect(ics).toContain('SEQUENCE:2');
    expect(ics).toContain('DTSTART:20260915T080000Z');
    expect(ics).toContain('DTEND:20260915T084500Z');
    expect(ics).toContain('SUMMARY:1:1 Giulia\; Luca');
    expect(ics).toContain('DESCRIPTION:Riga 1\\nRiga 2\\, con virgola');
    expect(ics.replace(/\r\n /g, '')).toContain('ATTENDEE;CN=Giulia Ferri;ROLE=REQ-PARTICIPANT;RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:g@acme.test');
    expect(ics).toContain('TRIGGER:-PT10M');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => Buffer.byteLength(l, 'utf8') <= 75)).toBe(true);
  });

  it('CANCEL marca l’evento annullato; gli eventi tutto il giorno usano VALUE=DATE', () => {
    const ics = buildIcs({ method: 'CANCEL', events: [{ uid: 'x', start: new Date('2026-09-15T08:00:00Z'), summary: 'Annullato', stamp: new Date() }] });
    expect(ics).toContain('STATUS:CANCELLED');
    const feed = buildIcs({ name: 'WorkingBetter', refreshInterval: 'PT1H', events: [{ uid: 'due-1', allDay: true, start: new Date('2026-09-30T00:00:00Z'), summary: 'Self-review', stamp: new Date() }] });
    expect(feed).toContain('X-WR-CALNAME:WorkingBetter');
    expect(feed).toContain('DTSTART;VALUE=DATE:20260930');
    expect(feed).toContain('DTEND;VALUE=DATE:20261001');
    expect(feed).not.toContain('METHOD:');
  });

  it('escape e piegatura rispettano la RFC 5545', () => {
    expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\;c\\,d\\ne');
    const long = `DESCRIPTION:${'àèìòù'.repeat(30)}`;
    const folded = foldLine(long);
    expect(folded.split('\r\n ').every((l) => Buffer.byteLength(l, 'utf8') <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
});

describe('proposta di slot', () => {
  it('propone il primo slot libero per giorno, nei giorni feriali e nell’orario di lavoro', () => {
    // lunedì 14/09/2026 alle 10:20 locali (UTC+2)
    const after = new Date('2026-09-14T08:20:00Z');
    const busy = [{ start: new Date('2026-09-14T08:30:00Z'), end: new Date('2026-09-14T10:00:00Z') }]; // 10:30–12:00 locali
    const slots = proposeSlots({ after, durationMin: 30, busy, tzOffsetMin: 120, count: 3 });
    expect(slots.map((d) => d.toISOString())).toEqual(['2026-09-14T10:00:00.000Z', '2026-09-15T07:00:00.000Z', '2026-09-16T07:00:00.000Z']);
  });

  it('salta il weekend e usa l’ora preferita se libera', () => {
    const after = new Date('2026-09-18T15:30:00Z'); // venerdì 17:30 locali: un'ora non ci sta più entro le 18
    const slots = proposeSlots({ after, durationMin: 60, busy: [], tzOffsetMin: 120, count: 2, preferredHour: 14 });
    expect(slots.map((d) => d.toISOString())).toEqual(['2026-09-21T12:00:00.000Z', '2026-09-22T12:00:00.000Z']);
  });

  it('calcola lo scostamento di un fuso IANA', () => {
    expect(tzOffsetMinutes('Europe/Rome', new Date('2026-07-01T00:00:00Z'))).toBe(120);
    expect(tzOffsetMinutes('Europe/Rome', new Date('2026-01-15T00:00:00Z'))).toBe(60);
    expect(tzOffsetMinutes('Fuso/Inesistente', new Date())).toBe(0);
  });
});
