import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ git: {
  branchLocal: vi.fn(), status: vi.fn(), diff: vi.fn(), fetch: vi.fn(), revparse: vi.fn(),
  raw: vi.fn(), merge: vi.fn(), commit: vi.fn(), push: vi.fn(), pull: vi.fn(), checkIsRepo: vi.fn(),
} }));
vi.mock('simple-git', () => ({ simpleGit: () => fake.git }));
import { safeCommitAndPush, safePullRebase, releaseGitLock } from '../src/git.js';
beforeEach(() => {
  vi.resetAllMocks(); releaseGitLock();
  fake.git.branchLocal.mockResolvedValue({ current: 'work' });
  fake.git.status.mockResolvedValue({ conflicted: [], isClean: () => false });
  fake.git.diff.mockResolvedValue(''); fake.git.fetch.mockResolvedValue({});
  fake.git.revparse.mockResolvedValue('abc123456789');
  fake.git.raw.mockResolvedValue('abc123456789');
  fake.git.commit.mockResolvedValue({ commit: 'abc123456789' });
  fake.git.push.mockResolvedValue({}); fake.git.checkIsRepo.mockResolvedValue(true);
});
afterEach(() => releaseGitLock());
describe('Git safety (mocked; never mutates the checkout)', () => {
  it('refuses the wrong branch before fetching or staging', async () => {
    const result = await safeCommitAndPush('/nonexistent', 'test', 'main', 'origin', ['a.ts']);
    expect(result.success).toBe(false); expect(fake.git.fetch).not.toHaveBeenCalled();
    expect(fake.git.commit).not.toHaveBeenCalled();
  });
  it('refuses missing explicit file selection', async () => {
    expect((await safeCommitAndPush('/nonexistent', 'test', 'work')).success).toBe(false);
    expect(fake.git.fetch).not.toHaveBeenCalled();
  });
  it('stops after a failed fetch without staging, committing or pushing', async () => {
    fake.git.fetch.mockRejectedValue(new Error('network failed'));
    expect((await safeCommitAndPush('/nonexistent', 'test', 'work', 'origin', ['a.ts'])).success).toBe(false);
    expect(fake.git.raw).not.toHaveBeenCalled(); expect(fake.git.commit).not.toHaveBeenCalled(); expect(fake.git.push).not.toHaveBeenCalled();
  });
  it('refuses unrelated staged changes', async () => {
    fake.git.diff.mockResolvedValue('secret.env\0');
    expect((await safeCommitAndPush('/nonexistent', 'test', 'work', 'origin', ['a.ts'])).success).toBe(false);
    expect(fake.git.fetch).not.toHaveBeenCalled();
  });
  it('stages only literal selected paths and pushes HEAD to the validated branch', async () => {
    fake.git.diff.mockResolvedValueOnce('').mockResolvedValueOnce('a.ts').mockResolvedValueOnce('a.ts\0');
    const result = await safeCommitAndPush('/nonexistent', 'test', 'work', 'origin', ['./a.ts']);
    expect(result.success).toBe(true);
    expect(fake.git.raw).toHaveBeenCalledWith(['--literal-pathspecs', 'add', '--', 'a.ts']);
    expect(fake.git.push).toHaveBeenCalledWith('origin', 'HEAD:refs/heads/work');
  });
  it('does not auto-pull into a dirty tree', async () => {
    expect(await safePullRebase('/nonexistent', 'work')).toMatchObject({ success: false, skipped: true });
    expect(fake.git.pull).not.toHaveBeenCalled();
  });
});
