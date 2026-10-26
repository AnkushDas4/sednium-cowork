import { randomUUID } from 'node:crypto';
import type { RoomState } from './_types.js';
import { ApiError } from './_validation.js';

export interface UpstashConfig {
  url: string;
  token: string;
}

export function getUpstashConfig(): UpstashConfig | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
  if (url && token) return { url, token };
  return null;
}

export function isUpstashConfigured(): boolean {
  return getUpstashConfig() !== null;
}

/**
 * Execute an arbitrary Redis command over Upstash REST API.
 */
export async function upstashExec<T = unknown>(
  command: (string | number)[],
  config?: UpstashConfig | null,
): Promise<T> {
  const conf = config ?? getUpstashConfig();
  if (!conf) {
    throw new Error('Upstash Redis is not configured: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required');
  }

  const endpoint = conf.url.replace(/\/+$/, '');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${conf.token}`,
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upstash Redis HTTP ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { result?: T; error?: string };
  if (data.error) {
    throw new Error(`Upstash Redis command error: ${data.error}`);
  }
  return data.result as T;
}

/**
 * Acquire a distributed lock for roomCode with TTL and exponential jitter retry.
 */
export async function acquireUpstashLock(
  code: string,
  lockToken: string,
  ttlMs = 6000,
  maxWaitMs = 4000,
  config?: UpstashConfig | null,
): Promise<boolean> {
  const key = `cowork:lock:${code.toUpperCase()}`;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const res = await upstashExec<string | null>(
      ['SET', key, lockToken, 'NX', 'PX', ttlMs],
      config,
    ).catch(() => null);

    if (res === 'OK') return true;
    // Jittered backoff between 30ms and 70ms
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 40));
  }
  return false;
}

/**
 * Release the distributed lock safely using an atomic Lua script.
 */
export async function releaseUpstashLock(
  code: string,
  lockToken: string,
  config?: UpstashConfig | null,
): Promise<void> {
  const key = `cowork:lock:${code.toUpperCase()}`;
  const lua = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
  await upstashExec(['EVAL', lua, 1, key, lockToken], config).catch(() => 0);
}

/**
 * Mutate a room atomically in Upstash Redis under a distributed lock.
 */
export async function mutateRoomUpstash<T>(
  rawCode: string,
  fn: (room: RoomState) => T | Promise<T>,
  cleanExpiredLocks: (room: RoomState) => boolean,
  createDefaultRoom: (code: string) => RoomState,
  config?: UpstashConfig | null,
): Promise<T> {
  const code = rawCode.toUpperCase();
  const lockToken = randomUUID();
  const locked = await acquireUpstashLock(code, lockToken, 6000, 4000, config);
  if (!locked) {
    throw new ApiError(503, 'Room lock acquisition timeout in Upstash; please retry');
  }

  try {
    const key = `cowork:room:${code}`;
    const raw = await upstashExec<string | null>(['GET', key], config);
    let state: RoomState;

    if (!raw) {
      state = createDefaultRoom(code);
    } else {
      try {
        state = typeof raw === 'string' ? JSON.parse(raw) : (raw as RoomState);
      } catch {
        state = createDefaultRoom(code);
      }
    }

    cleanExpiredLocks(state);
    const result = await fn(state);
    await upstashExec(['SET', key, JSON.stringify(state)], config);
    return result;
  } finally {
    await releaseUpstashLock(code, lockToken, config);
  }
}

/**
 * Reserve a unique room in Upstash Redis using atomic SET ... NX.
 */
export async function generateUniqueRoomUpstash(
  createDefaultRoom: (code: string, inviteHash?: string) => RoomState,
  mintInviteKey: () => { inviteKey: string; inviteHash: string },
  randomHex: () => string,
  config?: UpstashConfig | null,
): Promise<{ roomCode: string; inviteKey: string }> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = `SED-${randomHex()}`;
    const { inviteKey, inviteHash } = mintInviteKey();
    const state = createDefaultRoom(code, inviteHash);
    const key = `cowork:room:${code}`;
    const res = await upstashExec<string | null>(['SET', key, JSON.stringify(state), 'NX'], config);
    if (res === 'OK') {
      return { roomCode: code, inviteKey };
    }
  }
  throw new Error('Unable to reserve unique room in Upstash');
}
