import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simpleGit, SimpleGit } from 'simple-git';
import { parseRepoUrl, sameRepo } from './repo.js';
import type { CommitInfo } from './types.js';

let isInternalGitLocked = false;

/**
 * Checks if git is currently busy (internal lock or repo lockfile exists).
 */
export function isGitBusy(repoPath?: string): boolean {
  if (isInternalGitLocked) {
    return true;
  }

  if (repoPath) {
    let gitDir: string;
    try { gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: repoPath, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return false; }
    if (fs.existsSync(gitDir)) {
      const lockFiles = [
        path.join(gitDir, 'index.lock'),
        path.join(gitDir, 'rebase-merge'),
        path.join(gitDir, 'rebase-apply'),
        path.join(gitDir, 'MERGE_HEAD'),
      ];

      for (const file of lockFiles) {
        if (fs.existsSync(file)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Manually acquire the mutex lock
 */
export function acquireGitLock(): boolean {
  if (isInternalGitLocked) {
    return false;
  }
  isInternalGitLocked = true;
  return true;
}

/**
 * Manually release the mutex lock
 */
export function releaseGitLock(): void {
  isInternalGitLocked = false;
}

/**
 * Gets simpleGit instance for a given path
 */
export function getGit(repoPath: string): SimpleGit {
  return simpleGit(repoPath);
}

/**
 * The remote a working copy points at, exactly as git sees it. Empty string when there is no such
 * remote or no repository. Callers must pass this through `parseRepoUrl` before printing it: a remote
 * can carry a credential, and this value is read straight out of `.git/config`.
 */
export function getRemoteUrl(repoPath: string, remote = 'origin'): string {
  try {
    return execFileSync('git', ['remote', 'get-url', remote], {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/** Does this checkout point at the repository the room agreed to work in? */
export function pointsAtRepo(repoPath: string, expectedUrl: string, remote = 'origin'): boolean {
  return sameRepo(getRemoteUrl(repoPath, remote), expectedUrl);
}

/**
 * Clone the room's repository into an empty directory. Deliberately narrow: it only ever runs against
 * a directory with nothing in it, so no working tree, stash or history can be overwritten by a peer's
 * idea of where the code lives.
 */
export async function cloneRepo(
  repoUrl: string,
  repoPath: string,
  options: { branch?: string } = {},
): Promise<{ success: boolean; output: string }> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) return { success: false, output: 'Refused clone: not a repository remote.' };
  if (isGitBusy(repoPath)) return { success: false, output: 'Skipped clone: another git operation is in flight.' };

  const existing = fs.existsSync(repoPath)
    ? fs.readdirSync(repoPath).filter((name) => name !== '.DS_Store' && name !== 'Thumbs.db')
    : [];
  if (existing.length) {
    return {
      success: false,
      output:
        `Refused clone into ${repoPath}: the directory already has ${existing.length} entr` +
        `${existing.length === 1 ? 'y' : 'ies'}. Clone by hand, or point the existing checkout at ` +
        `the room repo with: git remote set-url origin ${parsed.url}`,
    };
  }

  isInternalGitLocked = true;
  try {
    fs.mkdirSync(repoPath, { recursive: true });
    const args = ['clone', parsed.url, '.'];
    if (options.branch) args.push('--branch', options.branch);
    execFileSync('git', args, { cwd: repoPath, timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { success: true, output: `Cloned ${parsed.host}/${parsed.slug} into ${repoPath}` };
  } catch (err: any) {
    return { success: false, output: `Clone failed: ${err?.message ? String(err.message).split('\n')[0] : String(err)}` };
  } finally {
    isInternalGitLocked = false;
  }
}

/**
 * Pulls only on the configured branch and a clean working tree
 */
export async function safePullRebase(
  repoPath: string,
  branch = 'main',
  remote = 'origin',
  expectedRepoUrl?: string
): Promise<{ success: boolean; skipped?: boolean; output: string }> {
  if (isGitBusy(repoPath)) {
    return {
      success: false,
      skipped: true,
      output: 'Skipped: Git operation or lock already active in working tree',
    };
  }

  isInternalGitLocked = true;
  try {
    const git = getGit(repoPath);
    // Verify it is a valid git repository
    const isRepo = await git.checkIsRepo();
    if (!isRepo) {
      return { success: false, output: `Not a git repository: ${repoPath}` };
    }
    if (expectedRepoUrl && !pointsAtRepo(repoPath, expectedRepoUrl, remote)) {
      return {
        success: false,
        skipped: true,
        output: `Pull refused: this checkout does not point at this room's repository (${parseRepoUrl(expectedRepoUrl)?.slug ?? 'unknown'}). Repoint it with: git remote set-url ${remote} ${expectedRepoUrl}`,
      };
    }

    if ((await git.branchLocal()).current !== branch) return { success: false, output: `Refusing pull: checkout must be ${branch}` };
    if (!(await git.status()).isClean()) return { success: false, skipped: true, output: 'Pull deferred: working tree is dirty' };
    // Never autostash a peer's in-progress work.
    const res = await git.pull(remote, branch, ['--rebase']);
    return {
      success: true,
      output: `Pulled from ${remote}/${branch} successfully (files changed: ${res.files.length})`,
    };
  } catch (err: any) {
    return {
      success: false,
      output: `Git pull failed: ${err.message || String(err)}`,
    };
  } finally {
    isInternalGitLocked = false;
  }
}

/**
 * Commits explicit files only, refusing remote divergence or unrelated staged changes
 */
export async function safeCommitAndPush(
  repoPath: string,
  commitMessage: string,
  branch = 'main',
  remote = 'origin',
  files?: string[],
  expectedRepoUrl?: string
): Promise<{ success: boolean; hash?: string; output: string }> {
  if (isGitBusy(repoPath)) {
    return {
      success: false,
      output: 'Git is currently busy with another operation.',
    };
  }

  isInternalGitLocked = true;
  try {
    const git = getGit(repoPath);

    // The room's repository, if it has one, is the only place a member may push. Checked before the
    // commit, because a commit in the wrong repository is work the room will never see.
    if (expectedRepoUrl) {
      const target = parseRepoUrl(expectedRepoUrl);
      if (!pointsAtRepo(repoPath, expectedRepoUrl, remote)) {
        const where = parseRepoUrl(getRemoteUrl(repoPath, remote))?.slug ?? 'no such remote';
        return {
          success: false,
          output:
            `Refusing to commit: this checkout pushes to ${where}, but this room works in ` +
            `${target?.slug ?? 'another repository'}. Point it there first: ` +
            `git remote set-url ${remote} ${expectedRepoUrl} (then git pull --rebase). ` +
            'To work in a different repository, ask a human to open a new room.',
        };
      }
    }

    if ((await git.branchLocal()).current !== branch) {
      throw new Error(`Refusing sync: checked-out branch must be ${branch}`);
    }
    if (!Array.isArray(files) || !files.length || files.length > 100) throw new Error('Explicit files are required');
    const selected = [...new Set(files.map(file => {
      if (typeof file !== 'string' || !file.trim()) throw new Error('Invalid file');
      const f = path.posix.normalize(file.replace(/\\/g, '/'));
      if (f === '.' || f.startsWith('/') || f.startsWith('../') || f === '..' || /^[A-Za-z]:/.test(f) || f.includes('\0')) throw new Error('Files must be repository-relative');
      return f;
    }))];
    const status = await git.status();
    if (status.conflicted.length) throw new Error('Resolve existing conflicts first');
    const staged = (await git.diff(['--cached', '--name-only', '-z'])).split('\0').filter(Boolean);
    if (staged.some(file => !selected.includes(file))) throw new Error('Unrelated staged files exist; unstage them before syncing');

    // Fetch first and refuse divergence BEFORE touching the index or worktree.
    // Rebase/autostash on dirty work is intentionally not automated.
    await git.fetch(remote, branch);
    const head = (await git.revparse(['HEAD'])).trim();
    const remoteHead = (await git.revparse(['FETCH_HEAD'])).trim();
    const base = (await git.raw(['merge-base', 'HEAD', 'FETCH_HEAD'])).trim();
    if (base !== remoteHead) {
      if (!status.isClean() || base !== head) throw new Error('Remote changed; resolve/sync manually before committing');
      await git.merge(['--ff-only', 'FETCH_HEAD']);
    }
    await git.raw(['--literal-pathspecs', 'add', '--', ...selected]);
    const stagedAfter = await git.diff(['--cached', '--name-only']);
    if (!stagedAfter.trim()) throw new Error('No selected changes to commit');
    const actualStaged = (await git.diff(['--cached', '--name-only', '-z'])).split('\0').filter(Boolean);
    if (actualStaged.some(file => !selected.includes(file))) throw new Error('Selection must list individual files, not directories. Review staged changes before retrying.');
    await git.commit(commitMessage);
    const hash = (await git.revparse(['HEAD'])).trim();
    await git.push(remote, `HEAD:refs/heads/${branch}`);

    return {
      success: true,
      hash,
      output: `Committed ${hash.slice(0, 7)} and pushed to ${remote}/${branch}`,
    };
  } catch (err: any) {
    return {
      success: false,
      output: `Commit/Push error: ${err.message || String(err)}`,
    };
  } finally {
    isInternalGitLocked = false;
  }
}

/**
 * Reads the latest commit info from the local git HEAD
 */
export async function getLatestCommit(repoPath: string): Promise<CommitInfo | null> {
  try {
    const git = getGit(repoPath);
    const log = await git.log({ maxCount: 1 });
    if (!log.latest) return null;

    return {
      hash: log.latest.hash,
      message: log.latest.message,
      author: log.latest.author_name,
      timestamp: new Date(log.latest.date).getTime(),
    };
  } catch (err) {
    return null;
  }
}
