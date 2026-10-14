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
export function errorResponse(err: unknown) {
  return err instanceof ApiError
    ? { status: err.status, body: { ok: false, error: err.message } }
    : { status: 503, body: { ok: false, error: 'Relay storage unavailable; retry later.' } };
}
