import { randomBytes } from 'node:crypto';
import type { ActivityInfo, CoWorkMessage, FileLockInfo, GitRepoBinding, ParticipantInfo, CommitInfo, PresenceResponse } from './types.js';
import { safePullRebase, isGitBusy } from './git.js';
import { ActivityTracker } from './activity.js';

export interface PollerConfig {
  roomCode: string;
  agentId: string;
  repoPath: string;
  relayUrl: string;
  harness?: string;
  model?: string;
  participantToken?: string;
  inviteKey?: string;
  autoPull?: boolean;
  branch?: string;
  remote?: string;
  /** 'full' (default) = state + summary + thoughts + file paths, 'state' = no thoughts/paths, 'off' = nothing. */
  activityMode?: 'full' | 'state' | 'off';
}

export class CoWorkPoller {
  private config: PollerConfig;
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private acknowledgements: string[] = [];
  private seen = new Set<string>();
  private needsPull = false;
  private pulling = false;
  private stopped = false;
  private currentStatus = 'Idle / Connected';
  private activity: ActivityTracker;

  private pendingInbox: CoWorkMessage[] = [];
  private fileLocks: Record<string, FileLockInfo> = {};
  private participants: Record<string, ParticipantInfo> = {};
  private latestCommit: CommitInfo | null = null;
  /** The repository this room has agreed to work in, as told to us by the relay. */
  private gitRepo: GitRepoBinding | null = null;
  private recentHistory: CoWorkMessage[] = [];

  private messageListeners: Array<(msg: CoWorkMessage) => void> = [];
  private lastError = '';

  constructor(config: PollerConfig) {
    this.config = {
      ...config,
      relayUrl: config.relayUrl.replace(/\/+$/, ''),
      roomCode: config.roomCode.toUpperCase(),
      harness: config.harness || 'AI Agent',
      model: config.model,
      participantToken: config.participantToken || randomBytes(32).toString('hex'),
      inviteKey: config.inviteKey || undefined,
      branch: config.branch || 'main', remote: config.remote || 'origin',
    };
    this.activity = new ActivityTracker(
      { repoPath: config.repoPath, mode: config.activityMode ?? 'full' },
      () => isGitBusy(config.repoPath),
    );
  }

  /** Explicit narration from the agent (cowork_report). Returns what the next beat will carry. */
  public setActivity(patch: { state?: unknown; summary?: unknown; detail?: unknown; tool?: unknown; files?: unknown }): ActivityInfo | undefined {
    const info = this.activity.report(patch);
    this.currentStatus = this.activity.statusLine().slice(0, 2048);
    return info;
  }

  /** Which tool is running - visible to the room even when the agent says nothing. */
  public noteTool(name: string): void {
    this.activity.noteTool(name);
  }

  public getActivity(): ActivityInfo | undefined {
    return this.activity.snapshot();
  }

  public isSharingActivity(): boolean {
    return this.activity.enabled();
  }

  public getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': this.config.participantToken! };
    if (this.config.inviteKey) headers['X-Cowork-Invite-Key'] = this.config.inviteKey;
    return headers;
  }
  public getInviteKey(): string | undefined { return this.config.inviteKey; }
  public getBranch(): string { return this.config.branch!; }
  public setBranch(branch: string): void { this.config.branch = branch; }
  public getRemote(): string { return this.config.remote!; }
  public getParticipantToken(): string { return this.config.participantToken!; }
  public getRoomCode(): string {
    return this.config.roomCode;
  }

  public getAgentId(): string {
    return this.config.agentId;
  }

  public getHarness(): string | undefined {
    return this.config.harness;
  }

  /** Last failure text, so cowork_connect can report WHY instead of a generic "failed". */
  public getLastError(): string {
    return this.lastError;
  }

  public getModel(): string | undefined {
    return this.config.model;
  }

  public getRepoPath(): string {
    return this.config.repoPath;
  }

  public getRelayUrl(): string {
    return this.config.relayUrl;
  }

  /**
   * The room's canonical repository. `undefined` means "the room has not said yet", which is not the
   * same as `null` ("the room is unbound"): a client that has not spoken to the relay must not
   * enforce anything it invented.
   */
  public getGitRepo(): GitRepoBinding | null {
    return this.gitRepo;
  }

  /** Set straight after a claim succeeds, so the next tool call enforces without waiting a beat. */
  public setGitRepo(binding: GitRepoBinding | null): void {
    this.gitRepo = binding ?? null;
  }

  public setStatus(status: string): void {
    this.currentStatus = status.slice(0, 2048);
    // A status line is also telemetry: derive a state from it so harnesses that only ever call
    // setStatus still stream something meaningful.
    this.activity.noteStatus(status);
  }

  public start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.activity.noteTool('cowork_connect');
    void this.poll(); // Initial poll immediately
    this.timer = setInterval(() => this.poll(), 2000);
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Forget the narration: a reconnect must not republish "editing" for work that finished while
    // the agent was down. The relay ages the row out on its own.
    this.activity.clear();
  }

  public async poll(): Promise<boolean> {
    if (this.isPolling || this.stopped) return false; // Prevent overlapping polls
    this.isPolling = true;

    try {
      // Refresh the file view without delaying this beat; the previous snapshot is used meanwhile.
      void this.activity.maybeRefresh();
      const activity = this.activity.snapshot();
      const res = await fetch(`${this.config.relayUrl}/api/presence`, {
        method: 'POST', headers: this.getHeaders(), signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ action: 'inbox', roomCode: this.config.roomCode,
          clientId: this.config.agentId, role: 'agent', status: this.currentStatus,
          harness: this.config.harness, model: this.config.model, ack: this.acknowledgements,
          ...(activity ? { activity } : {}) }),
      });
      if (!res.ok) {
        let reason = '';
        try { const data = await res.clone().json() as { error?: string }; reason = data?.error ? `: ${data.error}` : ''; } catch { /* non-JSON gateway error */ }
        throw new Error(`Presence failed (${res.status})${reason}`);
      }
      const data = (await res.json()) as PresenceResponse;
      if (!data.ok) throw new Error('Presence rejected');
      if (this.stopped) return false;
      this.lastError = '';
      this.acknowledgements = (data.messages || []).map(m => m.messageId);
      this.fileLocks = data.fileLocks || {};
      this.participants = data.participants || {};
      this.latestCommit = data.latestCommit || null;
      // A relay that predates the feature simply omits the field; treating that as "unbound" would
      // let an old relay look like a room that refused a claim.
      this.gitRepo = data.gitRepo === undefined ? this.gitRepo : data.gitRepo || null;
      this.recentHistory = data.recentHistory || [];

      if (data.messages && data.messages.length > 0) {
        for (const msg of data.messages) {
          if (this.seen.has(msg.messageId)) continue;
          this.seen.add(msg.messageId);
          if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!);
          this.pendingInbox.push(msg);

          // Notify any waiting listeners
          for (const listener of this.messageListeners) {
            listener(msg);
          }

          if (this.config.autoPull && msg.contentType === 'GIT_PUSH' && msg.senderId !== this.config.agentId) {
            this.needsPull = true;
          }
        }
      }
      // Never block heartbeats on a slow Git operation. A busy Git lock is retried.
      if (this.needsPull && !this.pulling && !this.stopped) {
        this.pulling = true;
        this.needsPull = false;
        void safePullRebase(this.config.repoPath, this.config.branch, this.config.remote, this.gitRepo?.url)
          .then(result => {
            if (result.skipped) this.needsPull = true;
            if (!result.success) console.error(`[CoWork MCP] ${result.output}`);
          }).finally(() => { this.pulling = false; });
      }
      return true;
    } catch (err: any) {
      // Background poll failure is logged to stderr so MCP JSON-RPC on stdout is not corrupted
      this.lastError = err?.message ? String(err.message).slice(0, 400) : String(err);
      console.error(`[CoWork MCP Poller] Error: ${this.lastError}`);
      return false;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Drains and returns all unread messages from local inbox
   */
  public drainInbox(): CoWorkMessage[] {
    const messages = [...this.pendingInbox];
    this.pendingInbox = [];
    return messages;
  }

  public getFileLocks(): Record<string, FileLockInfo> {
    return { ...this.fileLocks };
  }

  public getParticipants(): Record<string, ParticipantInfo> {
    return { ...this.participants };
  }

  public getLatestCommit(): CommitInfo | null {
    return this.latestCommit;
  }

  public getRecentHistory(): CoWorkMessage[] {
    return [...this.recentHistory];
  }

  /**
   * Waits for a message to arrive or until timeout expires
   */
  public async waitForMessage(timeoutSeconds = 30): Promise<CoWorkMessage | null> {
    if (this.pendingInbox.length > 0) {
      return this.pendingInbox.shift() || null;
    }

    return new Promise((resolve) => {
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.messageListeners = this.messageListeners.filter((l) => l !== onMsg);
          resolve(null);
        }
      }, timeoutSeconds * 1000);

      const onMsg = (msg: CoWorkMessage) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.messageListeners = this.messageListeners.filter((l) => l !== onMsg);
          // Remove from pendingInbox since we are resolving it directly
          const idx = this.pendingInbox.indexOf(msg);
          if (idx !== -1) this.pendingInbox.splice(idx, 1);
          resolve(msg);
        }
      };

      this.messageListeners.push(onMsg);
    });
  }
}
