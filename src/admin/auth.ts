import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';

const scrypt = promisify(scryptCb);

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Password hashing with scrypt (no native dependency). Format:
 *   scrypt$<saltHex>$<hashHex>
 *
 * NOTE (FR9): this is a self-contained stand-in for Dragnet's existing admin
 * authentication. In production, replace `verifyPassword` / session issuance with
 * the shared ATLAS admin auth mechanism rather than maintaining a second one.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function createSession(adminId: number): Promise<string> {
  const id = randomUUID() + randomBytes(16).toString('hex');
  await prisma.adminSession.create({
    data: { id, adminId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  return id;
}

export function setSessionCookie(reply: FastifyReply, sessionId: string) {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    signed: true,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export interface AdminIdentity {
  id: number;
  email: string;
}

export async function getAdminFromRequest(req: FastifyRequest): Promise<AdminIdentity | null> {
  const cookie = req.cookies[SESSION_COOKIE];
  if (!cookie) return null;
  const unsigned = req.unsignCookie(cookie);
  if (!unsigned.valid || !unsigned.value) return null;

  const session = await prisma.adminSession.findUnique({
    where: { id: unsigned.value },
    include: { admin: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.adminSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return { id: session.admin.id, email: session.admin.email };
}

export async function destroySession(req: FastifyRequest) {
  const cookie = req.cookies[SESSION_COOKIE];
  if (!cookie) return;
  const unsigned = req.unsignCookie(cookie);
  if (unsigned.valid && unsigned.value) {
    await prisma.adminSession.delete({ where: { id: unsigned.value } }).catch(() => {});
  }
}
