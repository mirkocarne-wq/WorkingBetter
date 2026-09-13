import { and, eq, lte, lt } from 'drizzle-orm';
import { emailOutbox, withPlatform, type AnyDb } from '@wb/db';
import type { Transporter } from 'nodemailer';

/** Allegato in coda: contenuto testuale (es. .ics) o base64; `method` marca gli inviti iCalendar (iTIP). */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  method?: 'PUBLISH' | 'REQUEST' | 'CANCEL';
}
export interface EmailMessage {
  to: string;
  toName?: string | null;
  subject: string;
  text: string;
  html?: string | null;
  attachments?: EmailAttachment[] | null;
}
export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

export const logSender: EmailSender = {
  async send(msg) {
    const att = msg.attachments?.length ? ` allegati=${msg.attachments.map((a) => a.filename).join(',')}` : '';
    console.log(`[email→log] to=${msg.to} subject="${msg.subject}"${att}\n${msg.text}\n`);
  },
};

/** Traduce il messaggio in coda nelle opzioni di nodemailer: gli inviti .ics diventano `icalEvent` (Content-Type text/calendar; method=…). */
export function toMailOptions(from: string, msg: EmailMessage) {
  const ical = msg.attachments?.find((a) => a.contentType.startsWith('text/calendar'));
  const others = (msg.attachments ?? []).filter((a) => a !== ical).map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content, encoding: a.encoding ?? 'utf8' }));
  return {
    from,
    to: msg.toName ? `"${msg.toName}" <${msg.to}>` : msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html ?? undefined,
    ...(ical ? { icalEvent: { method: ical.method ?? 'PUBLISH', filename: ical.filename, content: ical.content } } : {}),
    ...(others.length ? { attachments: others } : {}),
  };
}

export function smtpSender(transporter: Transporter, from: string): EmailSender {
  return {
    async send(msg) {
      await transporter.sendMail(toMailOptions(from, msg));
    },
  };
}

/** Svuota la coda email (INT-002): al massimo `batch` per giro, 5 tentativi con backoff, poi `failed`. */
export async function dispatchEmails(db: AnyDb, sender: EmailSender, batch = 50, now = new Date()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const pending = await withPlatform(db, (tx) => tx.select().from(emailOutbox).where(and(eq(emailOutbox.status, 'pending'), lte(emailOutbox.scheduledFor, now), lt(emailOutbox.attempts, 5))).orderBy(emailOutbox.createdAt).limit(batch));
  for (const m of pending) {
    try {
      await sender.send({ to: m.toEmail, toName: m.toName, subject: m.subject, text: m.text, html: m.html, attachments: (m.attachments as EmailAttachment[] | null) ?? undefined });
      await withPlatform(db, (tx) => tx.update(emailOutbox).set({ status: 'sent', sentAt: new Date(), attempts: m.attempts + 1, updatedAt: new Date() }).where(eq(emailOutbox.id, m.id)));
      out.sent++;
    } catch (e) {
      const attempts = m.attempts + 1;
      const delayMin = Math.min(60, 2 ** attempts);
      await withPlatform(db, (tx) =>
        tx.update(emailOutbox).set({ status: attempts >= 5 ? 'failed' : 'pending', attempts, lastError: String(e).slice(0, 500), scheduledFor: new Date(now.getTime() + delayMin * 60000), updatedAt: new Date() }).where(eq(emailOutbox.id, m.id)),
      );
      if (attempts >= 5) out.failed++;
    }
  }
  return out;
}
