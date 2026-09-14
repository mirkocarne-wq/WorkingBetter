import type { AnyDb } from '@wb/db';
import { TenantCipher, dispatchChat, syncCalendarLinks } from '@wb/connectors';

/** Job dei connettori (ADR-0012): eventi 1:1 nei calendari collegati e messaggi Slack/Teams in coda. */
export function connectorDeps(masterKey: string | undefined, appBaseUrl: string) {
  const cipher = new TenantCipher(masterKey);
  return cipher.enabled ? { cipher, fetch: fetch as unknown as Parameters<typeof syncCalendarLinks>[1]['fetch'], appBaseUrl } : null;
}
export async function runCalendarSync(db: AnyDb, masterKey: string | undefined, appBaseUrl: string) {
  const deps = connectorDeps(masterKey, appBaseUrl);
  if (!deps) return { skipped: 'NOTES_MASTER_KEY assente' };
  return syncCalendarLinks(db, deps);
}
export async function runChatDispatch(db: AnyDb, masterKey: string | undefined, appBaseUrl: string) {
  const deps = connectorDeps(masterKey, appBaseUrl);
  if (!deps) return { skipped: 'NOTES_MASTER_KEY assente' };
  return dispatchChat(db, deps);
}
