import { randomBytes } from 'node:crypto';
import type { CoWorkMessage, FileLockInfo, ParticipantInfo, CommitInfo, PresenceResponse } from './types.js';
import { safePullRebase } from './git.js';

export interface PollerConfig {
  roomCode: string;
  agentId: string;
  repoPath: string;
  relayUrl: string;
  harness?: string;
  model?: string;
  participantToken?: string;
  autoPull?: boolean;
  branch?: string;
  remote?: string;
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

  private pendingInbox: CoWorkMessage[] = [];
  private fileLocks: Record<string, FileLockInfo> = {};
  private participants: Record<string, ParticipantInfo> = {};
  private latestCommit: CommitInfo | null = null;
  private recentHistory: CoWorkMessage[] = [];

  private messageListeners: Array<(msg: CoWorkMessage) => void> = [];

  constructor(config: PollerConfig) {
    this.config = {
      ...config,
      relayUrl: config.relayUrl.replace(/\/+$/, ''),
      roomCode: config.roomCode.toUpperCase(),
      harness: config.harness || 'AI Agent',
      model: config.model,
      participantToken: config.participantToken || randomBytes(32).toString('hex'),
      branch: config.branch || 'main', remote: config.remote || 'origin',
    };
  }

  public getHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': this.config.participantToken! };
  }
  public getBranch(): string { return this.config.branch!; }
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

  public getModel(): string | undefined {
    return this.config.model;
  }

  public getRepoPath(): string {
    return this.config.repoPath;
  }

  public getRelayUrl(): string {
    return this.config.relayUrl;
  }

  public setStatus(status: string): void {
    this.currentStatus = status.slice(0, 2048);
  }

  public start(): void {
    if (this.timer) return;
    this.stopped = false;
    void this.poll(); // Initial poll immediately
    this.timer = setInterval(() => this.poll(), 2000);
  }

  public stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async poll(): Promise<boolean> {
    if (this.isPolling || this.stopped) return false; // Prevent overlapping polls
    this.isPolling = true;

    try {
      const res = await fetch(`${this.config.relayUrl}/api/presence`, {
        method: 'POST', headers: this.getHeaders(), signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({ action: 'inbox', roomCode: this.config.roomCode,
          clientId: this.config.agentId, role: 'agent', status: this.currentStatus,
          harness: this.config.harness, model: this.config.model, ack: this.acknowledgements }),
      });
      if (!res.ok) throw new Error(`Presence failed (${res.status})`);
      const data = (await res.json()) as PresenceResponse;
      if (!data.ok) throw new Error('Presence rejected');
      if (this.stopped) return false;
      this.acknowledgements = (data.messages || []).map(m => m.messageId);
      this.fileLocks = data.fileLocks || {};
      this.participants = data.participants || {};
      this.latestCommit = data.latestCommit || null;
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
        void safePullRebase(this.config.repoPath, this.config.branch, this.config.remote)
          .then(result => {
            if (result.skipped) this.needsPull = true;
            if (!result.success) console.error(`[CoWork MCP] ${result.output}`);
          }).finally(() => { this.pulling = false; });
      }
      return true;
    } catch (err: any) {
      // Background poll failure is logged to stderr so MCP JSON-RPC on stdout is not corrupted
      console.error(`[CoWork MCP Poller] Error: ${err.message || String(err)}`);
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
