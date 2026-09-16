import { describe, expect, it } from 'vitest';
import { runAutomationsTick } from '../src/jobs/automations.js';

describe('tick delle automazioni (ADR-0015)', () => {
  it('senza segreto non chiama l’API e lo dice', async () => {
    let called = false;
    const r = await runAutomationsTick({ API_INTERNAL_URL: 'http://api:4000' }, async () => { called = true; return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; });
    expect(called).toBe(false);
    expect(r.skipped).toContain('INTERNAL_JOB_TOKEN');
  });
  it('chiama l’endpoint interno con il token e riporta il riepilogo', async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const r = await runAutomationsTick({ API_INTERNAL_URL: 'http://api:4000/', INTERNAL_JOB_TOKEN: 'segreto-di-prova-123456' }, async (url, init) => { calls.push({ url, headers: init.headers, body: init.body }); return { ok: true, status: 201, json: async () => ({ tenants: 2, events: 3 }), text: async () => '' }; }, '2026-09-16');
    expect(calls[0]!.url).toBe('http://api:4000/api/v1/internal/automations/tick');
    expect(calls[0]!.headers['x-internal-token']).toBe('segreto-di-prova-123456');
    expect(JSON.parse(calls[0]!.body)).toEqual({ today: '2026-09-16' });
    expect(r).toEqual({ tenants: 2, events: 3, status: 201 });
  });
  it('un errore HTTP diventa un errore del job', async () => {
    await expect(runAutomationsTick({ API_INTERNAL_URL: 'http://api:4000', INTERNAL_JOB_TOKEN: 'segreto-di-prova-123456' }, async () => ({ ok: false, status: 401, json: async () => ({}), text: async () => 'Token interno mancante' }))).rejects.toThrow(/HTTP 401/);
  });
});
