import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './env.js';

/**
 * Reversible encryption for the RAW token retained between import and submission
 * (needed for the separated admin send, same-link reminders, and send retries —
 * see the Admin Upload addendum). AES-256-GCM.
 *
 * The key is derived from TOKEN_HMAC_SECRET via SHA-256 with a distinct label, so
 * it is separate from the hashing key and requires no extra config. The stored
 * value is `v1:<ivB64>:<tagB64>:<ctB64>`. This copy is confidential-at-rest and is
 * never used for token verification (that path is always the salted hash) and is
 * purged the instant the candidate submits.
 */

const KEY = createHash('sha256')
  .update(`${env.tokenHmacSecret}:delivery-token-encryption:v1`)
  .digest(); // 32 bytes

export function encryptDeliveryToken(rawToken: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decryptDeliveryToken(stored: string): string | null {
  try {
    const parts = stored.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return null;
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ct = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    return null;
  }
}
