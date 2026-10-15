import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloneRepo, getRemoteUrl, pointsAtRepo, releaseGitLock, safeCommitAndPush } from '../src/git.js';

/**
 * The agent-side half of "one repository per room": refuse to push somewhere the room did not agree
 * to, and never clone over anybody's work. These run against throwaway `git init` repos, because a
 * guard that only looks right in review is not a guard.
 */
const dirs: string[] = [];

/** A throwaway repo, optionally with an origin and one commit (so branch checks behave like a real clone). */
const tempRepo = (remoteUrl?: string, withCommit = false): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-repo-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, stdio: 'ignore' });
  if (remoteUrl) execFileSync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: dir, stdio: 'ignore' });
  if (withCommit) {
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');
    execFileSync('git', ['add', 'a.ts'], { cwd: dir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 2;\n');
  }
  return dir;
};

afterEach(() => {
  releaseGitLock();
  while (dirs.length) {
    try { fs.rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* already gone */ }
  }
});

describe('remote inspection', () => {
  it('reads the remote git itself would use, and says nothing when there is none', () => {
    const withRemote = tempRepo('git@github.com:acme/app.git');
    expect(getRemoteUrl(withRemote, 'origin')).toBe('git@github.com:acme/app.git');
    expect(getRemoteUrl(withRemote, 'upstream')).toBe(''); // an absent remote is not an error
    expect(getRemoteUrl(tempRepo(), 'origin')).toBe('');

    // Never hand the raw value to a human or the relay: it can hold a token.
    const secret = tempRepo('https://user:ghp_SECRET@github.com/acme/app.git');
    expect(getRemoteUrl(secret, 'origin')).toContain('ghp_SECRET');
    expect(pointsAtRepo(secret, 'acme/app')).toBe(true);
  });

  it('says two spellings are the same repository', () => {
    const dir = tempRepo('https://github.com/acme/app.git');
    expect(pointsAtRepo(dir, 'git@github.com:acme/app')).toBe(true);
    expect(pointsAtRepo(dir, 'acme/other')).toBe(false);
    expect(pointsAtRepo(dir, 'https://gitlab.com/acme/app')).toBe(false);
  });
});

describe('cloneRepo', () => {
  it('refuses anything that is not a remote, and any directory that is not empty', async () => {
    expect((await cloneRepo('/home/dev/checkout', tempRepo())).output).toMatch(/not a repository remote/);

    const populated = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-dirty-'));
    dirs.push(populated);
    fs.writeFileSync(path.join(populated, 'notes.md'), 'mine');
    const outcome = await cloneRepo('acme/app', populated);
    expect(outcome.success).toBe(false);
    expect(outcome.output).toMatch(/already has 1 entry/);
    expect(outcome.output).toMatch(/git remote set-url origin https:\/\/github.com\/acme\/app/);
    expect(fs.readFileSync(path.join(populated, 'notes.md'), 'utf8')).toBe('mine'); // untouched
  });

  it('does not leave a half-made clone lock behind', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-empty-'));
    dirs.push(empty);
    fs.rmdirSync(empty); // a missing directory is also "nothing to lose"
    // Unreachable host: the clone fails on the network, and the internal lock must be released.
    const outcome = await cloneRepo('https://127.0.0.1:1/acme/app', empty);
    expect(outcome.success).toBe(false);
    expect(outcome.output).toMatch(/Clone failed/);
    expect(() => execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: empty, stdio: 'ignore' })).toThrow();
    releaseGitLock();
    expect(getRemoteUrl(empty, 'origin')).toBe(''); // nothing recorded
  });
});

describe('safeCommitAndPush against the room repository', () => {
  it('refuses before committing when the checkout points elsewhere, and leaves no commit behind', async () => {
    const dir = tempRepo('https://github.com/acme/fork.git');
    fs.writeFileSync(path.join(dir, 'a.ts'), 'export const a = 1;\n');

    const outcome = await safeCommitAndPush(dir, 'feat: work', 'main', 'origin', ['a.ts'], 'https://github.com/acme/app');
    expect(outcome.success).toBe(false);
    expect(outcome.output).toMatch(/Refusing to commit/);
    expect(outcome.output).toMatch(/acme\/fork/);
    expect(outcome.output).toMatch(/git remote set-url origin https:\/\/github.com\/acme\/app/);

    // The refusal happened before `git add`, so there is no commit and nothing staged.
    expect(() => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, stdio: 'ignore' })).toThrow();
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' })).toContain('a.ts');
  });

  // The "same repository" cases get a remote that exists as far as git is concerned but refuses
  // instantly (127.0.0.1:1), so the test proves the guard let the work through without reaching github.com.
  it('carries on when the room repository is the one this checkout pushes to', async () => {
    const dir = tempRepo('https://127.0.0.1:1/acme/app.git', true);
    const outcome = await safeCommitAndPush(dir, 'feat: work', 'main', 'origin', ['a.ts'], 'https://127.0.0.1:1/acme/other');
    // Same server, different repository: the guard compares repositories, not hosts.
    expect(outcome.output).toMatch(/Refusing to commit/);

    const dir2 = tempRepo('https://127.0.0.1:1/acme/app.git', true);
    const ok = await safeCommitAndPush(dir2, 'feat: work', 'main', 'origin', ['a.ts'], 'https://127.0.0.1:1/acme/app');
    expect(ok.output).not.toMatch(/Refusing to commit/);
    expect(ok.output).toMatch(/Commit\/Push error|fetch/i); // it got as far as talking to the remote
  });

  it('does not enforce anything when the room has no repository yet', async () => {
    const dir = tempRepo('https://127.0.0.1:1/anyone/anything.git', true);
    const outcome = await safeCommitAndPush(dir, 'feat: work', 'main', 'origin', ['a.ts'], undefined);
    expect(outcome.output).not.toMatch(/Refusing to commit/);
  });
});
