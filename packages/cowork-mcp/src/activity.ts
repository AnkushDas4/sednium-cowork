import type { ActivityInfo, ActivityState } from './types.js';

export type ActivityMode = 'full' | 'state' | 'off';

/**
 * Live working state for one agent, piggybacked on the presence heartbeat.
 *
 * Design constraints that shaped this file:
 * - It is *state*, not a message: presence overwrites it, so a chatty agent can never push a peer's
 *   chat out of the room's 100-message history or fill an inbox.
 * - Reading `git status` costs a subprocess, so it is debounced and skipped while git is busy.
 * - Everything here is best-effort telemetry: if collection fails, the beat continues without it.
 *   A broken status line must never take down an agent's presence.
 */

export const ACTIVITY_STATES: ActivityState[] = [
  'idle', 'thinking', 'reading', 'editing', 'testing', 'debugging', 'syncing', 'reviewing', 'blocked', 'done', 'error',
];

/** Same caps the relay enforces, applied locally so a long thought is not round-tripped and refused. */
export const SUMMARY_MAX = 240;
export const DETAIL_MAX = 1600;
export const FILES_MAX = 24;

/** An explicit report that goes stale would be worse than no report: decay it to idle. */
const REPORT_TTL_MS = 3 * 60_000;
const GIT_INTERVAL_MS = 5_000;

const TOOL_STATE: Record<string, ActivityState> = {
  cowork_connect: 'idle',
  cowork_report: 'thinking',
  cowork_claim_files: 'editing',
  cowork_message_peer: 'reviewing',
  cowork_sync_main: 'syncing',
  cowork_check_inbox: 'reading',
  cowork_watch_loop: 'idle',
};

export interface GitSnapshot {
  branch: string;
  dirty: string[];
  staged: string[];
}

export type GitCollector = (repoPath: string) => Promise<GitSnapshot | null>;

const clip = (value: string, max: number): [string, boolean] =>
  value.length > max ? [value.slice(0, max - 1).trimEnd() + '…', true] : [value, false];

const oneLine = (value: unknown): string =>
  String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

/** Heuristic for harnesses that set a status string but never call cowork_report. */
export function stateFromStatus(status: string): ActivityState {
  const s = status.toLowerCase();
  if (/fail|error|conflict|refus/.test(s)) return 'error';
  if (/sync|push|commit/.test(s)) return 'syncing';
  if (/lock|edit|writ|patch|claim/.test(s)) return 'editing';
  if (/test|lint|build|check/.test(s)) return 'testing';
  if (/review|check inbox|read/.test(s)) return 'reading';
  if (/block|wait|stuck|blocked/.test(s)) return 'blocked';
  if (/done|complete|finish/.test(s)) return 'done';
  if (/idle|listen|connected/.test(s)) return 'idle';
  return 'thinking';
}

/** Status strings that say nothing worth showing as a summary. */
const GENERIC_STATUS = /^(idle\s*\/\s*(connected|synced)|listening for instructions.*|waiting for input.*)$/i;

export class ActivityTracker {
  private manual?: {
    state: ActivityState;
    summary?: string;
    detail?: string;
    tool?: string;
    files?: string[];
    at: number;
    truncatedFlag?: boolean;
  };
  private git: GitSnapshot | null = null;
  private lastGitAt = 0;
  private gitRunning = false;
  private gitDisabled = false;
  /**
   * @param collect injected for tests; defaults to a simple-git reader supplied by the poller
   */
  constructor(
    private opts: { repoPath: string; mode?: ActivityMode; collect?: GitCollector },
    private busy?: () => boolean,
  ) {}

  private get mode(): ActivityMode {
    return this.opts.mode ?? 'full';
  }

  public enabled(): boolean {
    return this.mode !== 'off';
  }

  /** Called by cowork_report. Long text is clipped, never rejected. */
  public report(patch: { state?: unknown; summary?: unknown; detail?: unknown; tool?: unknown; files?: unknown }): ActivityInfo {
    const rawState = oneLine(patch.state).toLowerCase();
    const state: ActivityState = (ACTIVITY_STATES as string[]).includes(rawState)
      ? (rawState as ActivityState)
      : this.manual?.state ?? 'thinking';

    const [summary, clippedSummary] = clip(oneLine(patch.summary), SUMMARY_MAX);
    const detailIn = typeof patch.detail === 'string' ? patch.detail.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim() : '';
    const [detail, clippedDetail] = detailIn ? clip(detailIn, DETAIL_MAX) : ['', false];
    const [tool, clippedTool] = clip(oneLine(patch.tool), 64);

    const files = Array.isArray(patch.files)
      ? [...new Set(patch.files.map((f) => oneLine(f)).filter(Boolean))].slice(0, FILES_MAX)
      : undefined;

    this.manual = {
      state,
      summary: summary || undefined,
      detail: detail || undefined,
      tool: tool || undefined,
      files,
      at: Date.now(),
    };
    this.manual.truncatedFlag = Boolean(clippedSummary || clippedDetail || clippedTool);
    return this.snapshot() ?? { state: this.manual.state, at: this.manual.at };
  }

  /**
   * Derive a state from a raw status line, for harnesses that only ever call setStatus().
   * Words from cowork_report win: an explicit report is left alone until it expires.
   */
  public noteStatus(status: string): void {
    const now = Date.now();
    const fresh = this.manual && now - this.manual.at <= REPORT_TTL_MS;
    if (fresh && this.manual!.detail) return;
    const clean = oneLine(status);
    const generic = GENERIC_STATUS.test(clean);
    this.manual = {
      state: stateFromStatus(clean),
      // A filler line ("Idle / Connected") says nothing, so it must not be shown - and it must not
      // keep last task's summary attached to a row that now reads "idle".
      summary: generic ? undefined : clean.slice(0, SUMMARY_MAX),
      at: now,
    };
  }

  /** Which tool is running right now - visible without the model having to narrate. */
  public noteTool(name: string): void {
    const state = TOOL_STATE[name] ?? 'thinking';
    const now = Date.now();
    if (!this.manual || this.manual.state !== state || now - this.manual.at > 30_000) {
      this.manual = {
        state,
        summary: this.manual?.summary,
        // A tool boundary moves the chip; it does not erase what the agent chose to explain.
        detail: this.manual?.detail,
        truncatedFlag: this.manual?.truncatedFlag,
        tool: name,
        at: now,
      };
    } else {
      this.manual.tool = name;
      this.manual.at = now;
    }
  }

  public clear(): void {
    this.manual = undefined;
  }

  /** Debounced git read. Never throws, never blocks the beat that calls it. */
  public async maybeRefresh(): Promise<void> {
    if (this.mode !== 'full' || this.gitDisabled || this.gitRunning) return;
    const now = Date.now();
    if (now - this.lastGitAt < GIT_INTERVAL_MS) return;
    if (this.busy?.()) return; // do not spawn git while a pull/commit holds the index
    this.gitRunning = true;
    this.lastGitAt = now;
    try {
      const collect = this.opts.collect ?? defaultCollect;
      this.git = await collect(this.opts.repoPath);
    } catch {
      // Not a repo, git missing, or a transient failure: stay quiet rather than noisy.
      this.git = null;
      if (!this.opts.collect) this.gitDisabled = true;
    } finally {
      this.gitRunning = false;
    }
  }

  /**
   * The presence payload, or undefined to leave whatever the relay already holds untouched.
   * `COWORK_ACTIVITY=state` keeps the coloured chip and the one-liner but ships neither the free-text
   * reasoning nor the file paths; `=off` sends nothing at all.
   */
  public snapshot(): ActivityInfo | undefined {
    if (this.mode === 'off') return undefined;
    const now = Date.now();
    const manual = this.manual && now - this.manual.at <= REPORT_TTL_MS ? this.manual : undefined;
    const files = this.mode === 'full' ? mergeFiles(manual?.files, this.git) : [];
    if (!manual && !files.length) return undefined;

    const sharing = this.mode === 'full';
    const info: ActivityInfo = {
      state: manual?.state ?? 'idle',
      at: now,
      ...(manual?.summary ? { summary: manual.summary } : {}),
      ...(sharing && manual?.detail ? { detail: manual.detail } : {}),
      ...(manual?.tool ? { tool: manual.tool } : {}),
      ...(files.length ? { files } : {}),
      ...(sharing && manual?.truncatedFlag ? { truncated: true } : {}),
    };
    return info;
  }

  public statusLine(): string {
    const info = this.snapshot();
    if (!info) return 'Idle / Connected';
    return info.summary ? `${info.state}: ${info.summary}` : info.state;
  }
}

function mergeFiles(manual: string[] | undefined, git: GitSnapshot | null): string[] {
  const out = [...(manual ?? [])];
  if (git) {
    for (const f of [...git.staged, ...git.dirty]) {
      if (!out.includes(f)) out.push(f);
      if (out.length >= FILES_MAX) break;
    }
  }
  return out;
}

/** Default reader: simple-git is already a dependency of the MCP server. */
async function defaultCollect(repoPath: string): Promise<GitSnapshot | null> {
  const { getGit } = await import('./git.js');
  const git = getGit(repoPath);
  const [status, current] = await Promise.all([git.status(), git.revparse(['--abbrev-ref', 'HEAD']).catch(() => '')]);
  const dirty: string[] = [];
  const staged: string[] = [];
  for (const file of status.files) {
    if (!file.path) continue;
    if (file.index !== ' ' && file.index !== '?') staged.push(file.path);
    if (file.working_dir !== ' ' && file.working_dir !== '?') dirty.push(file.path);
    if (file.index === '?' && file.working_dir === '?') dirty.push(file.path);
  }
  return { branch: current.trim() || '', dirty: [...new Set(dirty)], staged: [...new Set(staged)] };
}
