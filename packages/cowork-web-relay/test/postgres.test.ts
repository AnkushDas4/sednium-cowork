import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Contract tests with a fake pg transport. Never read or connect to a user's database.
const fake = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), connect: vi.fn(), on: vi.fn(), pool: vi.fn() }));
vi.mock('pg', () => ({ Pool: class {
  constructor(options: unknown) { fake.pool(options); }
  query = fake.query; connect = fake.connect; on = fake.on;
} }));
beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('DATABASE_URL', 'postgresql://user:placeholder@db.example.test:6543/postgres');
  fake.connect.mockResolvedValue({ query: fake.query, release: fake.release });
  fake.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith('SELECT state') ? [{ state: {
    roomCode: 'DB-TEST', createdAt: 1, participants: {}, inboxes: {}, fileLocks: {}, history: [], latestCommit: null,
  } }] : [], rowCount: 1 }));
});
afterEach(() => vi.unstubAllEnvs());

describe('Postgres transaction contract', () => {
  it('uses one checked-out connection and locks before mutation/update', async () => {
    const { mutateRoom } = await import('../api/_store.js');
    await mutateRoom('DB-TEST', room => { room.createdAt = 2; });
    const calls = fake.query.mock.calls.map(c => c[0]);
    const lock = calls.findIndex(s => s.includes('FOR UPDATE'));
    const update = calls.findIndex(s => s.startsWith('UPDATE'));
    expect(lock).toBeGreaterThan(0); expect(update).toBeGreaterThan(lock);
    expect(calls.at(-1)).toBe('COMMIT');
    expect(fake.release).toHaveBeenCalledTimes(2); // initialization + mutation
    expect(calls.some(s => s.includes('ENABLE ROW LEVEL SECURITY'))).toBe(true);
    expect(fake.pool.mock.calls[0][0].ssl).toEqual({ rejectUnauthorized: true });
    expect(fake.pool.mock.calls[0][0].connectionString).not.toContain('sslmode');
  });
  it('rolls back and propagates write failures rather than falling back', async () => {
    fake.query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE')) throw new Error('database down');
      return { rows: sql.startsWith('SELECT state') ? [{ state: { roomCode: 'DB-TEST', fileLocks: {} } }] : [] };
    });
    const { mutateRoom } = await import('../api/_store.js');
    await expect(mutateRoom('DB-TEST', () => 'ok')).rejects.toThrow('database down');
    expect(fake.query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(fake.release).toHaveBeenCalledTimes(2);
  });
  it('fails closed without DATABASE_URL in production', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { getRoom } = await import('../api/_store.js');
    await expect(getRoom('DB-TEST')).rejects.toThrow('DATABASE_URL');
    expect(fake.connect).not.toHaveBeenCalled();
  });
  it('never connects to PostgreSQL or resets its data under NODE_ENV=test', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { getRoom, resetStore } = await import('../api/_store.js');
    await getRoom('ISOLATED'); await resetStore();
    expect(fake.connect).not.toHaveBeenCalled();
    expect(fake.pool).not.toHaveBeenCalled();
  });
  it('retries failed initialization without accepting writes', async () => {
    fake.connect.mockRejectedValueOnce(new Error('unavailable'));
    const { getRoom } = await import('../api/_store.js');
    await expect(getRoom('DB-TEST')).rejects.toThrow('unavailable');
    await expect(getRoom('DB-TEST')).resolves.toMatchObject({ roomCode: 'DB-TEST' });
  });
});
