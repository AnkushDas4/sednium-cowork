import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { isGitBusy, acquireGitLock, releaseGitLock, getLatestCommit } from '../src/git.js';

describe('MCP Safe Git Subsystem (git.ts)', () => {
  beforeEach(() => {
    releaseGitLock();
  });

  it('correctly reports git lock state and prevents concurrent operations', async () => {
    expect(isGitBusy('/tmp')).toBe(false);

    const acquired = acquireGitLock();
    expect(acquired).toBe(true);
    expect(isGitBusy('/tmp')).toBe(true);

    // Second acquire should fail
    const secondAcquire = acquireGitLock();
    expect(secondAcquire).toBe(false);

    releaseGitLock();
    expect(isGitBusy('/tmp')).toBe(false);
  });

  it('reads commit info from current repository', async () => {
    const repoPath = path.resolve(__dirname, '../../../');
    const commit = await getLatestCommit(repoPath);

    expect(commit).toBeDefined();
    expect(commit?.hash).toBeDefined();
    expect(commit?.hash.length).toBeGreaterThan(6);
    expect(commit?.message).toBeDefined();
    expect(commit?.author).toBeDefined();
  });
});
