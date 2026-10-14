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
  senderId: string;     // e.g. "loid-ai", "peer-ai", "loid", "peer"
  targetId: string;     // e.g. "all", "peer-ai", "loid-ai", "loid", "peer"
  contentType: ContentType;
  text: string;         // Supports @mentions
  files?: string[];
  commitHash?: string;
  senderModel?: string;   // e.g. "Gemini 3.8 Flash", "Claude 3.7 Sonnet"
  senderHarness?: string; // e.g. "Antigravity", "Claude Code", "Cursor"
}

export interface FileLockInfo {
  lockedBy: string;
  task: string;
  timestamp: number;
}

export interface ParticipantInfo {
  clientId: string;
  role: ClientRole;
  status: string;
  lastSeen: number;
  harness?: string;      // e.g. "Antigravity", "Claude Code", "Cursor", "Web"
  model?: string;        // e.g. "Gemini 3.8 Flash", "Claude 3.7 Sonnet"
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface RoomState {
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
