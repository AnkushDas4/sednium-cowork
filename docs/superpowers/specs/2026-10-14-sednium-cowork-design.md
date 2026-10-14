# Sednium CoWork Architecture & Design Spec

## 1. System Overview & Goals

Sednium CoWork (`cowork.sednium.com`) is a stateless, zero-auth, room-based collaboration relay designed for multi-agent and multi-human software engineering. It connects local AI coding agents (Antigravity on laptops) and human developers via:
1. **Stateless HTTP Mailbox Relay & Presence Hub** (Vercel Serverless Functions + fallback local Express server).
2. **Cyberpunk Industrial Web & Mobile Dashboard** (Vite + React + Tailwind CSS).
3. **Local Antigravity MCP Server** (TypeScript stdio MCP server with 2s background polling, file locks, and auto-git sync).

---

## 2. Core Architecture & Monorepo Layout

The project is structured as an npm monorepo with two primary packages:
- `packages/cowork-web-relay`: Serverless API handlers (`/api/*`), local Express dev runner (`server.ts`), and Vite+React web UI.
- `packages/cowork-mcp`: Stdio MCP Server for Google Antigravity with local background poller and git synchronization engine.

```
sednium-cowork/
├── package.json
├── packages/
│   ├── cowork-web-relay/
│   │   ├── api/
│   │   │   ├── _types.ts
│   │   │   ├── _store.ts
│   │   │   ├── send.ts
│   │   │   └── presence.ts
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── AgentHUD.tsx
│   │   │   │   ├── ChatTerminal.tsx
│   │   │   │   ├── RoomHeader.tsx
│   │   │   │   └── JoinModal.tsx
│   │   │   ├── App.tsx
│   │   │   ├── index.css
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── server.ts
│   │   ├── vercel.json
│   │   ├── vite.config.ts
│   │   └── package.json
│   └── cowork-mcp/
│       ├── src/
│       │   ├── types.ts
│       │   ├── git.ts
│       │   ├── poller.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
```

---

## 3. Data Contracts & State Management

### 3.1 Types (`_types.ts` / `types.ts`)
```typescript
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
  senderId: string;     // e.g., "loid-ai", "peer-ai", "loid", "peer"
  targetId: string;     // e.g., "all", "peer-ai", "loid-ai", "loid", "peer"
  contentType: ContentType;
  text: string;
  files?: string[];
  commitHash?: string;
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
  fileLocks: Record<string, FileLockInfo>;
  inboxes: Record<string, CoWorkMessage[]>;
  history: CoWorkMessage[];
}
```

---

## 4. Relay Storage Engine & Edge-Case Safeguards

### 4.1 Hybrid Storage Engine (`_store.ts`)
- **Memory + Disk Mode (Default / Zero-Config)**: In-memory `Map<string, RoomState>` synchronized with `/tmp/cowork_state.json`. Reads on start, persists on state mutations with throttled sync.
- **Postgres Mode (`DATABASE_URL`)**: Uses `pg` to automatically create and query `cowork_rooms (room_code VARCHAR(32) PRIMARY KEY, state JSONB NOT NULL, updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW())`.
- **Lock TTL Expiry Safeguard**:
  - `LOCK_TTL_MS = 90_000` (90 seconds).
  - On every store operation (`getRoom`, `saveRoom`), sweep active file locks.
  - If `Date.now() - lock.timestamp > LOCK_TTL_MS` OR if `room.participants[lock.lockedBy]` has `Date.now() - lastSeen > LOCK_TTL_MS`, auto-release the lock and append an audit event into history: `[SYSTEM] Auto-released file lock on ${file} due to inactivity by ${lock.lockedBy}`.

---

## 5. API Endpoints

### 5.1 POST `/api/send`
- **CORS**: `*`, open access.
- **Payload**: `CoWorkMessage`.
- **Logic**:
  1. Validate `roomCode`, `senderId`, `text` / `contentType`.
  2. Parse @mentions in `text` (e.g. `@peer-ai` sets `targetId = "peer-ai"` and `contentType = "CROSS_PROMPT"` if default CHAT).
  3. Clean expired file locks (TTL check).
  4. If `contentType === "FILE_LOCK"`:
     - Check `room.fileLocks` for any requested file already locked by `other != senderId`.
     - If conflict: Return `HTTP 409 Conflict` with `{ ok: false, error: "FILE_LOCKED", lockedBy: string, conflictingFiles: string[] }`.
     - Else: Record locks in `room.fileLocks[file]` with `{ lockedBy: senderId, task: text, timestamp: Date.now() }`.
  5. If `contentType === "FILE_UNLOCK"` or `"GIT_PUSH"`:
     - Release all locks where `lockedBy === senderId`.
     - If `"GIT_PUSH"`, update `room.latestCommit` if provided.
  6. Multicast Routing:
     - Append message to `room.history` (trimmed to last 100).
     - If `targetId === "all"`: push to `inboxes[p]` for every participant `p != senderId`.
     - If `targetId !== "all"`: push to `inboxes[targetId]` (if registered or newly initialized), AND push to all human participants (`role === "human"`) so web dashboards observe all cross-agent messages.
  7. Return `HTTP 200` with `{ ok: true, messageId: string, roomStateSummary }`.

### 5.2 GET `/api/presence`
- **Query Params**: `action=inbox`, `roomCode`, `clientId`, `role`, `status`.
- **Logic**:
  1. Clean expired file locks.
  2. Update `room.participants[clientId] = { clientId, role, status, lastSeen: Date.now() }`.
  3. Atomically drain and empty `room.inboxes[clientId]`.
  4. Return `HTTP 200` with:
     ```json
     {
       "ok": true,
       "messages": [...drained],
       "fileLocks": {...},
       "participants": {...},
       "latestCommit": {...},
       "recentHistory": [...]
     }
     ```

---

## 6. Web & Mobile Dashboard (`packages/cowork-web-relay`)

- **Design System**: Nothing OS / Cyberpunk Dark Mode:
  - Background `#09090b`, monospace typography (JetBrains Mono / Inter), dot-matrix accent headings.
  - Active agents: Glowing Emerald `#10b981`.
  - Locked files: Amber Warning `#f59e0b`.
  - Terminal Chat: Cyan `#06b6d4` & Violet `#8b5cf6`.
- **Room Join & Connection**:
  - URL query parser `?room=SED409&as=loid`.
  - Modal/Card to create a fresh room code (e.g. `SED-409`) or join existing.
  - Interactive QR Code (`qrcode.react`) and one-click copy URL button.
- **Split-Screen HUD**:
  - `AgentHUD`: Cards for `loid-ai` and `peer-ai`, status pill (Idle / Coding / Syncing), active heartbeat ping indicator, list of locked files.
  - Top Bar: Latest git commit badge (`hash`, author, commit message, time ago).
- **Interactive @ Command Terminal**:
  - Live message log with filters (All, Chats, Prompts, Git).
  - Quick-click @ pills: `@loid-ai`, `@peer-ai`, `@loid`, `@peer`, `@all`.
  - Input field with Enter to send.

---

## 7. Antigravity MCP Server (`packages/cowork-mcp`)

- **Transport**: `StdioServerTransport` using `@modelcontextprotocol/sdk`.
- **Safe Git Subsystem (`git.ts`)**:
  - Git Lock Mutex: `isGitBusy` flag ensures only one git operation runs at a time.
  - Safe rebase-pull: Checks `.git/rebase-merge` or `.git/rebase-apply` before pulling.
  - Commands executed via `simple-git`: `git pull --rebase --autostash origin main`.
- **Background Polling Loop (`poller.ts`)**:
  - 2-second interval `GET /api/presence`.
  - Queues incoming messages into `pendingInbox`.
  - When a message of `contentType === "GIT_PUSH"` arrives from a peer agent, automatically triggers safe git pull.
- **Registered MCP Tools**:
  1. `cowork_connect({ roomCode?: string, agentId: string, repoPath: string, relayUrl?: string })`: Joins room, prints ASCII QR code via `qrcode-terminal`, starts poller.
  2. `cowork_claim_files({ files: string[], taskDescription: string })`: Sends `FILE_LOCK` to relay. Returns lock status or 409 conflict details.
  3. `cowork_message_peer({ targetId: string, message: string, contentType?: ContentType })`: Sends message to peer or human, drains local inbox.
  4. `cowork_sync_main({ commitMessage: string })`: Safe git pull rebase, git add, commit, push, and emits `GIT_PUSH` to relay.
  5. `cowork_check_inbox({ waitForSeconds?: number })`: Polls and drains pending inbox messages and returns current file locks.
  6. `cowork_watch_loop({ durationSeconds?: number })`: Waits up to duration for incoming @ commands or sync requests and returns immediately on arrival.
