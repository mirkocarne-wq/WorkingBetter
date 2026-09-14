import { describe, expect, it } from 'vitest';
import { DefaultEndpoints, authorizeUrl, endpointsFor, googleEventBody, integrationSettingsOf, microsoftEventBody } from './providers.js';

describe('connettori: provider', () => {
  it('endpoint: default, sovrascrittura e tenant Microsoft', () => {
    const s = integrationSettingsOf({ integrations: { microsoft: { tenant: 'contoso.onmicrosoft.com' }, endpoints: { google: { api: 'https://proxy.example/google/' } } } });
    expect(endpointsFor(s, 'microsoft').authorize).toBe('https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize');
    expect(endpointsFor({}, 'microsoft').token).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/token');
    expect(endpointsFor(s, 'google')).toEqual({ ...DefaultEndpoints.google, api: 'https://proxy.example/google' });
    expect(integrationSettingsOf(null)).toEqual({});
  });
  it('URL di autorizzazione: PKCE e offline per Google, scope bot per Slack', () => {
    const g = new URL(authorizeUrl('google', DefaultEndpoints.google, { clientId: 'c', redirectUri: 'https://api.example/cb', state: 's', challenge: 'ch' }));
    expect(g.searchParams.get('code_challenge')).toBe('ch');
    expect(g.searchParams.get('access_type')).toBe('offline');
    expect(g.searchParams.get('scope')).toContain('calendar.events');
    const sl = new URL(authorizeUrl('slack', DefaultEndpoints.slack, { clientId: 'c', redirectUri: 'https://api.example/cb', state: 's', challenge: 'ch' }));
    expect(sl.searchParams.get('scope')).toContain('chat:write');
    expect(sl.searchParams.get('code_challenge')).toBeNull();
  });
  it('corpo evento: Meet/Teams richiesti solo senza link della relazione; orari e partecipanti', () => {
    const e = { uid: 'wb-1', title: '1:1 A · B', description: 'd', start: new Date('2026-10-01T09:00:00Z'), durationMin: 45, timeZone: 'Europe/Rome', attendees: [{ email: 'a@x.test', name: 'A' }, { email: 'b@x.test', name: 'B' }] };
    const g = googleEventBody(e) as { end: { dateTime: string }; conferenceData?: unknown; attendees: unknown[] };
    expect(g.end.dateTime).toBe('2026-10-01T09:45:00.000Z');
    expect(g.conferenceData).toBeDefined();
    expect(g.attendees).toHaveLength(2);
    const m = microsoftEventBody({ ...e, location: 'https://zoom.example/1' }) as { isOnlineMeeting?: boolean; location?: { displayName: string }; start: { dateTime: string; timeZone: string } };
    expect(m.isOnlineMeeting).toBeUndefined();
    expect(m.location?.displayName).toBe('https://zoom.example/1');
    expect(m.start).toEqual({ dateTime: '2026-10-01T09:00:00', timeZone: 'UTC' });
  });
});
