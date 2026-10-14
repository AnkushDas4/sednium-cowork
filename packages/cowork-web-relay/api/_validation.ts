import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RoomState } from './_types.js';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function text(value: unknown, name: string, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new ApiError(400, `Invalid ${name}`);
  }
  return value.trim();
}
export function id(value: unknown, name: string): string {
  const v = text(value, name, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(v) || ['__proto__', 'prototype', 'constructor'].includes(v.toLowerCase())) {
    throw new ApiError(400, `Invalid ${name}`);
  }
  return v;
}
export function files(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) throw new ApiError(400, 'Invalid files');
  return [...new Set(value.map(v => {
    const raw = text(v, 'file path', 512).replace(/\\/g, '/');
    const f = path.posix.normalize(raw);
    if (f === '.' || f.startsWith('/') || /^[A-Za-z]:/.test(f) || f === '..' || f.startsWith('../') || f.includes('\0')) {
      throw new ApiError(400, 'File paths must be repository-relative');
    }
    if (['__proto__', 'constructor', 'prototype'].includes(f)) throw new ApiError(400, 'Reserved file path');
    return f;
  }))];
}
export function authorize(room: RoomState, clientId: string, token: unknown): void {
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) {
    throw new ApiError(401, 'A participant token is required. Update your CoWork client.');
  }
  room.participantKeys ??= {};
  const hash = createHash('sha256').update(token).digest('hex');
  const existing = room.participantKeys[clientId];
  if (existing && !timingSafeEqual(Buffer.from(existing), Buffer.from(hash))) {
    throw new ApiError(403, 'This handle belongs to another session. Choose a different handle or restore its participant token.');
  }
  room.participantKeys[clientId] = hash;
}
// Operational hints are deliberately free of secrets: never echo driver messages (they can
// contain hostnames/credentials). Codes + static hints are enough to diagnose a bad deploy.
const STORAGE_HINTS: Record<string, string> = {
  ENOTFOUND: 'database host not found - use the Supabase pooler hostname from the connection URI',
  EAI_AGAIN: 'database host lookup failed - retry; DNS problem in this runtime',
  ECONNREFUSED: 'connection refused - use the transaction pooler (port 6543), not the direct 5432 host',
  ETIMEDOUT: 'connect timed out - serverless runtimes cannot reach IPv6-only direct connections; use the transaction pooler',
  ECONNRESET: 'connection reset - check sslmode in the connection string',
  '28': 'database rejected the credentials - re-check the password (percent-encode special characters)',
  '3D': 'database name not found - the URI path must be /postgres',
  '42': 'permission denied creating cowork_rooms - run the one-time SQL from the README',
};

export function errorResponse(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof ApiError) return { status: err.status, body: { ok: false, error: err.message } };
  const e = err as { message?: string; code?: string; errno?: string };
  if (e?.message === 'DATABASE_URL is required in production') {
    return { status: 503, body: { ok: false, error: 'Relay storage not configured', code: 'DATABASE_URL_MISSING', hint: 'Add DATABASE_URL to Vercel Production environment variables, then redeploy.' } };
  }
  const key = String(e?.code || e?.errno || '');
  const hint = STORAGE_HINTS[key] || STORAGE_HINTS[key.slice(0, 2)] || 'database unreachable - check the connection string, pooler port and network';
  return { status: 503, body: { ok: false, error: 'Relay storage unavailable; retry later.', code: 'STORAGE_UNAVAILABLE', storageCode: key || undefined, hint } };
}
