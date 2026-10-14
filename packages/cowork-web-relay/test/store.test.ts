import { describe, it, expect, beforeEach } from 'vitest';
import { getRoom, saveRoom, cleanExpiredLocks, resetStore, LOCK_TTL_MS } from '../api/_store.js';
import type { RoomState } from '../api/_types.js';

describe('Relay Storage Engine (_store.ts)', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('auto-creates a new room with proper defaults if not found', async () => {
    const room = await getRoom('TEST101');
    expect(room.roomCode).toBe('TEST101');
    expect(room.participants).toEqual({});
    expect(room.fileLocks).toEqual({});
    expect(room.inboxes).toEqual({});
    expect(room.history).toEqual([]);
    expect(room.latestCommit).toBeNull();
    expect(room.createdAt).toBeGreaterThan(0);
  });

  it('saves and updates room state', async () => {
    const room = await getRoom('TEST102');
    room.participants['loid-ai'] = {
      clientId: 'loid-ai',
      role: 'agent',
      status: 'Coding',
      lastSeen: Date.now(),
    };
    await saveRoom(room);

    const reloaded = await getRoom('TEST102');
    expect(reloaded.participants['loid-ai']).toBeDefined();
    expect(reloaded.participants['loid-ai'].status).toBe('Coding');
  });

  it('preserves valid file locks within TTL', async () => {
    const room = await getRoom('TEST103');
    const now = Date.now();
    room.participants['agent-1'] = {
      clientId: 'agent-1',
      role: 'agent',
      status: 'Active',
      lastSeen: now,
    };
    room.fileLocks['src/App.tsx'] = {
      lockedBy: 'agent-1',
      task: 'Build UI',
      timestamp: now - 30_000, // 30s ago (within 90s TTL)
    };

    const expired = cleanExpiredLocks(room);
    expect(expired).toBe(false);
    expect(room.fileLocks['src/App.tsx']).toBeDefined();
  });

  it('auto-expires file locks older than 90s TTL', async () => {
    const room = await getRoom('TEST104');
    const now = Date.now();
    room.participants['agent-2'] = {
      clientId: 'agent-2',
      role: 'agent',
      status: 'Active',
      lastSeen: now,
    };
    room.fileLocks['src/old.ts'] = {
      lockedBy: 'agent-2',
      task: 'Refactor',
      timestamp: now - 95_000, // 95s ago (> 90s TTL)
    };

    const expired = cleanExpiredLocks(room);
    expect(expired).toBe(true);
    expect(room.fileLocks['src/old.ts']).toBeUndefined();
    // System audit message recorded in history
    expect(room.history.length).toBeGreaterThan(0);
    expect(room.history[0].text).toContain('Auto-released expired file lock');
  });

  it('auto-expires file locks if holding agent heartbeat is stale (>90s)', async () => {
    const room = await getRoom('TEST105');
    const now = Date.now();
    room.participants['agent-ghost'] = {
      clientId: 'agent-ghost',
      role: 'agent',
      status: 'Disconnected',
      lastSeen: now - 100_000, // heart beat stale
    };
    room.fileLocks['src/stuck.ts'] = {
      lockedBy: 'agent-ghost',
      task: 'Crashed job',
      timestamp: now - 10_000, // lock timestamp was recent, but heartbeat dead
    };

    const expired = cleanExpiredLocks(room);
    expect(expired).toBe(true);
    expect(room.fileLocks['src/stuck.ts']).toBeUndefined();
    expect(room.history[0].text).toContain('Auto-released file lock due to disconnected agent');
  });
});
