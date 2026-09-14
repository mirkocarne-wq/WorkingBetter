import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cifratura applicativa AES-256-GCM con chiave derivata per tenant (HKDF dalla master key).
 * Usata per le note private dei 1:1, i segreti SSO/MFA e i token dei connettori (docs/04, docs/06). Formato: base64(iv | tag | ciphertext).
 */
export class TenantCipher {
  private readonly master: Buffer | null;
  constructor(masterKeyHex?: string) {
    this.master = masterKeyHex ? Buffer.from(masterKeyHex, 'hex') : null;
  }
  get enabled(): boolean {
    return this.master !== null;
  }
  private key(tenantId: string): Buffer {
    if (!this.master) throw new Error('NOTES_MASTER_KEY non configurata');
    return Buffer.from(hkdfSync('sha256', this.master, tenantId, 'wb-private-notes', 32));
  }
  encrypt(tenantId: string, plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(tenantId), iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
  }
  decrypt(tenantId: string, payload: string): string {
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key(tenantId), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
