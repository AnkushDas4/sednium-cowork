import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isUpstashConfigured,
  getUpstashConfig,
  upstashExec,
  acquireUpstashLock,
  releaseUpstashLock,
  mutateRoomUpstash,
  generateUniqueRoomUpstash,
} from '../api/_upstash.js';
import { createDefaultRoom, cleanExpiredLocks } from '../api/_store.js';

describe('Upstash Redis Serverless Storage Engine', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://mock-redis.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mock-token-xyz');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
  });

  it('detects Upstash configuration correctly from environment', () => {
    expect(isUpstashConfigured()).toBe(true);
    expect(getUpstashConfig()).toEqual({
      url: 'https://mock-redis.upstash.io',
      token: 'mock-token-xyz',
    });

    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    expect(isUpstashConfigured()).toBe(false);
    expect(getUpstashConfig()).toBeNull();
  });

  it('executes arbitrary Redis command over HTTP REST with authorization', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'PONG' }),
    });
    globalThis.fetch = mockFetch;

    const res = await upstashExec<string>(['PING']);
    expect(res).toBe('PONG');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://mock-redis.upstash.io');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('Bearer mock-token-xyz');
    expect(JSON.parse(init.body)).toEqual(['PING']);
  });

  it('handles Upstash command-level errors gracefully', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'WRONGTYPE Operation against a key holding the wrong kind of value' }),
    });

    await expect(upstashExec(['GET', 'badkey'])).rejects.toThrow('WRONGTYPE');
  });

  it('acquires and releases distributed lock safely using Redis atomic commands', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    // 1. SET NX PX succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 'OK' }),
    });

    const acquired = await acquireUpstashLock('TEST-ROOM', 'token-123', 5000, 1000);
    expect(acquired).toBe(true);
    expect(fetchMock.mock.calls[0][1].body).toContain('cowork:lock:TEST-ROOM');

    // 2. Lua script release succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: 1 }),
    });

    await releaseUpstashLock('TEST-ROOM', 'token-123');
    expect(fetchMock.mock.calls[1][1].body).toContain('EVAL');
  });

  it('mutates room atomically under Upstash lock and saves new state', async () => {
    const state = createDefaultRoom('TEST-UPSTASH');
    const store = new Map<string, string>();
    store.set('cowork:room:TEST-UPSTASH', JSON.stringify(state));

    globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
      const [cmd, key, val] = JSON.parse(init.body);
      if (cmd === 'SET' && init.body.includes('NX')) {
        return { ok: true, json: async () => ({ result: 'OK' }) };
      }
      if (cmd === 'GET') {
        return { ok: true, json: async () => ({ result: store.get(key) || null }) };
      }
      if (cmd === 'SET') {
        store.set(key, val);
        return { ok: true, json: async () => ({ result: 'OK' }) };
      }
      if (cmd === 'EVAL') {
        return { ok: true, json: async () => ({ result: 1 }) };
      }
      return { ok: true, json: async () => ({ result: null }) };
    });

    const result = await mutateRoomUpstash(
      'TEST-UPSTASH',
      (room) => {
        room.participants['gemini-agent'] = {
          clientId: 'gemini-agent',
          role: 'agent',
          status: 'Coding',
          lastSeen: Date.now(),
        };
        return 'mutated-ok';
      },
      cleanExpiredLocks,
      createDefaultRoom,
    );

    expect(result).toBe('mutated-ok');
    const saved = JSON.parse(store.get('cowork:room:TEST-UPSTASH')!);
    expect(saved.participants['gemini-agent'].status).toBe('Coding');
  });

  it('generates a unique room code with SET NX on Upstash', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'OK' }),
    });

    const { mintInviteKey } = await import('../api/_validation.js');
    const room = await generateUniqueRoomUpstash(
      createDefaultRoom,
      mintInviteKey,
      () => 'ABCD1234EFGH5678',
    );

    expect(room.roomCode).toBe('SED-ABCD1234EFGH5678');
    expect(room.inviteKey).toBeDefined();
    expect(room.inviteKey.length).toBeGreaterThan(20);
  });
});
