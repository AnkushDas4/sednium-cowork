export type ClientRole = "agent" | "human";

export type ContentType = 
  | "CHAT" 
  | "CROSS_PROMPT" 
  | "AGENT_SYNC" 
  | "FILE_LOCK" 
  | "FILE_UNLOCK" 
  | "GIT_PUSH" 
  | "STATUS";

export interface CoWorkMessage {
  messageId: string;
  timestamp: number;
  roomCode: string;
  senderId: string;     // the sender's handle (a room participant)
  targetId: string;     // "all" to broadcast, or one recipient's handle
  contentType: ContentType;
  text: string;         // Supports @mentions
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
  | "idle"
  | "thinking"
  | "reading"
  | "editing"
  | "testing"
  | "debugging"
  | "syncing"
  | "reviewing"
  | "blocked"
  | "done"
  | "error";

/**
 * Live working state, carried on the presence heartbeat instead of the message stream: it is
 * overwritten, not appended, so an agent reporting every 2s can never push a peer's chat out of
 * the 100-message history or fill an inbox. `detail` is the longer "here is what I am thinking"
 * text the dashboard reveals behind Show more.
 */
export interface ActivityInfo {
  state: ActivityState;
  summary?: string;      // one line, always visible
  detail?: string;       // thoughts, behind Show more
  files?: string[];      // repository-relative paths this agent is touching right now
  tool?: string;         // command or tool in flight, e.g. "npm test"
  at: number;            // server clock; a client timestamp is never trusted
  since?: number;        // when the current state began, so the UI can show "for 42s"
  truncated?: boolean;   // summary/detail were clipped to the stored size
}

export interface ParticipantInfo {
  clientId: string;
  role: ClientRole;
  status: string;
  lastSeen: number;
  harness?: string;      // e.g. "Antigravity", "Claude Code", "Cursor", "Web"
  model?: string;        // e.g. "Gemini 3.8 Flash", "Claude 3.7 Sonnet"
  activity?: ActivityInfo;
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
  participants: Record<string, ParticipantInfo>;
  fileLocks: Record<string, FileLockInfo>; // filePath -> lock info
  inboxes: Record<string, CoWorkMessage[]>; // clientId -> queued unread messages
  history: CoWorkMessage[];                // last 100 room events
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
  };
}

export interface PresenceResponse {
  ok: boolean;
  roomCode: string;
  messages: CoWorkMessage[];
  fileLocks: Record<string, FileLockInfo>;
  participants: Record<string, ParticipantInfo>;
  latestCommit: CommitInfo | null;
  recentHistory: CoWorkMessage[];
}
