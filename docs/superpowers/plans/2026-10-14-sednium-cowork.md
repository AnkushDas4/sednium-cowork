# Sednium CoWork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build "Sednium CoWork" — a dedicated stateless HTTP mailbox relay, Cyberpunk web/mobile HUD dashboard, and local Antigravity MCP server with file locks and safe auto-rebase git synchronization.

**Architecture:** A 2-package npm monorepo containing `packages/cowork-web-relay` (Vercel serverless functions `/api/*` + Express dev runner + Vite/React web HUD) and `packages/cowork-mcp` (TypeScript stdio MCP server for Antigravity with 2s poller and concurrency-safe git auto-pull).

**Tech Stack:** Node.js 26, TypeScript, Express, Vite, React 19, Tailwind CSS, Lucide Icons, qrcode.react, @modelcontextprotocol/sdk, simple-git, qrcode-terminal, vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-sednium-cowork-design.md`

## Global Constraints
- Node 20+ / Node 26 compatible.
- Monorepo structure using npm workspaces (`workspaces: ["packages/*"]`).
- No external DB required for default zero-config mode (global memory Map + `/tmp/cowork_state.json`), with automatic Postgres table creation if `DATABASE_URL` is set.
- Lock TTL safeguard: Auto-expire locks after 90 seconds of inactivity or missed heartbeats.
- Git auto-pull concurrency guard: Mutex lock in `git.ts` to prevent overlapping git operations.
- Clean Vercel serverless exports (`export default async function handler(req, res)`).

---

### Task 1: Monorepo Scaffolding & Core Shared Types

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `packages/cowork-web-relay/package.json`
- Create: `packages/cowork-web-relay/tsconfig.json`
- Create: `packages/cowork-web-relay/api/_types.ts`
- Create: `packages/cowork-mcp/package.json`
- Create: `packages/cowork-mcp/tsconfig.json`
- Create: `packages/cowork-mcp/src/types.ts`

**Interfaces:**
- Produces: `RoomState`, `CoWorkMessage`, `ContentType`, `ClientRole`, `FileLockInfo`, `ParticipantInfo`, `CommitInfo`.

- [ ] **Step 1: Write root package.json and .gitignore**
- [ ] **Step 2: Configure package.json and tsconfig.json for cowork-web-relay and cowork-mcp**
- [ ] **Step 3: Define canonical TypeScript interfaces in both packages**
- [ ] **Step 4: Run `npm install` from root to install dependencies and link workspaces**
- [ ] **Step 5: Verify workspace linking and commit**

---

### Task 2: Backend Relay Storage Engine (`_store.ts`) with Dual-Mode & TTL Safeguard

**Files:**
- Create: `packages/cowork-web-relay/api/_store.ts`
- Test: `packages/cowork-web-relay/test/store.test.ts`

**Interfaces:**
- Produces: `getRoom(roomCode: string): Promise<RoomState>`, `saveRoom(state: RoomState): Promise<void>`, `cleanExpiredLocks(room: RoomState): boolean`, `LOCK_TTL_MS`.

- [ ] **Step 1: Write unit tests in `store.test.ts` verifying room creation, memory persistence, file fallback, and 90s lock TTL expiration**
- [ ] **Step 2: Implement `_store.ts` with in-memory singleton Map, /tmp JSON fallback, Postgres `cowork_rooms` auto-provisioning, and lock cleanup**
- [ ] **Step 3: Run `npx vitest run packages/cowork-web-relay/test/store.test.ts` to verify tests pass**
- [ ] **Step 4: Commit**

---

### Task 3: Backend Relay API Handlers & Local Dev Server

**Files:**
- Create: `packages/cowork-web-relay/api/send.ts`
- Create: `packages/cowork-web-relay/api/presence.ts`
- Create: `packages/cowork-web-relay/server.ts`
- Create: `packages/cowork-web-relay/vercel.json`
- Test: `packages/cowork-web-relay/test/api.test.ts`

**Interfaces:**
- Produces: `POST /api/send`, `GET /api/presence`, local Express runner on port 3000.

- [ ] **Step 1: Write API tests in `api.test.ts` verifying @mention routing, 409 Conflict on file lock contention, auto-unlock on GIT_PUSH, and atomic inbox draining in GET /api/presence**
- [ ] **Step 2: Implement `api/send.ts` with Vercel serverless signature and Express compatibility**
- [ ] **Step 3: Implement `api/presence.ts` with atomic queue draining and participant heartbeat update**
- [ ] **Step 4: Implement `server.ts` with Express routing to API handlers and Vite dev middleware**
- [ ] **Step 5: Run `npx vitest run packages/cowork-web-relay/test/api.test.ts` to verify tests pass**
- [ ] **Step 6: Commit**

---

### Task 4: Web UI Cyberpunk Dashboard

**Files:**
- Create: `packages/cowork-web-relay/vite.config.ts`
- Create: `packages/cowork-web-relay/tailwind.config.js`
- Create: `packages/cowork-web-relay/postcss.config.js`
- Create: `packages/cowork-web-relay/index.html`
- Create: `packages/cowork-web-relay/src/index.css`
- Create: `packages/cowork-web-relay/src/main.tsx`
- Create: `packages/cowork-web-relay/src/App.tsx`
- Create: `packages/cowork-web-relay/src/components/RoomHeader.tsx`
- Create: `packages/cowork-web-relay/src/components/AgentHUD.tsx`
- Create: `packages/cowork-web-relay/src/components/ChatTerminal.tsx`
- Create: `packages/cowork-web-relay/src/components/JoinModal.tsx`

**Interfaces:**
- Produces: Responsive Nothing OS / Cyberpunk Dark Mode web app with QR code, agent HUD, file lock pills, top bar commit badge, and @ command terminal.

- [ ] **Step 1: Configure Tailwind CSS, PostCSS, and Vite**
- [ ] **Step 2: Implement `JoinModal.tsx` for room creation/joining with URL query auto-detection**
- [ ] **Step 3: Implement `RoomHeader.tsx` with room code, QR code modal via `qrcode.react`, copy link, and latest commit display**
- [ ] **Step 4: Implement `AgentHUD.tsx` with split cards for loid-ai and peer-ai, activity pulse, and locked file badges**
- [ ] **Step 5: Implement `ChatTerminal.tsx` with 2s polling, one-tap @ pills, filter tabs, and sending**
- [ ] **Step 6: Build Vite frontend with `npm run build` to verify clean compilation**
- [ ] **Step 7: Commit**

---

### Task 5: Antigravity MCP Server Safe Git Subsystem

**Files:**
- Create: `packages/cowork-mcp/src/git.ts`
- Test: `packages/cowork-mcp/test/git.test.ts`

**Interfaces:**
- Produces: `safePullRebase(repoPath: string): Promise<{ success: boolean; output: string }>`, `safeCommitAndPush(repoPath: string, message: string): Promise<{ success: boolean; hash: string }>`, `getGitCommitInfo(repoPath: string): Promise<CommitInfo>`, `isGitBusy(): boolean`.

- [ ] **Step 1: Write tests in `git.test.ts` verifying git mutex lock prevents parallel pulls/pushes**
- [ ] **Step 2: Implement `git.ts` with simple-git, mutex locking, rebase/stash safety, and commit info extraction**
- [ ] **Step 3: Run `npx vitest run packages/cowork-mcp/test/git.test.ts` to verify tests pass**
- [ ] **Step 4: Commit**

---

### Task 6: Antigravity MCP Poller & 6 MCP Tools

**Files:**
- Create: `packages/cowork-mcp/src/poller.ts`
- Create: `packages/cowork-mcp/src/index.ts`
- Test: `packages/cowork-mcp/test/mcp.test.ts`

**Interfaces:**
- Produces: Stdio MCP Server exposing `cowork_connect`, `cowork_claim_files`, `cowork_message_peer`, `cowork_sync_main`, `cowork_check_inbox`, `cowork_watch_loop`.

- [ ] **Step 1: Write integration tests for MCP tools and poller loop**
- [ ] **Step 2: Implement `poller.ts` with 2s background loop, pendingInbox queue, and automatic `git pull --rebase` on `GIT_PUSH`**
- [ ] **Step 3: Implement `index.ts` with `@modelcontextprotocol/sdk` StdioServerTransport, 6 tools, and `qrcode-terminal` printing**
- [ ] **Step 4: Run `npx vitest run packages/cowork-mcp/test/mcp.test.ts` to verify tests pass**
- [ ] **Step 5: Build MCP package with `npm run build`**
- [ ] **Step 6: Commit**

---

### Task 7: Full System Verification & Deployment Readying

**Files:**
- Create: `README.md` (Quickstart, Vercel deployment guide, AGY MCP config snippet)

- [ ] **Step 1: Run full end-to-end simulation between mock web client and mock MCP agent**
- [ ] **Step 2: Verify `npm test` across all packages**
- [ ] **Step 3: Document Antigravity configuration in README.md**
- [ ] **Step 4: Final commit and summary**
