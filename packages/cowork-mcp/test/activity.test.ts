import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActivityTracker, DETAIL_MAX, FILES_MAX, SUMMARY_MAX, stateFromStatus } from '../src/activity.js';

const git = (dirty: string[] = ['src/poller.ts'], staged: string[] = []) => async () => ({
  branch: 'main', dirty, staged,
});

// Mirrors the tracker's private REPORT_TTL_MS / GIT_INTERVAL_MS.
const REPORT_TTL_MS = 3 * 60_000;

afterEach(() => vi.useRealTimers());

describe('ActivityTracker', () => {
  it('turns an explicit report into a presence payload', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    const info = tracker.report({ state: 'editing', summary: 'adding retry', detail: 'I will check the timeout path' });
    expect(info.state).toBe('editing');
    expect(info.summary).toBe('adding retry');
    expect(info.detail).toBe('I will check the timeout path');
    expect(info.at).toBeGreaterThan(0);
  });

  it('merges git-status files with the ones the agent listed, without duplicates', async () => {
    const tracker = new ActivityTracker({
      repoPath: '/repo', mode: 'full', collect: git(['src/poller.ts', 'src/git.ts'], ['README.md']),
    });
    tracker.report({ state: 'editing', summary: 'wiring the stream', files: ['src/poller.ts', 'src/activity.ts'] });
    await tracker.maybeRefresh();
    const info = tracker.snapshot();
    expect(info?.files).toEqual(['src/poller.ts', 'src/activity.ts', 'README.md', 'src/git.ts']);
  });

  it('caps the file list and clips long prose instead of refusing the report', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git(Array.from({ length: 80 }, (_, n) => `f${n}.ts`)) });
    const info = tracker.report({ state: 'editing', summary: 'x'.repeat(4000), files: Array.from({ length: 80 }, (_, n) => `g${n}.ts`) });
    expect(info.summary).toHaveLength(SUMMARY_MAX);
    expect(info.truncated).toBe(true);
    expect(info.files!.length).toBeLessThanOrEqual(FILES_MAX);
  });

  it('falls back to a usable state when the model invents one', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    expect(tracker.report({ state: 'vibing', summary: 'still working' }).state).toBe('thinking');
    expect(tracker.report({ state: 'EDITING' }).state).toBe('editing');
  });

  it('flattens newlines so one report cannot forge a second line in the rail', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    const info = tracker.report({ state: 'editing', summary: 'line one\nline two\r\nline three\u0007' });
    expect(info.summary).toBe('line one line two line three');
  });

  it('expires narration but keeps the derived state honest', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const collect = git();
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect });
    tracker.report({ state: 'editing', summary: 'mid-edit' });
    await tracker.maybeRefresh();
    expect(tracker.snapshot()?.summary).toBe('mid-edit');

    vi.advanceTimersByTime(REPORT_TTL_MS + 1000);
    // The report is stale, but git still shows work: the row must not vanish, and must not lie.
    const later = tracker.snapshot();
    expect(later?.summary).toBeUndefined();
    expect(later?.state).toBe('idle');
    expect(later?.files).toEqual(['src/poller.ts']);
  });

  it('honours COWORK_ACTIVITY=state and =off', async () => {
    const collect = vi.fn(git());
    const quiet = new ActivityTracker({ repoPath: '/repo', mode: 'state', collect });
    quiet.report({ state: 'editing', summary: 'no thoughts here', detail: 'private reasoning' });
    await quiet.maybeRefresh();
    const snapshot = quiet.snapshot();
    expect(snapshot?.summary).toBe('no thoughts here');
    expect(snapshot?.detail).toBeUndefined();
    expect(snapshot?.files).toBeUndefined();
    expect(collect).not.toHaveBeenCalled(); // state-only mode never touches git

    const hidden = new ActivityTracker({ repoPath: '/repo', mode: 'off', collect: git() });
    hidden.report({ state: 'editing', summary: 'invisible' });
    expect(hidden.snapshot()).toBeUndefined();
    expect(hidden.statusLine()).toBe('Idle / Connected');
    expect(hidden.enabled()).toBe(false);
  });

  it('treats a bare status line as telemetry, then lets a real report override it', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    tracker.noteStatus('Locked files: src/a.ts');
    expect(tracker.snapshot()?.state).toBe('editing');

    tracker.noteStatus('Idle / Connected');
    const after = tracker.snapshot();
    expect(after?.state).toBe('idle');
    expect(after?.summary).toBeUndefined(); // generic filler is not worth a row of its own

    tracker.report({ state: 'reviewing', summary: 'reading the diff', detail: 'because the test failed' });
    tracker.noteStatus('Locked files: src/b.ts');
    // An explicit report wins for as long as it stays fresh, even against a louder status line.
    expect(tracker.snapshot()?.state).toBe('reviewing');
  });

  it('keeps the published reasoning across tool boundaries, and drops it on a reconnect', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    tracker.report({ state: 'editing', summary: 'wiring the stream', detail: 'because history eviction' });
    tracker.noteTool('cowork_check_inbox'); // state moves, thoughts stay
    const after = tracker.snapshot();
    expect(after?.state).toBe('reading');
    expect(after?.detail).toBe('because history eviction');
    expect(after?.summary).toBe('wiring the stream');
    tracker.clear();
    expect(tracker.snapshot()?.summary).toBeUndefined();
  });

  it('knows which state each tool implies', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    tracker.noteTool('cowork_claim_files');
    expect(tracker.snapshot()?.state).toBe('editing');
    tracker.noteTool('cowork_sync_main');
    expect(tracker.snapshot()?.state).toBe('syncing');
    tracker.noteTool('something_unknown');
    expect(tracker.snapshot()?.state).toBe('thinking');
  });

  it('collects git state at most once per interval and never while git is busy', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const collect = vi.fn(git());
    let busy = false;
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect }, () => busy);

    await tracker.maybeRefresh();
    await tracker.maybeRefresh();
    expect(collect).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    busy = true;
    await tracker.maybeRefresh();
    expect(collect).toHaveBeenCalledTimes(1);

    busy = false;
    await tracker.maybeRefresh();
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it('stays quiet forever if the working tree cannot be read', async () => {
    const failing = new ActivityTracker({ repoPath: '/not-a-repo', mode: 'full' });
    await failing.maybeRefresh();
    await failing.maybeRefresh();
    expect(failing.snapshot()).toBeUndefined(); // no report yet, no files, nothing to publish

    failing.report({ state: 'thinking', summary: 'still useful without git' });
    expect(failing.snapshot()?.summary).toBe('still useful without git');
  });

  it('renders a status line the relay can show to humans', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    tracker.report({ state: 'testing', summary: 'running vitest' });
    expect(tracker.statusLine()).toBe('testing: running vitest');
    expect(stateFromStatus('pushed 3 commits')).toBe('syncing');
    expect(stateFromStatus('failed to rebase')).toBe('error');
    expect(stateFromStatus('')).toBe('thinking');
  });

  it('DETAIL_MAX leaves room for real prose', () => {
    const tracker = new ActivityTracker({ repoPath: '/repo', mode: 'full', collect: git() });
    const info = tracker.report({ state: 'thinking', detail: 'a'.repeat(DETAIL_MAX) });
    expect(info.detail).toHaveLength(DETAIL_MAX);
    expect(info.truncated).toBeUndefined();
  });
});
