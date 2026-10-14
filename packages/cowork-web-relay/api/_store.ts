import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { RoomState, CoWorkMessage } from './_types.js';
import { ApiError, id } from './_validation.js';

export const LOCK_TTL_MS = 90_000;
const memoryStore = new Map<string, RoomState>();
let pool: Pool | undefined;
let initialized: Promise<void> | undefined;
let memoryTail: Promise<unknown> = Promise.resolve();

// Tests ALWAYS use isolated process memory, even if DATABASE_URL is inherited.
function database(): Pool | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
      throw new Error('DATABASE_URL is required in production');
    }
    return null;
  }
  if (!pool) {
    const url = new URL(process.env.DATABASE_URL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && !url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'verify-full');
    }
    pool = new Pool({
      connectionString: url.toString(), max: 3, idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 3_000, statement_timeout: 8_000,
    });
    pool.on('error', () => console.error('[CoWork] Idle database connection failed; reconnecting on next request.'));
  }
  return pool;
}
async function initialize(p: Pool): Promise<void> {
  initialized ??= (async () => {
    const c = await p.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(73180421)');
      await c.query(`CREATE TABLE IF NOT EXISTS public.cowork_rooms (
        room_code VARCHAR(64) PRIMARY KEY, state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await c.query('ALTER TABLE public.cowork_rooms ENABLE ROW LEVEL SECURITY');
      await c.query('REVOKE ALL ON public.cowork_rooms FROM PUBLIC');
      // Supabase API roles must not bypass the relay via the public Data API.
      await c.query(`DO $$ BEGIN
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
          REVOKE ALL ON public.cowork_rooms FROM anon;
        END IF;
        IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
          REVOKE ALL ON public.cowork_rooms FROM authenticated;
        END IF;
      END $$`);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK'); throw e; }
    finally { c.release(); }
  })().catch(e => { initialized = undefined; throw e; });
  return initialized;
}

export function cleanExpiredLocks(room: RoomState): boolean {
  const now = Date.now();
  let modified = false;

  for (const [file, lock] of Object.entries(room.fileLocks)) {
    const holder = room.participants[lock.lockedBy];
    const isLockAged = (now - lock.timestamp) > LOCK_TTL_MS;
    const isHolderStale = holder ? (now - holder.lastSeen) > LOCK_TTL_MS : false;

    if (isLockAged || isHolderStale) {
      delete room.fileLocks[file];
      modified = true;

      const messageText = isHolderStale
        ? `[SYSTEM] Auto-released file lock due to disconnected agent (@${lock.lockedBy}) on "${file}".`
        : `[SYSTEM] Auto-released expired file lock on "${file}" after exceeding 90s TTL.`;

      const auditMsg: CoWorkMessage = {
        messageId: `sys_${randomUUID()}`,
        timestamp: now,
        roomCode: room.roomCode,
        senderId: 'SYSTEM',
        targetId: 'all',
        contentType: 'STATUS',
        text: messageText,
        files: [file]
      };

      room.history.push(auditMsg);
      if (room.history.length > 100) {
        room.history.shift();
      }

      // Also notify any connected participants
      for (const [clientId, inbox] of Object.entries(room.inboxes)) {
        if (inbox.length < 1000) inbox.push(auditMsg);
      }
    }
  }

  return modified;
}

export function createDefaultRoom(roomCode: string): RoomState {
  return { roomCode, createdAt: Date.now(), latestCommit: null,
    participants: {}, fileLocks: {}, inboxes: {}, history: [], participantKeys: {} };
}

/** All API read/modify/write operations execute under one room row lock. */
export async function mutateRoom<T>(rawCode: string, fn: (room: RoomState) => T | Promise<T>): Promise<T> {
  const code = id(rawCode, 'roomCode').toUpperCase();
  const p = database();
  if (!p) {
    const job = memoryTail.then(async () => {
      const state = structuredClone(memoryStore.get(code) ?? createDefaultRoom(code));
      cleanExpiredLocks(state);
      const result = await fn(state);
      memoryStore.set(code, state);
      return structuredClone(result);
    });
    memoryTail = job.catch(() => {});
    return job;
  }
  await initialize(p);
  const c = await p.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout = '4s'");
    await c.query(`INSERT INTO public.cowork_rooms(room_code, state) VALUES ($1, $2)
      ON CONFLICT (room_code) DO NOTHING`, [code, JSON.stringify(createDefaultRoom(code))]);
    const { rows } = await c.query('SELECT state FROM public.cowork_rooms WHERE room_code=$1 FOR UPDATE', [code]);
    const state: RoomState = rows[0].state;
    cleanExpiredLocks(state);
    const result = await fn(state);
    await c.query('UPDATE public.cowork_rooms SET state=$2, updated_at=NOW() WHERE room_code=$1', [code, JSON.stringify(state)]);
    await c.query('COMMIT');
    return result;
  } catch (e) { await c.query('ROLLBACK'); throw e; }
  finally { c.release(); }
}

// Snapshot helpers for tests/inspection; API writes must use mutateRoom.
export async function getRoom(code: string): Promise<RoomState> {
  return mutateRoom(code, room => structuredClone(room));
}
export async function saveRoom(state: RoomState): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('Use mutateRoom for writes');
  await mutateRoom(state.roomCode, room => { Object.assign(room, structuredClone(state)); });
}
export async function generateUniqueRoomCode(): Promise<string> {
  const p = database();
  if (p) await initialize(p);
  for (let attempt = 0; attempt < 10; attempt++) {
    // The room code is an unguessable invite capability; share it only with teammates.
    const code = `SED-${randomBytes(16).toString('hex').toUpperCase()}`;
    const state = createDefaultRoom(code);
    if (p) {
      const res = await p.query(`INSERT INTO public.cowork_rooms(room_code,state) VALUES($1,$2)
        ON CONFLICT DO NOTHING RETURNING room_code`, [code, JSON.stringify(state)]);
      if (res.rowCount) return code;
    } else if (!memoryStore.has(code)) {
      memoryStore.set(code, state);
      return code;
    }
  }
  throw new Error('Unable to reserve room');
}
export async function resetStore(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') throw new Error('resetStore is test-only');
  await memoryTail;
  memoryStore.clear();
}
export function enqueue(room: RoomState, clientId: string, message: CoWorkMessage): void {
  if (!room.inboxes[clientId] && Object.keys(room.inboxes).length >= 100) throw new ApiError(429, 'Room inbox limit reached');
  const inbox = room.inboxes[clientId] ??= [];
  if (inbox.length >= 1000) throw new ApiError(429, 'Recipient inbox full; recipient must acknowledge messages');
  inbox.push(message);
}
