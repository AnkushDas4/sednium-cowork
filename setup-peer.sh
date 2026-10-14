#!/usr/bin/env bash
set -e

# ==============================================================================
# Sednium CoWork Peer 1-Command Installer
# Automatically installs dependencies, builds packages, and registers the
# cowork MCP server into Google Antigravity on Linux.
# ==============================================================================

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  ___ ___ ___  _  _ ___ _   _ __  __   _____  _____  ___  _  __"
echo " / __| __|   \| \| |_ _| | | |  \/  | / __\ \/ / _ \/ _ \| |/ /"
echo " \__ \ _|| |) | .\` || || |_| | |\/| || (__ >  <|   / (_) | ' < "
echo " |___/___|___/|_|\_|___|\___/|_|  |_(_)___/_/\_\_|_\\___/|_|\_\\"
echo -e "${RESET}"
echo -e "${BOLD}Sednium CoWork Setup for Antigravity Pairing${RESET}\n"

# 1. Determine Repository Path
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_DIST_PATH="$REPO_ROOT/packages/cowork-mcp/dist/index.js"
RELAY_URL="${COWORK_RELAY_URL:-https://cowork.sednium.com}"

echo -e "${CYAN}📁 Working Directory:${RESET} $REPO_ROOT"
echo -e "${CYAN}📡 Relay Endpoint:${RESET}   $RELAY_URL\n"

# 2. Check Prerequisites
if ! command -v node >/dev/null 2>&1; then
  echo -e "${YELLOW}❌ Node.js is required but not found in PATH.${RESET}"
  echo "Please install Node.js (v20+ recommended) and re-run this script."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo -e "${YELLOW}❌ npm is required but not found in PATH.${RESET}"
  exit 1
fi

NODE_VERSION=$(node -v)
echo -e "${GREEN}✔ Detected Node.js ${NODE_VERSION}${RESET}"

# 3. Install Monorepo Dependencies
echo -e "\n${BOLD}📦 Installing monorepo dependencies...${RESET}"
cd "$REPO_ROOT"
npm install

# 4. Build Monorepo Workspaces
echo -e "\n${BOLD}🔨 Compiling TypeScript packages...${RESET}"
npm run build

if [ ! -f "$MCP_DIST_PATH" ]; then
  echo -e "${YELLOW}❌ Build output missing: $MCP_DIST_PATH${RESET}"
  exit 1
fi

chmod +x "$MCP_DIST_PATH"
echo -e "${GREEN}✔ MCP Server built at: $MCP_DIST_PATH${RESET}"

# 5. Inject MCP Server into Antigravity Config
echo -e "\n${BOLD}⚙️  Configuring AI Harness MCP Servers (Antigravity, Claude, Cursor, Windsurf)...${RESET}"

# Candidate AI Harness MCP config locations
CONFIG_PATHS=(
  "$HOME/.gemini/config/mcp_config.json"
  "$HOME/.gemini/antigravity/mcp_config.json"
  "$HOME/.gemini/antigravity/mcp.json"
  "$HOME/.config/Claude/claude_desktop_config.json"
  "$HOME/Library/Application Support/Claude/claude_desktop_config.json"
  "$HOME/.cursor/mcp.json"
  "$HOME/.codeium/windsurf/mcp_config.json"
)

# Helper node script to safely merge JSON
node - "$MCP_DIST_PATH" "$RELAY_URL" "${CONFIG_PATHS[@]}" << 'EOF'
const fs = require('fs');
const path = require('path');

const mcpDistPath = process.argv[2];
const relayUrl = process.argv[3];
const configPaths = process.argv.slice(4);

const mcpEntry = {
  command: "node",
  args: [mcpDistPath],
  env: {
    COWORK_RELAY_URL: relayUrl
  }
};

for (const cfgPath of configPaths) {
  try {
    const dir = path.dirname(cfgPath);
    // For third party harnesses (Claude, Cursor, Windsurf), only configure if parent folder or app exists
    const isGemini = cfgPath.includes('.gemini');
    if (!isGemini && !fs.existsSync(dir)) {
      continue;
    }

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let config = { mcpServers: {} };
    if (fs.existsSync(cfgPath)) {
      const content = fs.readFileSync(cfgPath, 'utf8').trim();
      if (content.length > 0) {
        try {
          config = JSON.parse(content);
        } catch (e) {
          console.warn('Warning parsing existing config at ' + cfgPath + ', creating backup.');
          fs.copyFileSync(cfgPath, cfgPath + '.bak');
          config = { mcpServers: {} };
        }
      }
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers.cowork = mcpEntry;

    fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('\x1b[32m✔ Successfully updated ' + cfgPath + '\x1b[0m');
  } catch (err) {
    console.error('Error updating ' + cfgPath + ':', err.message);
  }
}
EOF

echo -e "\n${GREEN}${BOLD}🎉 Sednium CoWork Setup Complete!${RESET}\n"
echo -e "Compatible AI Harnesses: Google Antigravity, Claude Code / Desktop, Cursor, Windsurf."
echo -e "\nTo start pair programming:"
echo -e "  1. Open Antigravity, Claude, Cursor, or Windsurf."
echo -e "  2. Tell your agent:"
echo -e "     ${CYAN}\"Create a new CoWork room as peer-ai in this repo.\"${RESET}"
echo -e "  3. Scan the terminal ASCII QR or visit ${CYAN}${RELAY_URL}${RESET} on your phone!"
echo -e "\nHappy Co-Coding! 🚀\n"
