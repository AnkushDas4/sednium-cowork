import fs from 'node:fs';
import path from 'node:path';
import type { RoomState, FileLockInfo, CoWorkMessage } from './_types.js';

export const LOCK_TTL_MS = 90_000; // 90 seconds
const STORAGE_FILE = process.env.COWORK_STORAGE_PATH || '/tmp/cowork_state.json';

// In-Memory Singleton Store
const memoryStore = new Map<string, RoomState>();
let isPostgresInitialized = false;
let pgClient: any = null;

// Helper: initialize PostgreSQL pool/client if DATABASE_URL is provided
async function getPostgresPool() {
  if (!process.env.DATABASE_URL) return null;
  if (pgClient) return pgClient;

  try {
    const { Pool } = await import('pg');
    pgClient = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });

    // Create table if not exists
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS cowork_rooms (
        room_code VARCHAR(64) PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    isPostgresInitialized = true;
    return pgClient;
  } catch (err) {
    console.warn('[CoWork Store] PostgreSQL connection failed, falling back to local file store:', err);
    return null;
  }
}

// Helper: Load initial state from disk cache into memory
function loadDiskStore(): void {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
      const parsed = JSON.parse(data) as Record<string, RoomState>;
      for (const [code, state] of Object.entries(parsed)) {
        memoryStore.set(code, state);
      }
    }
  } catch (err) {
    console.warn('[CoWork Store] Warning reading disk cache:', err);
  }
}

// Helper: Persist memory state to disk cache
function persistDiskStore(): void {
  try {
    const obj: Record<string, RoomState> = {};
    for (const [code, state] of memoryStore.entries()) {
      obj[code] = state;
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[CoWork Store] Warning writing disk cache:', err);
  }
}

// Initial sync on module load
loadDiskStore();

/**
 * Sweeps and removes file locks that have expired:
 * 1. Lock age > LOCK_TTL_MS (90s)
 * 2. Holding participant lastSeen heartbeat > LOCK_TTL_MS (90s ago)
 */
export function cleanExpiredLocks(room: RoomState): boolean {
  const now = Date.now();
  let modified = false;

  for (const [file, lock] of Object.entries(room.fileLocks)) {
    const holder = room.participants[lock.lockedBy];
    const isLockAged = (now - lock.timestamp) > LOCK_TTL_MS;
    const isHolderStale = holder ? (now - holder.lastSeen) > LOCK_TTL_MS : true;

    if (isLockAged || isHolderStale) {
      delete room.fileLocks[file];
      modified = true;

      const messageText = isHolderStale
        ? `[SYSTEM] Auto-released file lock due to disconnected agent (@${lock.lockedBy}) on "${file}".`
        : `[SYSTEM] Auto-released expired file lock on "${file}" after exceeding 90s TTL.`;

      const auditMsg: CoWorkMessage = {
        messageId: `sys_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
        inbox.push(auditMsg);
      }
    }
  }

  return modified;
}

/**
 * Creates default empty room state
 */
export function createDefaultRoom(roomCode: string): RoomState {
  return {
    roomCode,
    createdAt: Date.now(),
    latestCommit: null,
    participants: {},
    fileLocks: {},
    inboxes: {},
    history: []
  };
}

/**
 * Gets or initializes a room state.
 */
export async function getRoom(rawCode: string): Promise<RoomState> {
  const roomCode = rawCode.trim().toUpperCase();
  const pool = await getPostgresPool();

  if (pool) {
    try {
      const res = await pool.query('SELECT state FROM cowork_rooms WHERE room_code = $1', [roomCode]);
      if (res.rows.length > 0) {
        const state: RoomState = res.rows[0].state;
        const modified = cleanExpiredLocks(state);
        if (modified) {
          await saveRoom(state);
        }
        memoryStore.set(roomCode, state);
        return state;
      }
    } catch (err) {
      console.warn('[CoWork Store] Postgres read error:', err);
    }
  }

  // Memory/Disk Fallback
  let room = memoryStore.get(roomCode);
  if (!room) {
    room = createDefaultRoom(roomCode);
    memoryStore.set(roomCode, room);
    persistDiskStore();
  } else {
    const modified = cleanExpiredLocks(room);
    if (modified) {
      persistDiskStore();
    }
  }

  return room;
}

/**
 * Persists room state to storage.
 */
export async function saveRoom(state: RoomState): Promise<void> {
  const roomCode = state.roomCode.trim().toUpperCase();
  cleanExpiredLocks(state);

  memoryStore.set(roomCode, state);
  persistDiskStore();

  const pool = await getPostgresPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO cowork_rooms (room_code, state, updated_at) 
         VALUES ($1, $2, NOW()) 
         ON CONFLICT (room_code) 
         DO UPDATE SET state = $2, updated_at = NOW()`,
        [roomCode, JSON.stringify(state)]
      );
    } catch (err) {
      console.warn('[CoWork Store] Postgres save error:', err);
    }
  }
}

/**
 * Resets store state (used for tests)
 */
export async function resetStore(): Promise<void> {
  memoryStore.clear();
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      fs.unlinkSync(STORAGE_FILE);
    }
  } catch (err) {
    // ignore
  }
}
