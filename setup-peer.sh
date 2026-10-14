#!/usr/bin/env bash
set -e

# ==============================================================================
# Sednium CoWork peer installer: builds the MCP server in this clone and
# registers it with whichever AI harness config directories already exist.
#
# Everything is optional. Flags win over environment variables, and nothing here
# writes a secret into the repository.
# ==============================================================================

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

usage() {
  cat <<'USAGE'
Usage: setup-peer.sh [options]

  --relay-url URL      Relay origin to point the client at   (env COWORK_RELAY_URL)
  --invite-link LINK   Full invite link, "?room=CODE#k=KEY". One argument configures
                       relay, room and key together          (env COWORK_INVITE_LINK)
  --room-code CODE     Room code only                        (env COWORK_ROOM_CODE)
  --invite-key KEY     48-64 hex room key                    (env COWORK_INVITE_KEY)
  --agent-id HANDLE    Handle this machine shows in the room (env COWORK_AGENT_ID)
  --skip-install       Assume deps are installed and bin/cowork.cjs is current
  -h, --help           Show this help

No flags writes only COWORK_RELAY_URL into the config, which is the normal setup: the
room is chosen at connect time (cowork_connect with inviteLink), not baked in here.
USAGE
}

RELAY_URL="${COWORK_RELAY_URL:-https://cowork.sednium.com}"
ROOM_CODE="${COWORK_ROOM_CODE:-}"
INVITE_LINK="${COWORK_INVITE_LINK:-}"
INVITE_KEY="${COWORK_INVITE_KEY:-}"
AGENT_ID="${COWORK_AGENT_ID:-}"
SKIP_INSTALL=0

while [ $# -gt 0 ]; do
  case "$1" in
    --relay-url | --room-code | --invite-link | --invite-key | --agent-id)
      if [ $# -lt 2 ]; then
        echo -e "${RED}❌ $1 needs a value.${RESET}"
        usage
        exit 2
      fi
      ;;
  esac
  case "$1" in
    --relay-url) RELAY_URL="$2"; shift 2 ;;
    --room-code) ROOM_CODE="$2"; shift 2 ;;
    --invite-link) INVITE_LINK="$2"; shift 2 ;;
    --invite-key) INVITE_KEY="$2"; shift 2 ;;
    --agent-id) AGENT_ID="$2"; shift 2 ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    -h | --help) usage; exit 0 ;;
    *)
      # Silently ignoring an argument is how "--room-code X" ends up doing nothing.
      echo -e "${RED}❌ Unknown option: $1${RESET}"
      usage
      exit 2
      ;;
  esac
done

echo -e "${CYAN}${BOLD}Sednium CoWork${RESET}${BOLD} - peer setup${RESET}\n"
echo -e "${CYAN}(ASCII banner lives in the README; shell quoting it is a footgun.)${RESET}"

# 1. Repository layout
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_ENTRY="$REPO_ROOT/packages/cowork-mcp/dist/index.js"
# The committed single-file bundle works without any build, so a fresh clone can pair immediately.
if [ ! -f "$MCP_ENTRY" ] && [ -f "$REPO_ROOT/bin/cowork.cjs" ]; then
  MCP_ENTRY="$REPO_ROOT/bin/cowork.cjs"
fi

echo -e "${CYAN}📁 Repository:${RESET}        $REPO_ROOT"
echo -e "${CYAN}📡 Relay endpoint:${RESET}     $RELAY_URL"
if [ -n "$INVITE_LINK" ]; then
  # Never echo the key: this output ends up in terminal scrollbacks and CI logs.
  echo -e "${CYAN}🔑 Invite link:${RESET}        set (key not printed)"
fi
if [ -n "$ROOM_CODE" ] || [ -n "$INVITE_KEY" ] || [ -n "$AGENT_ID" ]; then
  echo -e "${CYAN}📌 Defaults:${RESET}         room=${ROOM_CODE:-none} agent=${AGENT_ID:-none} key=${INVITE_KEY:+set}$([ -z "$INVITE_KEY" ] && echo none)"
fi
echo ""

# 2. Prerequisites
if ! command -v node >/dev/null 2>&1; then
  echo -e "${YELLOW}❌ Node.js is required but not found in PATH.${RESET}"
  echo "Install Node.js v20 or newer and re-run this script."
  exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✔ Node.js ${NODE_VERSION}${RESET}"

# 3. Dependencies + build (skippable when the single-file bundle is already current)
if [ "$SKIP_INSTALL" -eq 0 ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo -e "${YELLOW}❌ npm is required to build from source (or pass --skip-install).${RESET}"
    exit 1
  fi
  echo -e "\n${BOLD}📦 Installing monorepo dependencies...${RESET}"
  (cd "$REPO_ROOT" && npm install)
  echo -e "\n${BOLD}🔨 Building packages...${RESET}"
  (cd "$REPO_ROOT" && npm run build)
fi

if [ ! -f "$MCP_ENTRY" ]; then
  echo -e "${YELLOW}❌ No MCP server entry found (expected $MCP_ENTRY)${RESET}"
  echo "Run: npm ci && npm run build"
  exit 1
fi
chmod +x "$MCP_ENTRY" 2>/dev/null || true
echo -e "${GREEN}✔ MCP server entry: $MCP_ENTRY${RESET}"

# 4. Register with the harnesses that are actually installed
echo -e "\n${BOLD}⚙️  Configuring AI harness MCP servers...${RESET}"

COWORK_MCP_ENTRY="$MCP_ENTRY" \
COWORK_RELAY_URL="$RELAY_URL" \
COWORK_ROOM_CODE="$ROOM_CODE" \
COWORK_INVITE_LINK="$INVITE_LINK" \
COWORK_INVITE_KEY="$INVITE_KEY" \
COWORK_AGENT_ID="$AGENT_ID" \
node << 'EOF'
const fs = require('fs');
const os = require('os');
const path = require('path');

const env = process.env;
const mcpEntry = {
  command: process.execPath, // absolute: GUI-launched harnesses get a minimal PATH
  args: [env.COWORK_MCP_ENTRY],
  env: { COWORK_RELAY_URL: env.COWORK_RELAY_URL },
};
// Only write what was actually provided; unset values stay per-session (cowork_connect).
for (const [key, value] of [
  ['COWORK_AGENT_ID', env.COWORK_AGENT_ID],
  ['COWORK_ROOM_CODE', env.COWORK_ROOM_CODE],
  ['COWORK_INVITE_LINK', env.COWORK_INVITE_LINK],
]) {
  if (value && value.trim()) mcpEntry.env[key] = value.trim();
}
if (env.COWORK_INVITE_KEY && /^[a-fA-F0-9]{48,64}$/i.test(env.COWORK_INVITE_KEY.trim())) {
  mcpEntry.env.COWORK_INVITE_KEY = env.COWORK_INVITE_KEY.trim();
}

const candidates = [
  // [config path, directory that must already exist for this harness to be real]
  [path.join(os.homedir(), '.gemini/config/mcp_config.json'), path.join(os.homedir(), '.gemini')],
  [path.join(os.homedir(), '.gemini/antigravity/mcp_config.json'), path.join(os.homedir(), '.gemini')],
  [path.join(os.homedir(), '.gemini/antigravity/mcp.json'), path.join(os.homedir(), '.gemini')],
  [path.join(os.homedir(), '.config/Claude/claude_desktop_config.json'), path.join(os.homedir(), '.config')],
  [path.join(os.homedir(), 'Library/Application Support/Claude/claude_desktop_config.json'), path.join(os.homedir(), 'Library/Application Support')],
  [path.join(os.homedir(), '.cursor/mcp.json'), path.join(os.homedir(), '.cursor')],
  [path.join(os.homedir(), '.codeium/windsurf/mcp_config.json'), path.join(os.homedir(), '.codeium')],
];

let touched = 0;
for (const [cfgPath, requireDir] of candidates) {
  // Never create a config tree for a harness this machine does not have.
  if (!fs.existsSync(requireDir)) continue;
  try {
    let config = { mcpServers: {} };
    if (fs.existsSync(cfgPath)) {
      const content = fs.readFileSync(cfgPath, 'utf8').trim();
      if (content.length > 0) {
        try {
          config = JSON.parse(content);
        } catch {
          fs.copyFileSync(cfgPath, cfgPath + '.bak');
          console.warn('\x1b[33m! Existing config was not valid JSON; backed up to ' + cfgPath + '.bak and replaced.\x1b[0m');
          config = { mcpServers: {} };
        }
      }
    }
    config.mcpServers = { ...(config.mcpServers || {}), cowork: mcpEntry };
    fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
    touched += 1;
    console.log('\x1b[32m✔ updated ' + cfgPath + '\x1b[0m');
  } catch (err) {
    console.error('\x1b[31m✗ ' + cfgPath + ': ' + err.message + '\x1b[0m');
  }
}

if (touched === 0) {
  console.log('\x1b[33mNo known harness config directory found (Antigravity/Gemini, Claude, Cursor, Windsurf).\x1b[0m');
  console.log('Add this to whichever harness you do use, then reload it:\n');
  console.log(JSON.stringify({ mcpServers: { cowork: mcpEntry } }, null, 2));
}
EOF

echo -e "\n${GREEN}${BOLD}🎉 Setup complete${RESET}\n"
echo "Next, in the harness:"
echo -e "  1. Reload MCP so the ${CYAN}cowork_*${RESET} tools appear."
echo -e "  2. Say: ${CYAN}\"join <paste the invite link>\"${RESET} - the agent passes it as ${CYAN}cowork_connect.inviteLink${RESET}."
echo -e "  3. No room yet? Ask it to ${CYAN}connect and mint one${RESET}; it prints the link and a QR for the phone dashboard."
echo -e "  4. Docs: README.md - tools, environment variables, security model, troubleshooting.\n"
