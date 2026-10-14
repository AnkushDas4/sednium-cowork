import fs from 'node:fs';
import path from 'node:path';
import { simpleGit, SimpleGit } from 'simple-git';
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
    const gitDir = path.resolve(repoPath, '.git');
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
 * Safely runs git pull --rebase --autostash origin main with concurrency protection
 */
export async function safePullRebase(
  repoPath: string,
  branch = 'main',
  remote = 'origin'
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

    // Run safe rebase pull
    const res = await git.pull(remote, branch, ['--rebase', '--autostash']);
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
 * Safely commits all changes and pushes to main branch
 */
export async function safeCommitAndPush(
  repoPath: string,
  commitMessage: string,
  branch = 'main',
  remote = 'origin'
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

    // 1. Pull with rebase & autostash first
    try {
      await git.pull(remote, branch, ['--rebase', '--autostash']);
    } catch (pullErr: any) {
      console.warn('[Git Push] Pre-pull warning (remote may be empty or unset):', pullErr.message);
    }

    // 2. Stage all files
    await git.add('-A');

    // 3. Commit
    const commitRes = await git.commit(commitMessage);
    const hash = commitRes.commit || (await git.revparse(['HEAD'])).trim();

    // 4. Push to origin main
    await git.push(remote, branch);

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
