import { describe, expect, it, vi } from 'vitest';

// Storage failures must produce a clean 503: no client leak of internals, no crash in logging.
vi.mock('../api/_store.js', () => ({
  mutateRoom: vi.fn(async () => { throw new Error('pg connection refused at secret-host:5432'); }),
  enqueue: vi.fn(),
  generateUniqueRoomCode: vi.fn(async () => { throw new Error('pg connection refused'); }),
}));

const sendHandlerModule = (await import('../api/send.js')).default;
const presenceHandlerModule = (await import('../api/presence.js')).default;
const token = 'a'.repeat(64);
const respond = () => {
  const res: any = { setHeader: vi.fn(), json: vi.fn(), statusCode: 0 };
  return res;
};

describe('Handler failure contract', () => {
  it('returns 503 without leaking storage internals on send', async () => {
    const res = respond();
    await sendHandlerModule({ method: 'POST', headers: { 'x-cowork-client-token': token }, body: {
      roomCode: 'FAIL1', senderId: 'agent', contentType: 'CHAT', text: 'hello',
    } }, res);
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret-host');
  });
  it('returns 503 without crashing on a failed heartbeat', async () => {
    const res = respond();
    await presenceHandlerModule({ method: 'POST', headers: { 'x-cowork-client-token': token }, body: {
      roomCode: 'FAIL1', clientId: 'agent',
    } }, res);
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret-host');
  });
});
