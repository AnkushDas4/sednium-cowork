import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { handleSend } from '../api/send.js';
import { errorResponse } from '../api/_validation.js';
import presenceHandler, { handlePresence } from '../api/presence.js';
import { generateUniqueRoom, getRoom, mutateRoom, resetStore } from '../api/_store.js';

const token = 'a'.repeat(64);
const roomCode = 'SAFETY';
const send = (p: any) => handleSend({ roomCode, senderId: 'agent', ...p }, token);
const presence = (p: any = {}) => handlePresence({ roomCode, clientId: 'agent', ...p }, token);
beforeEach(() => resetStore());
afterEach(() => vi.useRealTimers());

describe('Relay safety regressions', () => {
  it('serializes concurrent claims, including path aliases', async () => {
    const results = await Promise.all([
      send({ contentType: 'FILE_LOCK', files: ['src/a.ts'] }),
      send({ senderId: 'other', contentType: 'FILE_LOCK', files: ['./src/a.ts'] }),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });
  it('does not lose concurrent messages', async () => {
    await presence();
    await Promise.all(Array.from({ length: 25 }, (_, n) => send({ senderId: 'other', targetId: 'agent', text: `Message ${n}` })));
    expect((await presence()).body.messages).toHaveLength(25);
  });
  it('redelivers unacknowledged messages and removes only acknowledged IDs', async () => {
    await send({ senderId: 'other', targetId: 'agent', text: 'one' });
    const first = await presence();
    expect((await presence()).body.messages).toEqual(first.body.messages);
    await send({ senderId: 'other', targetId: 'agent', text: 'two' });
    const next = await presence({ ack: first.body.messages.map((m: any) => m.messageId) });
    expect(next.body.messages.map((m: any) => m.text)).toEqual(['two']);
  });
  it('rejects missing tokens and impersonation without draining the victim inbox', async () => {
    await expect(handlePresence({ roomCode, clientId: 'agent' })).rejects.toMatchObject({ status: 401 });
    await presence();
    await send({ senderId: 'other', targetId: 'agent', text: 'private' });
    await expect(handlePresence({ roomCode, clientId: 'agent' }, 'b'.repeat(64))).rejects.toMatchObject({ status: 403 });
    await expect(handleSend({ roomCode, senderId: 'agent', contentType: 'FILE_UNLOCK' }, 'b'.repeat(64))).rejects.toMatchObject({ status: 403 });
    expect((await presence()).body.messages).toHaveLength(1);
  });
  it('renews active locks across multiple TTL periods and expires disconnected leases', async () => {
    vi.useFakeTimers();
    await send({ contentType: 'FILE_LOCK', files: ['a.ts'] });
    for (let n = 0; n < 4; n++) { vi.advanceTimersByTime(60_000); await presence(); }
    expect((await getRoom(roomCode)).fileLocks['a.ts']).toBeDefined();
    vi.advanceTimersByTime(91_000);
    expect((await presence()).body.fileLocks['a.ts']).toBeUndefined();
  });
  it('keeps push notifications broadcast despite mentions', async () => {
    await presence({ clientId: 'receiver' });
    await send({ contentType: 'GIT_PUSH', text: 'feat: thanks @other', commitHash: 'a1b2c3d' });
    expect((await presence({ clientId: 'receiver' })).body.messages[0].targetId).toBe('all');
  });
  it.each([
    { text: 123 }, { targetId: 'constructor' }, { senderId: '__proto__' },
    { contentType: 'BAD' }, { files: 'a.ts' }, { commitHash: 123 },
    { contentType: 'FILE_LOCK', files: ['../outside'] },
  ])('rejects malformed input: %j', async payload => {
    await expect(send(payload)).rejects.toMatchObject({ status: 400 });
  });
  it('describes storage failures without leaking driver messages', () => {
    const timeout = errorResponse(Object.assign(new Error('connect ETIMEDOUT db.internal:6543'), { code: 'ETIMEDOUT' }));
    expect(timeout.status).toBe(503);
    expect(timeout.body.code).toBe('STORAGE_UNAVAILABLE');
    expect(String(timeout.body.hint)).toContain('transaction pooler');
    expect(JSON.stringify(timeout.body)).not.toContain('db.internal');
    const auth = errorResponse(Object.assign(new Error('password authentication failed'), { code: '28P01' }));
    expect(String(auth.body.hint)).toContain('credentials');
    const leaked = errorResponse(new Error('relation cowork_rooms does not exist at secret-host'));
    expect(JSON.stringify(leaked.body)).not.toContain('secret-host');
  });
  it('reserves high-entropy room codes with their own invite keys', async () => {
    const rooms = await Promise.all(Array.from({ length: 30 }, () => generateUniqueRoom()));
    const codes = rooms.map(r => r.roomCode);
    const keys = rooms.map(r => r.inviteKey);
    expect(new Set(codes).size).toBe(30);
    expect(new Set(keys).size).toBe(30);
    expect(codes.every(code => /^SED-[A-F0-9]{32}$/.test(code))).toBe(true);
    expect(keys.every(key => /^[a-f0-9]{48}$/.test(key))).toBe(true);
    const stored = await getRoom(codes[0]);
    expect(stored.roomCode).toBe(codes[0]);
    expect(stored.inviteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(keys[0]); // only the digest is persisted
  });
  it('requires the invite key on minted rooms but keeps legacy rooms code-only', async () => {
    const { roomCode, inviteKey } = await generateUniqueRoom();
    const params = { roomCode, clientId: 'member', role: 'agent' as const };
    await expect(handlePresence(params, token)).rejects.toMatchObject({ status: 401 });
    await expect(handlePresence({ ...params }, token, 'f'.repeat(48))).rejects.toMatchObject({ status: 403 });
    await expect(handlePresence({ ...params }, token, inviteKey)).resolves.toMatchObject({ status: 200 });
    await expect(handleSend({ roomCode, senderId: 'member', text: 'hi' }, token, inviteKey)).resolves.toMatchObject({ status: 200 });
    // A room created before the feature (no hash) still accepts code-only clients.
    await expect(handlePresence({ roomCode: 'LEGACY-1', clientId: 'member' }, token)).resolves.toMatchObject({ status: 200 });
  });
  it('never returns the invite hash to clients', async () => {
    const { roomCode, inviteKey } = await generateUniqueRoom();
    const res = await handlePresence({ roomCode, clientId: 'member' }, token, inviteKey);
    expect(JSON.stringify(res.body)).not.toMatch(/inviteHash/i);
  });
  it('rolls back all state when a room mutation fails', async () => {
    await expect(mutateRoom(roomCode, room => { room.history.push({} as any); throw new Error('fail'); })).rejects.toThrow('fail');
    expect((await getRoom(roomCode)).history).toEqual([]);
  });
  it('preserves reported harness/model across plain heartbeats', async () => {
    await presence({ harness: 'Cursor', model: 'Real Model', role: 'agent' });
    await presence();
    await presence({ role: 'human', status: 'Viewing Dashboard' });
    const stored = (await getRoom(roomCode)).participants.agent;
    expect(stored).toMatchObject({ harness: 'Cursor', model: 'Real Model', role: 'human', status: 'Viewing Dashboard' });
  });
  it('forwards model metadata through HTTP and prevents caching', async () => {
    const res = { setHeader: vi.fn(), json: vi.fn(), statusCode: 0 };
    await presenceHandler({ method: 'POST', headers: { 'x-cowork-client-token': token }, body: {
      roomCode, clientId: 'agent', harness: 'Cursor', model: 'Custom model',
    } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json.mock.calls[0][0].participants.agent).toMatchObject({ harness: 'Cursor', model: 'Custom model' });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('participantKeys');
  });
});
