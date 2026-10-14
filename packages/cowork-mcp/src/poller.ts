import type { CoWorkMessage, FileLockInfo, ParticipantInfo, CommitInfo, PresenceResponse } from './types.js';
import { safePullRebase } from './git.js';

export interface PollerConfig {
  roomCode: string;
  agentId: string;
  repoPath: string;
  relayUrl: string;
  harness?: string;
  model?: string;
}

export class CoWorkPoller {
  private config: PollerConfig;
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;
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
    };
  }

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
    this.currentStatus = status;
  }

  public start(): void {
    if (this.timer) return;
    this.poll(); // Initial poll immediately
    this.timer = setInterval(() => this.poll(), 2000);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async poll(): Promise<void> {
    if (this.isPolling) return; // Prevent overlapping polls
    this.isPolling = true;

    try {
      const url = new URL(`${this.config.relayUrl}/api/presence`);
      url.searchParams.set('action', 'inbox');
      url.searchParams.set('roomCode', this.config.roomCode);
      url.searchParams.set('clientId', this.config.agentId);
      url.searchParams.set('role', 'agent');
      url.searchParams.set('status', this.currentStatus);
      if (this.config.harness) url.searchParams.set('harness', this.config.harness);
      if (this.config.model) url.searchParams.set('model', this.config.model);

      const res = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });

      if (!res.ok) {
        return;
      }

      const data = (await res.json()) as PresenceResponse;
      this.fileLocks = data.fileLocks || {};
      this.participants = data.participants || {};
      this.latestCommit = data.latestCommit || null;
      this.recentHistory = data.recentHistory || [];

      if (data.messages && data.messages.length > 0) {
        for (const msg of data.messages) {
          this.pendingInbox.push(msg);

          // Notify any waiting listeners
          for (const listener of this.messageListeners) {
            listener(msg);
          }

          // AUTOMATIC GIT PULL ON PEER PUSH
          if (msg.contentType === 'GIT_PUSH' && msg.senderId !== this.config.agentId) {
            console.error(`[CoWork MCP] Peer @${msg.senderId} pushed commit (${msg.commitHash || 'latest'}). Auto-pulling...`);
            const pullRes = await safePullRebase(this.config.repoPath);
            if (pullRes.success) {
              console.error(`[CoWork MCP] Auto-pull succeeded: ${pullRes.output}`);
            } else if (pullRes.skipped) {
              console.error(`[CoWork MCP] Auto-pull deferred: ${pullRes.output}`);
            } else {
              console.error(`[CoWork MCP] Auto-pull failed: ${pullRes.output}`);
            }
          }
        }
      }
    } catch (err: any) {
      // Background poll failure is logged to stderr so MCP JSON-RPC on stdout is not corrupted
      console.error(`[CoWork MCP Poller] Error: ${err.message || String(err)}`);
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
