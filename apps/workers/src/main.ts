import { createDatabase, jobRuns, type AnyDb } from '@wb/db';
import { eq } from 'drizzle-orm';
import nodemailer from 'nodemailer';
import { loadConfig } from './config.js';
import { dispatchEmails, logSender, smtpSender, type EmailSender } from './jobs/email-dispatch.js';
import { runReminders } from './jobs/reminders.js';

const cfg = loadConfig();
const { db, close } = createDatabase({ url: cfg.DATABASE_URL, max: 5 });
const sender: EmailSender = cfg.EMAIL_TRANSPORT === 'smtp' && cfg.SMTP_URL ? smtpSender(nodemailer.createTransport(cfg.SMTP_URL), cfg.EMAIL_FROM) : logSender;

async function tracked<T>(db: AnyDb, job: string, fn: () => Promise<T>): Promise<T> {
  const [run] = await db.insert(jobRuns).values({ job }).returning({ id: jobRuns.id });
  try {
    const summary = await fn();
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: true, summary: summary as object }).where(eq(jobRuns.id, run!.id));
    console.log(`[worker] ${job} ok`, JSON.stringify(summary));
    return summary;
  } catch (e) {
    await db.update(jobRuns).set({ finishedAt: new Date(), ok: false, error: String(e).slice(0, 2000) }).where(eq(jobRuns.id, run!.id));
    console.error(`[worker] ${job} failed`, e);
    throw e;
  }
}

if (process.argv.includes('--once')) {
  // Esecuzione singola (cron esterno, CI, debug): promemoria + svuotamento coda.
  await tracked(db, 'reminders', () => runReminders(db));
  await tracked(db, 'email-dispatch', () => dispatchEmails(db, sender));
  await close();
  process.exit(0);
}

if (!cfg.REDIS_URL) {
  // Senza Redis: scheduler in-process (sviluppo).
  console.log('[worker] REDIS_URL assente: scheduler in-process');
  setInterval(() => tracked(db, 'email-dispatch', () => dispatchEmails(db, sender)).catch(() => {}), cfg.EMAIL_DISPATCH_EVERY_MS);
  setInterval(() => tracked(db, 'reminders', () => runReminders(db)).catch(() => {}), 60 * 60 * 1000);
  await tracked(db, 'reminders', () => runReminders(db)).catch(() => {});
} else {
  const { Queue, Worker } = await import('bullmq');
  const { Redis } = await import('ioredis');
  const connection = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('wb-jobs', { connection });
  await queue.upsertJobScheduler('reminders', { pattern: cfg.REMINDERS_CRON }, { name: 'reminders' });
  await queue.upsertJobScheduler('email-dispatch', { every: cfg.EMAIL_DISPATCH_EVERY_MS }, { name: 'email-dispatch' });
  new Worker(
    'wb-jobs',
    async (job) => {
      if (job.name === 'reminders') return tracked(db, 'reminders', () => runReminders(db));
      if (job.name === 'email-dispatch') return tracked(db, 'email-dispatch', () => dispatchEmails(db, sender));
      return null;
    },
    { connection, concurrency: 2 },
  );
  console.log(`[worker] in ascolto su BullMQ (${cfg.REDIS_URL}) · reminders "${cfg.REMINDERS_CRON}" · email ogni ${cfg.EMAIL_DISPATCH_EVERY_MS} ms`);
}
