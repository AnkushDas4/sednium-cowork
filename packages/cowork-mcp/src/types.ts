export type ClientRole = "agent" | "human";

export type ContentType = 
  | "CHAT" 
  | "CROSS_PROMPT" 
  | "AGENT_SYNC" 
  | "FILE_LOCK" 
  | "FILE_UNLOCK" 
  | "GIT_PUSH" 
  | "GIT_REPO" 
  | "STATUS";

export interface CoWorkMessage {
  messageId: string;
  timestamp: number;
  roomCode: string;
  senderId: string;
  targetId: string;
  contentType: ContentType;
  text: string;
  files?: string[];
  commitHash?: string;
  senderModel?: string;   // e.g. "Gemini 3.8 Flash", "Claude 3.7 Sonnet"
  senderHarness?: string; // e.g. "Antigravity", "Claude Code", "Cursor"
  mentions?: string[];    // All tagged entities (e.g. ["antigravity-ai", "peer-ai"])
  priority?: 'HIGH' | 'NORMAL';
}

export interface FileLockInfo {
  lockedBy: string;
  task: string;
  timestamp: number;
}

export type ActivityState =
  | "idle" | "thinking" | "reading" | "editing" | "testing" | "debugging"
  | "syncing" | "reviewing" | "blocked" | "done" | "error";

/** Presence-carried working state, mirrored from the relay's type. Overwritten every beat. */
export interface ActivityInfo {
  state: ActivityState;
  summary?: string;
  detail?: string;
  files?: string[];
  tool?: string;
  at: number;
  since?: number;
  truncated?: boolean;
}

export interface ParticipantInfo {
  clientId: string;
  role: ClientRole;
  status: string;
  lastSeen: number;
  harness?: string;
  model?: string;
  activity?: ActivityInfo;
}

/** Mirrors the relay's binding of one canonical git remote to a room. See `api/_repo.ts`. */
export interface GitRepoBinding {
  url: string;
  host: string;
  slug: string;
  by: string;
  at: number;
  source: 'linked' | 'push';
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface RoomState {
  /** SHA-256 of the room's invite key; the key itself is never stored or returned. */
  inviteHash?: string;
  participantKeys?: Record<string, string>;
  roomCode: string;
  createdAt: number;
  latestCommit: CommitInfo | null;
  gitRepo?: GitRepoBinding | null;
  participants: Record<string, ParticipantInfo>;
  fileLocks: Record<string, FileLockInfo>;
  inboxes: Record<string, CoWorkMessage[]>;
  history: CoWorkMessage[];
}

export interface SendMessageResponse {
  ok: boolean;
  messageId?: string;
  error?: string;
  lockedBy?: string;
  conflictingFiles?: string[];
  roomStateSummary?: {
    roomCode: string;
    activeFileLocks: number;
    participantCount: number;
    latestCommit: CommitInfo | null;
    gitRepo: GitRepoBinding | null;
  };
}

export interface PresenceResponse {
  ok: boolean;
  roomCode: string;
  messages: CoWorkMessage[];
  fileLocks: Record<string, FileLockInfo>;
  participants: Record<string, ParticipantInfo>;
  latestCommit: CommitInfo | null;
  gitRepo: GitRepoBinding | null;
  recentHistory: CoWorkMessage[];
}
