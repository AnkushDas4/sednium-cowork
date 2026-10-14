import path from 'node:path';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ActivityInfo, ActivityState, RoomState } from './_types.js';

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
const ACTIVITY_STATES = [
  'idle','thinking','reading','editing','testing','debugging','syncing','reviewing','blocked','done','error',
] as const;
export const ACTIVITY_SUMMARY_MAX = 240;
export const ACTIVITY_DETAIL_MAX = 1600;
export const ACTIVITY_FILES_MAX = 24;

const clip = (value: string, max: number): [string, boolean] =>
  value.length > max ? [value.slice(0, max - 1).trimEnd() + '\u2026', true] : [value, false];

/** Control characters would break the one-line rendering and smuggle escape sequences into the UI. */
function printable(value: unknown, name: string, max: number, allowNewlines: boolean): [string, boolean] {
  if (typeof value !== 'string') throw new ApiError(400, `Invalid ${name}`);
  let v = allowNewlines ? value.replace(/\r\n?/g, '\n') : value.replace(/[\r\n]+/g, ' ');
  v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return clip(v, max);
}

/**
 * Validate the presence heartbeat's activity patch.
 * `undefined` means "unchanged" (a plain poll must not erase it); `null` means "clear it".
 * Oversized text is clipped, never rejected: a heartbeat that fails validation would silently
 * drop the agent's presence, which is worse than a truncated thought.
 */
export function activityInfo(value: unknown): ActivityInfo | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400, 'Invalid activity');
  const raw = value as Record<string, unknown>;
  const state = String(raw.state ?? '').toLowerCase();
  if (!ACTIVITY_STATES.includes(state as (typeof ACTIVITY_STATES)[number])) {
    throw new ApiError(400, 'Invalid activity state');
  }

  let truncated = false;
  const out: ActivityInfo = { state: state as ActivityState, at: Date.now() };

  if (raw.summary !== undefined && raw.summary !== null && raw.summary !== '') {
    const [summary, clipped] = printable(raw.summary, 'activity summary', ACTIVITY_SUMMARY_MAX, false);
    if (summary) { out.summary = summary; truncated ||= clipped; }
  }
  if (raw.detail !== undefined && raw.detail !== null && raw.detail !== '') {
    const [detail, clipped] = printable(raw.detail, 'activity detail', ACTIVITY_DETAIL_MAX, true);
    if (detail) { out.detail = detail; truncated ||= clipped; }
  }
  if (raw.tool !== undefined && raw.tool !== null && raw.tool !== '') {
    const [tool, clipped] = printable(raw.tool, 'activity tool', 64, false);
    const safe = tool.replace(/[^\w.:/+ -]/g, '');
    if (safe) { out.tool = safe; truncated ||= clipped; }
  }
  if (raw.files !== undefined && raw.files !== null) {
    // files() already explains what is wrong with a bad path; do not flatten that into a generic 400.
    let paths: string[] = files(raw.files);
    if (paths.length > ACTIVITY_FILES_MAX) { paths = paths.slice(0, ACTIVITY_FILES_MAX); truncated = true; }
    if (paths.length) out.files = paths;
  }
  if (truncated) out.truncated = true;
  return out;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Mint a room's invite key: the secret that authorises the room code. */
export function mintInviteKey(): { inviteKey: string; inviteHash: string } {
  const inviteKey = randomBytes(24).toString('hex');
  return { inviteKey, inviteHash: sha256(inviteKey) };
}

/**
 * Rooms created with an invite key reject code-only clients. Rooms that predate the feature
 * have no hash and stay code-only, so an upgrade never locks an existing session out.
 */
export function authorizeInvite(room: RoomState, inviteKey: unknown): void {
  if (!room.inviteHash) return;
  if (typeof inviteKey !== 'string' || !/^[a-fA-F0-9]{48,64}$/.test(inviteKey.trim())) {
    throw new ApiError(401, 'This room requires its invite key. Open the original invite link (it carries #k=...) or ask a member to re-share it.');
  }
  const candidate = sha256(inviteKey.trim().toLowerCase());
  if (candidate.length !== room.inviteHash.length || !timingSafeEqual(Buffer.from(candidate), Buffer.from(room.inviteHash))) {
    throw new ApiError(403, 'Invalid invite key for this room.');
  }
}

export function authorize(room: RoomState, clientId: string, token: unknown): void {
  if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{32,128}$/.test(token)) {
    throw new ApiError(401, 'A participant token is required. Update your CoWork client.');
  }
  room.participantKeys ??= {};
  const hash = sha256(token);
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
  SELF_SIGNED_CERT_IN_CHAIN: 'database certificate is not trusted by Node - pin Supabase\'s CA with COWORK_DB_CA_CERT, or set COWORK_DB_TLS=no-verify as a stopgap',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'database certificate is self-signed - pin Supabase\'s CA with COWORK_DB_CA_CERT, or COWORK_DB_TLS=no-verify as a stopgap',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'incomplete certificate chain - pin Supabase\'s CA with COWORK_DB_CA_CERT',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'missing issuer certificate - pin Supabase\'s CA with COWORK_DB_CA_CERT',
  UNABLE_TO_GET_ISSUER_CERT: 'missing issuer certificate - pin Supabase\'s CA with COWORK_DB_CA_CERT',
  CERT_HAS_EXPIRED: 'database certificate expired - retry; if it persists, check Supabase status',
  ERR_TLS_CERT_ALTNAME_FAILED: 'certificate hostname mismatch - the host in DATABASE_URL must match the pooler hostname',
};

export function errorResponse(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof ApiError) return { status: err.status, body: { ok: false, error: err.message } };
  const e = err as { message?: string; code?: string; errno?: string };
  if (typeof e?.message === 'string' && e.message.startsWith('DATABASE_URL')) {
    return { status: 503, body: { ok: false, error: 'Relay storage misconfigured', code: 'DATABASE_URL_INVALID', hint: e.message } };
  }
  if (e?.message === 'DATABASE_URL is required in production') {
    return { status: 503, body: { ok: false, error: 'Relay storage not configured', code: 'DATABASE_URL_MISSING', hint: 'Add DATABASE_URL to Vercel Production environment variables, then redeploy.' } };
  }
  const key = String(e?.code || e?.errno || '');
  const hint = STORAGE_HINTS[key] || STORAGE_HINTS[key.slice(0, 2)] || 'database unreachable - check the connection string, pooler port and network';
  return { status: 503, body: { ok: false, error: 'Relay storage unavailable; retry later.', code: 'STORAGE_UNAVAILABLE', storageCode: key || undefined, hint } };
}
