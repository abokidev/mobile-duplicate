import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from './env.js';

/**
 * Token model (FR1, and Deadline Addendum):
 *   - The RAW token is a 256-bit cryptographically random value, base64url-encoded.
 *     It exists only in the emailed URL. It is never stored and never logged.
 *   - At rest we store only a salted HMAC-SHA256 of the raw token, keyed by
 *     TOKEN_HMAC_SECRET — consistent with the ATLAS PII hashing pattern.
 *   - Tokens never expire. The only states are `unused` and `used`.
 */

const RAW_TOKEN_BYTES = 32; // 256 bits of entropy

/** Generate a fresh, URL-safe raw token. */
export function generateRawToken(): string {
  return randomBytes(RAW_TOKEN_BYTES).toString('base64url');
}

/** Deterministically hash a raw token for storage / lookup. */
export function hashToken(rawToken: string): string {
  return createHmac('sha256', env.tokenHmacSecret).update(rawToken).digest('hex');
}

/**
 * Constant-time comparison of two hex digests. Lookups go through the unique
 * index on token_hash, but this guards any direct hash comparison.
 */
export function hashesEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
