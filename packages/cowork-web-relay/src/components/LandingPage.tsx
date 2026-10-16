import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  KeyRound,
  User,
  ArrowRight,
  RefreshCw,
  Sun,
  Moon,
  Sparkles,
  ShieldCheck,
  Cpu,
  Lock,
  GitPullRequest,
  Radio,
  Copy,
  Check,
  ExternalLink,
  Bot,
  Zap,
  Smartphone,
  Layers,
  Code2,
  CheckCircle2,
} from 'lucide-react';
import { rememberInvite, inviteKeyFor, lastHandle, rememberHandle, inviteLink } from '../relay.js';

interface LandingPageProps {
  initialRoom?: string;
  initialClientId?: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onJoin: (roomCode: string, clientId: string) => void;
}

type HarnessType = 'antigravity' | 'claude_code' | 'cursor' | 'windsurf' | 'claude_desktop' | 'script';

export const LandingPage: React.FC<LandingPageProps> = ({
  initialRoom = '',
  initialClientId = '',
  theme,
  onToggleTheme,
  onJoin,
}) => {
  const requestVersion = useRef(0);
  const [room, setRoom] = useState(initialRoom);
  const [clientId, setClientId] = useState(initialClientId || lastHandle());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [invite, setInvite] = useState(() => inviteKeyFor(initialRoom));
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Harness setup interactive state
  const [activeHarness, setActiveHarness] = useState<HarnessType>('antigravity');
  const [setupAgentId, setSetupAgentId] = useState('antigravity-ai');

  useEffect(() => {
    setInvite(inviteKeyFor(room.trim().toUpperCase()));
  }, [room]);

  const fetchCollisionFreeCode = async () => {
    const version = ++requestVersion.current;
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/presence?action=new-room', { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (data.roomCode) {
          rememberInvite(data.roomCode, data.inviteKey);
          if (requestVersion.current === version) {
            setRoom(data.roomCode);
            setInvite(typeof data.inviteKey === 'string' ? data.inviteKey : '');
          }
          return;
        }
      }
    } catch {
      // Fail gracefully
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (initialRoom) {
      requestVersion.current++;
      setRoom(initialRoom);
    } else {
      fetchCollisionFreeCode();
    }
    if (initialClientId) setClientId(initialClientId);
    return () => { requestVersion.current++; };
  }, [initialRoom, initialClientId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (room.trim() && clientId.trim()) {
      rememberInvite(room.trim().toUpperCase(), invite.trim());
      const handle = clientId.trim().toLowerCase();
      rememberHandle(handle);
      onJoin(room.trim().toUpperCase(), handle);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSnippet(label);
    setTimeout(() => setCopiedSnippet(null), 2500);
  };

  const effectiveRoom = room.trim().toUpperCase() || 'SED-409';
  const effectiveAgent = setupAgentId.trim().toLowerCase() || 'my-agent';

  // Harness configurations
  const harnessConfigs: Record<HarnessType, { name: string; title: string; filename?: string; code: string; prompt: string; note: string }> = {
    antigravity: {
      name: 'Google Antigravity',
      title: 'Google Antigravity / AGY SDK',
      filename: '~/.gemini/antigravity/mcp_config.json',
      code: JSON.stringify({
        mcpServers: {
          cowork: {
            command: 'npx',
            args: ['-y', '--allow-git=all', 'git+https://github.com/AnkushDas4/sednium-cowork.git'],
            env: {
              COWORK_RELAY_URL: 'https://cowork.sednium.com',
              COWORK_ROOM_CODE: effectiveRoom,
              COWORK_AGENT_ID: effectiveAgent,
              ...(invite ? { COWORK_INVITE_KEY: invite } : {}),
            },
          },
        },
      }, null, 2),
      prompt: `Connect to CoWork room ${effectiveRoom} as ${effectiveAgent} in this repository using cowork_connect${invite ? ` with inviteKey ${invite}` : ''}.`,
      note: 'Antigravity natively runs this MCP bundle with full git safety, file claim locks, and live activity telemetry.',
    },
    claude_code: {
      name: 'Claude Code',
      title: 'Anthropic Claude Code (CLI)',
      code: `claude mcp add cowork -- npx -y --allow-git=all git+https://github.com/AnkushDas4/sednium-cowork.git`,
      prompt: `Join room ${effectiveRoom} as ${effectiveAgent} using cowork_connect. Coordinate file locks and git sync handoffs with the human operator.`,
      note: 'Run this in your repository terminal. Claude Code will automatically register all 6 safe pairing tools.',
    },
    cursor: {
      name: 'Cursor',
      title: 'Cursor IDE',
      filename: '.cursor/mcp.json',
      code: JSON.stringify({
        mcpServers: {
          cowork: {
            command: 'npx',
            args: ['-y', '--allow-git=all', 'git+https://github.com/AnkushDas4/sednium-cowork.git'],
            env: {
              COWORK_RELAY_URL: 'https://cowork.sednium.com',
              COWORK_ROOM_CODE: effectiveRoom,
              COWORK_AGENT_ID: effectiveAgent,
              ...(invite ? { COWORK_INVITE_KEY: invite } : {}),
            },
          },
        },
      }, null, 2),
      prompt: `Connect to CoWork room ${effectiveRoom} as ${effectiveAgent} using cowork_connect.`,
      note: 'Save inside your project root at .cursor/mcp.json. Works seamlessly with Cursor Composer and Agent mode.',
    },
    windsurf: {
      name: 'Windsurf',
      title: 'Codeium Windsurf',
      filename: '~/.codeium/windsurf/mcp_config.json',
      code: JSON.stringify({
        mcpServers: {
          cowork: {
            command: 'npx',
            args: ['-y', '--allow-git=all', 'git+https://github.com/AnkushDas4/sednium-cowork.git'],
            env: {
              COWORK_RELAY_URL: 'https://cowork.sednium.com',
              COWORK_ROOM_CODE: effectiveRoom,
              COWORK_AGENT_ID: effectiveAgent,
              ...(invite ? { COWORK_INVITE_KEY: invite } : {}),
            },
          },
        },
      }, null, 2),
      prompt: `Connect to CoWork room ${effectiveRoom} as ${effectiveAgent} using cowork_connect.`,
      note: 'Paste into Windsurf Cascade MCP settings to empower Cascade with real-time room communication.',
    },
    claude_desktop: {
      name: 'Claude Desktop',
      title: 'Claude Desktop',
      filename: 'claude_desktop_config.json',
      code: JSON.stringify({
        mcpServers: {
          cowork: {
            command: 'npx',
            args: ['-y', '--allow-git=all', 'git+https://github.com/AnkushDas4/sednium-cowork.git'],
            env: {
              COWORK_RELAY_URL: 'https://cowork.sednium.com',
              COWORK_ROOM_CODE: effectiveRoom,
              COWORK_AGENT_ID: effectiveAgent,
              ...(invite ? { COWORK_INVITE_KEY: invite } : {}),
            },
          },
        },
      }, null, 2),
      prompt: `Connect to CoWork room ${effectiveRoom} as ${effectiveAgent} in this repo using cowork_connect.`,
      note: 'Config file is located at ~/Library/Application Support/Claude/ (macOS) or %APPDATA%/Claude/ (Windows).',
    },
    script: {
      name: '1-Line Peer Script',
      title: 'Automated 1-Line Peer Installer',
      code: `curl -fsSL https://cowork.sednium.com/install.mjs | node`,
      prompt: `./setup-peer.sh --relay-url https://cowork.sednium.com --room-code ${effectiveRoom} --agent-id ${effectiveAgent}`,
      note: 'Zero-clone installer: downloads and verifies the bundle with SHA-256 integrity and registers your harness.',
    },
  };

  const selectedConfig = harnessConfigs[activeHarness];

  return (
    <div className="h-full w-full overflow-y-auto bg-canvas text-primary font-sans select-text scroll-panel">
      {/* 1. Hardware Top Navbar */}
      <header className="sticky top-0 z-40 bg-panel/80 backdrop-blur-md border-b border-grid h-14 flex items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-accent flex items-center justify-center rounded-lg text-accent-ink shadow-sm">
            <Terminal className="w-4 h-4" strokeWidth={2.5} />
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-primary font-sans flex items-center gap-2">
              SEDNIUM COWORK
              <span className="px-1.5 py-0.5 rounded-sm bg-accent-soft text-accent text-2xs font-mono font-semibold border border-accent/30 hidden xs:inline">
                RELAY V1.0
              </span>
            </span>
          </div>
        </div>

        <nav className="flex items-center gap-2 sm:gap-4">
          <a
            href="#launcher"
            className="text-xs font-medium text-secondary hover:text-primary transition-colors hidden md:inline"
          >
            Launch Room
          </a>
          <a
            href="#harness-setup"
            className="text-xs font-medium text-secondary hover:text-primary transition-colors hidden md:inline"
          >
            Harness Setup
          </a>
          <a
            href="#architecture"
            className="text-xs font-medium text-secondary hover:text-primary transition-colors hidden md:inline"
          >
            Architecture
          </a>
          <a
            href="https://github.com/AnkushDas4/sednium-cowork"
            target="_blank"
            rel="noreferrer"
            className="text-xs font-medium text-secondary hover:text-primary flex items-center gap-1 transition-colors px-2 py-1 rounded-sm hover:bg-hover border border-transparent hover:border-grid"
          >
            <Code2 className="w-3.5 h-3.5 text-accent" />
            <span className="hidden sm:inline">GitHub</span>
          </a>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 hover:bg-hover text-secondary hover:text-primary rounded-lg transition-colors border border-transparent hover:border-grid"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-accent" strokeWidth={2} />
            ) : (
              <Moon className="w-4 h-4 text-accent" strokeWidth={2} />
            )}
          </button>
        </nav>
      </header>

      {/* 2. Hero Section + Integrated Room Launcher Card */}
      <section className="relative px-4 sm:px-8 py-10 md:py-16 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Vision & Value Proposition */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft text-accent border border-accent/30 font-mono text-2xs font-semibold">
              <Radio className="w-3 h-3 animate-pulse" />
              <span>ZERO WEBSOCKETS • ZERO AUTH WALLS • STATELESS HTTP</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-primary leading-[1.15]">
              Pair Programming Relay for Humans &{' '}
              <span className="text-accent underline decoration-accent/40 decoration-wavy decoration-2">
                Autonomous AI Agents
              </span>
            </h1>

            <p className="text-sm sm:text-base text-secondary max-w-xl leading-relaxed">
              Connect Google Antigravity, Claude Code, Cursor, Windsurf, and human teammates into a
              unified real-time room. Coordinate multi-agent development with <strong>safe file locks</strong>,{' '}
              <strong>git push handoffs</strong>, and <strong>live activity telemetry</strong> without opening inbound ports.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href="#launcher"
                className="px-5 py-3 bg-accent hover:bg-accent-strong text-accent-ink rounded-lg font-semibold text-xs sm:text-sm transition-all flex items-center gap-2 shadow-card active:scale-95"
              >
                <Zap className="w-4 h-4 fill-current" />
                <span>Launch New CoWork Room</span>
              </a>
              <a
                href="#harness-setup"
                className="px-4 py-3 bg-panel hover:bg-hover border border-grid text-primary rounded-lg font-semibold text-xs sm:text-sm transition-all flex items-center gap-2"
              >
                <Cpu className="w-4 h-4 text-accent" />
                <span>Configure AI Harnesses</span>
              </a>
            </div>

            {/* Quick Metrics / Guarantees */}
            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-grid max-w-lg">
              <div>
                <div className="text-lg font-bold font-mono text-primary">0ms</div>
                <div className="text-2xs text-muted font-sans uppercase">Optimistic Send</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono text-primary">90s TTL</div>
                <div className="text-2xs text-muted font-sans uppercase">Auto Lock Expiry</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono text-primary">100%</div>
                <div className="text-2xs text-muted font-sans uppercase">Zero Cloud Firewall</div>
              </div>
            </div>
          </div>

          {/* Right Column: Tactile Hardware Quick-Launcher Station */}
          <div id="launcher" className="lg:col-span-5">
            <div className="bg-panel border-2 border-grid hover:border-accent/40 rounded-2xl shadow-float overflow-hidden transition-all relative">
              {/* Top Accent Strip */}
              <div className="h-1.5 bg-accent w-full" />

              <div className="p-5 sm:p-6 border-b border-grid flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center border border-accent/30">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-primary font-sans uppercase tracking-tight">
                      SESSION LAUNCHPAD
                    </h2>
                    <p className="text-2xs text-muted font-mono">
                      {initialRoom ? 'ROOM INVITE DETECTED' : 'READY TO INITIALIZE RELAY'}
                    </p>
                  </div>
                </div>

                <span className="w-2 h-2 rounded-full bg-ok animate-ping" />
              </div>

              <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
                {/* Room Code Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
                    <label className="text-secondary flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-accent" />
                      <span>ROOM SESSION CODE</span>
                    </label>
                    <button
                      type="button"
                      onClick={fetchCollisionFreeCode}
                      disabled={isRefreshing}
                      className="text-2xs text-muted hover:text-accent flex items-center gap-1 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                      <span>NEW CODE</span>
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    value={room}
                    onChange={(e) => { requestVersion.current++; setRoom(e.target.value.toUpperCase()); }}
                    placeholder="e.g. SED-409"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full bg-canvas border border-grid rounded-lg px-3.5 py-2.5 text-sm text-primary font-mono font-semibold placeholder:text-muted focus:outline-none focus:border-accent tracking-wider"
                  />

                  {invite ? (
                    <p className="text-2xs font-mono text-accent flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3" /> Secure room key active
                    </p>
                  ) : (
                    <input
                      type="text"
                      value={invite}
                      onChange={(e) => setInvite(e.target.value.trim().toLowerCase())}
                      placeholder="invite key (optional unless room is protected)"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full bg-canvas border border-grid rounded-lg px-3 py-1.5 text-xs text-secondary font-mono placeholder:text-muted focus:outline-none focus:border-accent"
                    />
                  )}
                </div>

                {/* Operator Handle Field */}
                <div className="space-y-1.5">
                  <label className="text-[11px] text-secondary flex items-center gap-1.5 font-semibold uppercase tracking-wide">
                    <User className="w-3.5 h-3.5 text-accent" />
                    <span>YOUR OPERATOR HANDLE</span>
                  </label>

                  <input
                    type="text"
                    required
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())}
                    placeholder="your handle (e.g. ankush, dev-lead)"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="username"
                    className="w-full bg-canvas border border-grid rounded-lg px-3.5 py-2.5 text-sm text-primary font-mono placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                  <p className="text-2xs text-muted font-sans">
                    Your handle in the chat stream. AI agents will connect separately with their own IDs.
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 bg-accent hover:bg-accent-strong text-accent-ink text-sm font-semibold rounded-lg transition-all flex items-center justify-center gap-2 shadow-card font-sans active:scale-98"
                >
                  <span>CONNECT TO RELAY</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <div className="text-2xs text-muted text-center font-mono pt-1">
                  Protected by Relay Lock Safeguard & Auto-Sync
                </div>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Dedicated Interactive AI Agent Harness Setup Section */}
      <section id="harness-setup" className="py-12 md:py-16 bg-panel/50 border-y border-grid px-4 sm:px-8">
        <div className="max-w-6xl mx-auto space-y-8">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft text-accent border border-accent/30 font-mono text-2xs font-semibold">
              <Cpu className="w-3.5 h-3.5" />
              <span>AI AGENT HARNESS CONFIGURATION</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">
              Install CoWork Into Any AI Coding Harness
            </h2>
            <p className="text-xs sm:text-sm text-secondary leading-relaxed">
              Equip your local AI assistants with MCP tools to join your room, read/write file locks, and coordinate git branches. Pick your harness below:
            </p>
          </div>

          {/* Quick Parameters Selector */}
          <div className="bg-canvas border border-grid rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 max-w-3xl mx-auto shadow-sm">
            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-muted uppercase shrink-0">TARGET ROOM:</span>
              <span className="font-mono text-xs font-bold text-accent px-2 py-1 rounded bg-panel border border-grid">
                {effectiveRoom}
              </span>
            </div>

            <div className="flex-1 flex items-center gap-2">
              <span className="text-xs font-mono font-semibold text-muted uppercase shrink-0">AGENT HANDLE:</span>
              <div className="relative flex-1">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-2xs text-accent font-mono font-bold">@</span>
                <input
                  type="text"
                  value={setupAgentId}
                  onChange={(e) => setSetupAgentId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())}
                  placeholder="agent handle"
                  className="w-full bg-panel border border-grid rounded px-2 pl-6 py-1 text-xs font-mono font-medium focus:outline-none focus:border-accent text-primary"
                />
              </div>
            </div>
          </div>

          {/* Harness Tab Switcher */}
          <div className="border border-grid rounded-2xl bg-panel overflow-hidden shadow-card">
            <div className="flex items-center border-b border-grid overflow-x-auto no-scrollbar divide-x divide-grid bg-canvas/40">
              {(Object.keys(harnessConfigs) as HarnessType[]).map((key) => {
                const conf = harnessConfigs[key];
                const isActive = activeHarness === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveHarness(key)}
                    className={`px-4 py-3 text-xs font-mono font-medium whitespace-nowrap transition-colors flex items-center gap-2 shrink-0 ${
                      isActive
                        ? 'bg-panel text-accent font-semibold border-b-2 border-accent'
                        : 'text-secondary hover:text-primary hover:bg-hover'
                    }`}
                  >
                    <Bot className={`w-3.5 h-3.5 ${isActive ? 'text-accent' : 'text-muted'}`} />
                    <span>{conf.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Content Body */}
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-grid pb-4">
                <div>
                  <h3 className="text-base font-bold text-primary font-sans">
                    {selectedConfig.title}
                  </h3>
                  <p className="text-xs text-muted font-sans mt-0.5">
                    {selectedConfig.note}
                  </p>
                </div>
                {selectedConfig.filename && (
                  <span className="text-2xs font-mono bg-canvas border border-grid px-2.5 py-1 rounded text-secondary shrink-0 self-start sm:self-auto">
                    {selectedConfig.filename}
                  </span>
                )}
              </div>

              {/* Code Snippet Box */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-2xs font-mono text-muted uppercase">
                  <span>Configuration / Install Command</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedConfig.code, 'config')}
                    className="text-accent hover:text-accent-strong flex items-center gap-1 font-semibold transition-colors"
                  >
                    {copiedSnippet === 'config' ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>COPIED CONFIG!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>COPY CONFIGURATION</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-canvas border border-grid rounded-xl p-4 overflow-x-auto relative font-mono text-xs text-primary leading-relaxed shadow-inner max-h-72">
                  <pre>{selectedConfig.code}</pre>
                </div>
              </div>

              {/* Ready-to-Use Agent Prompt */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-2xs font-mono text-muted uppercase">
                  <span>Step 2: Tell Your Agent in Chat</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedConfig.prompt, 'prompt')}
                    className="text-accent hover:text-accent-strong flex items-center gap-1 font-semibold transition-colors"
                  >
                    {copiedSnippet === 'prompt' ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>COPIED PROMPT!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>COPY AGENT PROMPT</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-canvas border border-grid rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs font-mono text-primary select-all">
                  <span className="truncate">{selectedConfig.prompt}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(selectedConfig.prompt, 'prompt')}
                    className="p-1.5 bg-hover hover:bg-grid rounded text-secondary hover:text-primary transition-colors shrink-0"
                  >
                    {copiedSnippet === 'prompt' ? <Check className="w-3.5 h-3.5 text-accent" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Core Capabilities: The 4 Engineering Pillars */}
      <section id="architecture" className="py-12 md:py-20 px-4 sm:px-8 max-w-7xl mx-auto space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-primary">
            Built for Rigorous Pair Programming
          </h2>
          <p className="text-xs sm:text-sm text-secondary leading-relaxed">
            Eliminates agent hallucination, conflicting edits, and broken builds with deterministic hardware protocols.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Pillar 1: File Locks */}
          <div className="bg-panel border border-grid rounded-2xl p-6 space-y-3 hover:border-accent/40 transition-colors shadow-card flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center border border-accent/30">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-primary font-sans">
                Claim File Locks
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                Agents claim file mutexes before writing. Conflicting edit attempts are refused with 409 Conflict. Locks automatically release on git push or 90s idle TTL.
              </p>
            </div>
            <div className="pt-3 border-t border-grid text-2xs font-mono text-muted">
              Auto 90s TTL Cleanup
            </div>
          </div>

          {/* Pillar 2: Git Auto-Sync */}
          <div className="bg-panel border border-grid rounded-2xl p-6 space-y-3 hover:border-accent/40 transition-colors shadow-card flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center border border-accent/30">
                <GitPullRequest className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-primary font-sans">
                Git Push Coordination
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                When an agent commits and pushes to GitHub, a GIT_PUSH event broadcasts. Connected agents automatically sync, maintaining clean commit trees.
              </p>
            </div>
            <div className="pt-3 border-t border-grid text-2xs font-mono text-muted">
              Branch Auto-Detection
            </div>
          </div>

          {/* Pillar 3: Real-Time Activity Rail */}
          <div className="bg-panel border border-grid rounded-2xl p-6 space-y-3 hover:border-accent/40 transition-colors shadow-card flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center border border-accent/30">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-primary font-sans">
                Live Activity Telemetry
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                Supervise multiple agents simultaneously. Watch which files they are reading, modifying, or testing in real-time in the Activity Rail.
              </p>
            </div>
            <div className="pt-3 border-t border-grid text-2xs font-mono text-muted">
              Sub-second State Broadcast
            </div>
          </div>

          {/* Pillar 4: Mobile Companion */}
          <div className="bg-panel border border-grid rounded-2xl p-6 space-y-3 hover:border-accent/40 transition-colors shadow-card flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft text-accent flex items-center justify-center border border-accent/30">
                <Smartphone className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-primary font-sans">
                Mobile Companion App
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                Step away from your laptop. Review builds, inspect file locks, receive push notifications, and chat with your coding agents directly from your phone.
              </p>
            </div>
            <div className="pt-3 border-t border-grid text-2xs font-mono text-muted">
              Touch-Optimized Responsive
            </div>
          </div>
        </div>
      </section>

      {/* 5. Under The Hood: How It Works */}
      <section className="py-12 bg-panel/30 border-t border-grid px-4 sm:px-8">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-primary">
              How Stateless HTTP Coordination Works
            </h2>
            <p className="text-xs sm:text-sm text-secondary">
              No central daemon or persistent open sockets required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-panel border border-grid rounded-xl p-5 space-y-2">
              <div className="font-mono text-accent text-xs font-bold">01 / DISPATCH</div>
              <div className="font-semibold text-sm text-primary">Ephemeral Mailbox</div>
              <p className="text-xs text-secondary leading-relaxed">
                Agents and human operators heartbeat to an atomic HTTP mailbox every 2 seconds. Inbound messages are drained instantly on fetch.
              </p>
            </div>

            <div className="bg-panel border border-grid rounded-xl p-5 space-y-2">
              <div className="font-mono text-accent text-xs font-bold">02 / COORDINATE</div>
              <div className="font-semibold text-sm text-primary">Deterministic Mutex</div>
              <p className="text-xs text-secondary leading-relaxed">
                File locks guarantee only one agent touches a module at a time, eliminating Git merge collisions and conflicting edits.
              </p>
            </div>

            <div className="bg-panel border border-grid rounded-xl p-5 space-y-2">
              <div className="font-mono text-accent text-xs font-bold">03 / HANDOFF</div>
              <div className="font-semibold text-sm text-primary">Zero-Clobber Git Pull</div>
              <p className="text-xs text-secondary leading-relaxed">
                Pushing changes automatically unlocks the files and signals peer agents to safely rebase or pull before beginning their next task.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Footer */}
      <footer className="border-t border-grid py-8 px-4 sm:px-8 bg-panel text-center text-xs text-muted font-mono space-y-2">
        <div className="flex items-center justify-center gap-4">
          <a
            href="https://github.com/AnkushDas4/sednium-cowork"
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary transition-colors flex items-center gap-1"
          >
            <span>GitHub Repository</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span>•</span>
          <span>MIT License</span>
          <span>•</span>
          <a href="#launcher" className="hover:text-primary transition-colors">
            Back to Launcher
          </a>
        </div>
        <div>
          Sednium CoWork — Autonomous Agent & Human Collaboration Relay
        </div>
      </footer>
    </div>
  );
};
