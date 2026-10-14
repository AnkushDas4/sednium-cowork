# Sednium CoWork (`cowork.sednium.com`)

> Dedicated Stateless Relay + Cyberpunk Web/Mobile HUD + Antigravity MCP Server for multi-developer, multi-agent AI pair programming.

---

## Architecture Overview

```
                      ┌─────────────────────────────────────────┐
                      │    https://cowork.sednium.com           │
                      │  (Vercel Serverless / Local Express)    │
                      │                                         │
                      │  • POST /api/send   (Multicast & Locks) │
                      │  • GET  /api/presence (Atomic Drain)    │
                      │  • React 19 + Tailwind Cyberpunk HUD    │
                      └───────────────▲─────────────────────────┘
                                      │
            ┌─────────────────────────┴─────────────────────────┐
            │                                                   │
  HTTP 2s Polling + Locks                             HTTP 2s Polling + Locks
            │                                                   │
┌───────────▼───────────────┐                       ┌───────────▼───────────────┐
│ Laptop 1 (CachyOS/Linux)  │                       │ Laptop 2 (Linux/Mac/PC)   │
│ Antigravity AI: @loid-ai  │                       │ Antigravity AI: @peer-ai  │
│ Human: @loid              │                       │ Human: @peer              │
│ Local CoWork MCP Server   │                       │ Local CoWork MCP Server   │
│ Auto-git sync on main     │                       │ Auto-git sync on main     │
└───────────────────────────┘                       └───────────────────────────┘
```

---

## Key Features

1. **Stateless HTTP Mailbox Relay**:
   - Zero WebSockets, zero Cloudflare tunnels, zero auth barriers.
   - Built on standard Vercel Serverless Functions (`/api/send` and `/api/presence`).
2. **Dual-Mode Storage Engine**:
   - **Zero-Config Mode (Default)**: In-memory singleton Map synchronized with `/tmp/cowork_state.json`. Works immediately on local dev and warm serverless functions.
   - **Postgres Mode**: If `DATABASE_URL` is provided, automatically provisions `cowork_rooms` table for cross-cold-start resilience.
3. **90-Second Lock TTL Safeguard**:
   - File locks auto-expire if holding agent is inactive or disconnected for >90 seconds, preventing stalled work.
4. **Safe Git Auto-Pull Subsystem**:
   - Simple-git mutex lock prevents concurrent git operations or overlapping 2-second polls.
   - Whenever an agent runs `cowork_sync_main` (`GIT_PUSH`), all peer MCPs automatically run `git pull --rebase --autostash origin main`.
5. **Cyberpunk Nothing OS HUD**:
   - Mobile and desktop responsive dark mode (`#09090b`), dot-matrix styling, JetBrains Mono font.
   - Live split-screen agent telemetry (online pulse, status, locked file badges).
   - Scannable QR code (`qrcode.react`) and one-click copy link for instant phone onboarding.
   - Interactive @ command terminal with one-tap mention pills (`@peer-ai`, `@loid-ai`, `@all`).

---

## Monorepo Layout

```
sednium-cowork/
├── packages/
│   ├── cowork-web-relay/     # Vercel Serverless Relay + Vite React HUD
│   │   ├── api/
│   │   │   ├── _types.ts     # Canonical data interfaces
│   │   │   ├── _store.ts     # Dual-mode store with 90s TTL cleanup
│   │   │   ├── send.ts       # POST /api/send handler
│   │   │   └── presence.ts   # GET /api/presence handler
│   │   ├── src/              # React 19 + Tailwind Cyberpunk UI
│   │   ├── server.ts         # Unified Express dev runner (:3000)
│   │   └── vercel.json       # Production Vercel serverless configuration
│   └── cowork-mcp/           # Antigravity stdio MCP Server
│       ├── src/
│       │   ├── types.ts      # Canonical data interfaces
│       │   ├── git.ts        # Mutex-protected git auto-pull & commit
│       │   ├── poller.ts     # 2s background polling & inbox drainer
│       │   └── index.ts      # Stdio MCP Server with 6 tools + ASCII QR
│       └── dist/             # Compiled JS entrypoint
```

---

## Quickstart

### 1. Install & Build
```bash
git clone <repo-url> sednium-cowork
cd sednium-cowork
npm install
npm run build
```

### 2. Run Relay & Web Dashboard Locally
```bash
npm run dev:relay
```
Open **`http://localhost:3000`** in your browser. Both the React HUD and the `/api/*` endpoints run unified on port 3000.

### 3. Deploy to Vercel (`cowork.sednium.com`)
```bash
cd packages/cowork-web-relay
npx vercel deploy --prod
```
In your Vercel project settings, assign domain `cowork.sednium.com`. Optionally set `DATABASE_URL` for PostgreSQL persistence.

---

## Configuring AI Harnesses (Antigravity, Claude, Cursor, Windsurf)

Because `cowork-mcp` implements the standard Model Context Protocol (MCP) over Stdio, it works with **any AI harness**:

### 1. Google Antigravity (`~/.gemini/config/mcp_config.json`)
```json
{
  "mcpServers": {
    "cowork": {
      "command": "node",
      "args": ["<PATH_TO_REPO>/packages/cowork-mcp/dist/index.js"],
      "env": {
        "COWORK_RELAY_URL": "https://cowork.sednium.com"
      }
    }
  }
}
```

### 2. Claude Desktop (`claude_desktop_config.json`)
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cowork": {
      "command": "node",
      "args": ["<PATH_TO_REPO>/packages/cowork-mcp/dist/index.js"],
      "env": {
        "COWORK_RELAY_URL": "https://cowork.sednium.com"
      }
    }
  }
}
```

### 3. Claude Code CLI
Run directly in your terminal:
```bash
claude mcp add cowork node <PATH_TO_REPO>/packages/cowork-mcp/dist/index.js -e COWORK_RELAY_URL=https://cowork.sednium.com
```

### 4. Cursor & Windsurf (`.cursor/mcp.json` or `~/.codeium/windsurf/mcp_config.json`)
```json
{
  "mcpServers": {
    "cowork": {
      "command": "node",
      "args": ["<PATH_TO_REPO>/packages/cowork-mcp/dist/index.js"],
      "env": {
        "COWORK_RELAY_URL": "https://cowork.sednium.com"
      }
    }
  }
}
```

---

## Antigravity MCP Tools

| Tool | Parameters | Description |
|---|---|---|
| `cowork_connect` | `roomCode?`, `agentId`, `repoPath?`, `relayUrl?` | Joins room, starts 2s poller, prints ASCII QR code + mobile join link. |
| `cowork_claim_files` | `files`, `taskDescription` | Claims server-side file locks. Returns 409 Conflict if locked by peer AI. |
| `cowork_message_peer` | `targetId`, `message`, `contentType?` | Sends `@peer-ai` task prompts or schema sync messages and drains inbox. |
| `cowork_sync_main` | `commitMessage` | Runs git pull rebase, commits, pushes to main, unlocks files, and triggers peer auto-pull. |
| `cowork_check_inbox` | `waitForSeconds?` | Drains pending incoming @ commands and returns current room locks. |
| `cowork_watch_loop` | `durationSeconds?` | Keeps AI listening for incoming instructions and wakes up autonomously. |

---

## Typical Team Workflow

1. **Connect Agents**:
   - Laptop 1 prompt: *"Connect to CoWork room `SED-409` as `loid-ai` in this repo."*
   - Laptop 2 prompt: *"Connect to CoWork room `SED-409` as `peer-ai` in this repo."*
   - Both engineers scan the QR code on their phones to view `https://cowork.sednium.com/?room=SED-409`.
2. **Lock & Code**:
   - Laptop 1 AI calls `cowork_claim_files(['src/api/auth.ts'], 'Writing OAuth endpoint')`.
   - Laptop 2 AI is blocked from touching `src/api/auth.ts` until Laptop 1 syncs.
3. **Sync & Auto-Rebase**:
   - Laptop 1 AI runs `cowork_sync_main('feat: add OAuth endpoint')`.
   - Within 2 seconds, Laptop 2 MCP receives `GIT_PUSH` and runs `git pull --rebase --autostash origin main` automatically.
4. **Handoff**:
   - Laptop 1 AI calls `cowork_message_peer('peer-ai', 'Auth routes are on main! Connect the login UI.')`.
   - Laptop 2 AI receives the instruction and starts coding the frontend.
