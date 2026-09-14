import { describe, expect, it } from 'vitest';
import { assertPublicUrl, checkUrlShape, isPrivateAddress } from './safe-url.js';

describe('difesa SSRF per gli URL utente', () => {
  it('riconosce gli indirizzi privati, loopback, link-local e metadata', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.5.4', '172.31.255.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:10.1.1.1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '11.0.0.1', '2606:4700::1111', '::ffff:8.8.8.8']) expect(isPrivateAddress(ip), ip).toBe(false);
  });
  it('rifiuta protocolli, credenziali e host locali; li ammette solo con allowPrivate', () => {
    expect(() => checkUrlShape('ftp://example.com')).toThrow(/http/);
    expect(() => checkUrlShape('http://user:pw@example.com/x')).toThrow(/Credenziali/);
    expect(() => checkUrlShape('http://localhost:4000/hook')).toThrow(/locale/);
    expect(() => checkUrlShape('http://169.254.169.254/latest/meta-data')).toThrow(/privato/);
    expect(() => checkUrlShape('http://metadata.google.internal/')).toThrow(/locale/);
    expect(() => checkUrlShape('http://example.com/hook', { httpsOnly: true })).toThrow(/https/);
    expect(checkUrlShape('http://127.0.0.1:9/hook', { allowPrivate: true }).hostname).toBe('127.0.0.1');
    expect(checkUrlShape('https://hooks.slack.com/services/x').hostname).toBe('hooks.slack.com');
  });
  it('la verifica completa non risolve il DNS con allowPrivate e accetta IP pubblici letterali', async () => {
    await expect(assertPublicUrl('http://localhost:1/x', { allowPrivate: true })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl('https://8.8.8.8/x')).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl('https://10.0.0.5/x')).rejects.toThrow(/privato/);
  });
});
