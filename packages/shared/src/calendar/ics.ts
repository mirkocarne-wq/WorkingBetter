/**
 * Costruzione di documenti iCalendar (RFC 5545) e inviti iTIP (RFC 5546) senza dipendenze.
 * Usato per gli inviti email dei 1:1, il feed personale e, in futuro, i connettori (ADR-0010).
 */

export type IcsMethod = 'PUBLISH' | 'REQUEST' | 'CANCEL';

export interface IcsPerson {
  email: string;
  name?: string | null;
}

export interface IcsEvent {
  /** Identificatore stabile dell'evento tra aggiornamenti (es. `meeting-<uuid>@workingbetter`). */
  uid: string;
  /** Cresce a ogni modifica di data/ora/durata: i client applicano solo sequenze maggiori. */
  sequence?: number;
  start: Date;
  /** Se assente e non allDay, l'evento dura `durationMin` (default 30). */
  end?: Date;
  durationMin?: number;
  /** Evento "tutto il giorno" (scadenze): usa solo la data di `start`. */
  allDay?: boolean;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
  organizer?: IcsPerson | null;
  attendees?: IcsPerson[];
  categories?: string[];
  /** Data di generazione (DTSTAMP); default: adesso. */
  stamp?: Date;
  /** Promemoria in minuti prima dell'inizio (VALARM). */
  alarmMinutes?: number | null;
}

export interface IcsCalendar {
  method?: IcsMethod;
  /** Nome mostrato dai client per i feed sottoscritti. */
  name?: string;
  description?: string;
  prodId?: string;
  /** Intervallo di aggiornamento suggerito ai client del feed (ISO 8601, es. PT1H). */
  refreshInterval?: string;
  events: IcsEvent[];
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Data/ora UTC nel formato iCalendar (`20260913T140000Z`). */
export function icsDateTime(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** Solo data (`20260913`), usata per gli eventi tutto il giorno. */
export function icsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** Escape dei valori testuali (RFC 5545 §3.3.11): backslash, punto e virgola, virgola, a capo. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Piegatura delle righe oltre 75 ottetti (RFC 5545 §3.1) con continuazione "spazio". */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let chunk = '';
  let size = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74;
    if (size + b > limit) {
      out.push(chunk);
      chunk = '';
      size = 0;
    }
    chunk += ch;
    size += b;
  }
  if (chunk) out.push(chunk);
  return out.join('\r\n ');
}

function person(role: 'ORGANIZER' | 'ATTENDEE', p: IcsPerson, method?: IcsMethod): string {
  const params = [p.name ? `CN=${icsEscape(p.name).replace(/"/g, '')}` : null];
  if (role === 'ATTENDEE') {
    params.push('ROLE=REQ-PARTICIPANT');
    if (method === 'REQUEST') params.push('RSVP=TRUE', 'PARTSTAT=NEEDS-ACTION');
  }
  return `${role};${params.filter(Boolean).join(';')}:mailto:${p.email}`;
}

function eventLines(e: IcsEvent, method?: IcsMethod): string[] {
  const stamp = e.stamp ?? new Date();
  const lines = ['BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${icsDateTime(stamp)}`, `SEQUENCE:${e.sequence ?? 0}`];
  if (e.allDay) {
    const next = new Date(Date.UTC(e.start.getUTCFullYear(), e.start.getUTCMonth(), e.start.getUTCDate() + 1));
    lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(next)}`);
  } else {
    const end = e.end ?? new Date(e.start.getTime() + (e.durationMin ?? 30) * 60000);
    lines.push(`DTSTART:${icsDateTime(e.start)}`, `DTEND:${icsDateTime(end)}`);
  }
  lines.push(`SUMMARY:${icsEscape(e.summary)}`);
  if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
  if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push(`STATUS:${e.status ?? (method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED')}`);
  if (e.categories?.length) lines.push(`CATEGORIES:${e.categories.map(icsEscape).join(',')}`);
  if (e.organizer) lines.push(person('ORGANIZER', e.organizer));
  for (const a of e.attendees ?? []) lines.push(person('ATTENDEE', a, method));
  lines.push(`LAST-MODIFIED:${icsDateTime(stamp)}`);
  if (e.alarmMinutes != null && !e.allDay && method !== 'CANCEL') {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.summary)}`, `TRIGGER:-PT${e.alarmMinutes}M`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** Serializza un calendario iCalendar completo (righe CRLF, piegate). */
export function buildIcs(cal: IcsCalendar): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${cal.prodId ?? '-//WorkingBetter//Calendar 1.0//IT'}`, 'CALSCALE:GREGORIAN'];
  if (cal.method) lines.push(`METHOD:${cal.method}`);
  if (cal.name) lines.push(`X-WR-CALNAME:${icsEscape(cal.name)}`, `NAME:${icsEscape(cal.name)}`);
  if (cal.description) lines.push(`X-WR-CALDESC:${icsEscape(cal.description)}`);
  if (cal.refreshInterval) lines.push(`REFRESH-INTERVAL;VALUE=DURATION:${cal.refreshInterval}`, `X-PUBLISHED-TTL:${cal.refreshInterval}`);
  for (const e of cal.events) lines.push(...eventLines(e, cal.method));
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
