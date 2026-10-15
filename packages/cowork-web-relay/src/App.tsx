import { relayRequest, captureInviteFromUrl, inviteKeyFor, lastHandle } from './relay.js';
import { parseRepoUrl } from '../api/_repo.js';
import React, { useState, useEffect, useRef } from 'react';
import { RoomHeader } from './components/RoomHeader.js';
import { AgentHUD } from './components/AgentHUD.js';
import { ChatTerminal } from './components/ChatTerminal.js';
import { JoinModal } from './components/JoinModal.js';
import { Bot, Terminal } from 'lucide-react';
import { ToastStack } from './components/ToastStack.js';
import { useNotificationCenter } from './useNotificationCenter.js';
import { mentionCount } from './notifications.js';
import type {
  ParticipantInfo,
  FileLockInfo,
  CommitInfo,
  CoWorkMessage,
  GitRepoBinding,
  PresenceResponse,
} from '../api/_types.js';

type ThemeMode = 'dark' | 'light';

export const App: React.FC = () => {
  const [roomCode, setRoomCode] = useState<string>(() => captureInviteFromUrl().roomCode || '');
  const [clientId, setClientId] = useState<string>('');
  const [connectionError, setConnectionError] = useState('');
  const [inviteNotice, setInviteNotice] = useState('');
  const [connected, setConnected] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'stream' | 'agents'>('stream');
  const [prefilledMessage, setPrefilledMessage] = useState<string>('');
  // Notification state for this room. Derived from the poll below - there is no second channel.
  const center = useNotificationCenter(roomCode, clientId);
  const [focusMessageId, setFocusMessageId] = useState('');

  // Theme Management
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cowork-theme') as ThemeMode | null;
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.setItem('cowork-theme', theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [participants, setParticipants] = useState<Record<string, ParticipantInfo>>({});
  const [fileLocks, setFileLocks] = useState<Record<string, FileLockInfo>>({});
  const [latestCommit, setLatestCommit] = useState<CommitInfo | null>(null);
  /** The repository this room works in. Null until a human links one or the first push decides it. */
  const [gitRepo, setGitRepo] = useState<GitRepoBinding | null>(null);
  const [messages, setMessages] = useState<CoWorkMessage[]>([]);
  const pollTriggerRef = useRef<(() => void) | null>(null);

  // 1. Adopt an invite link: ?room=<code>#k=<invite key>. The key never leaves the fragment.
  useEffect(() => {
    const { roomCode: linkedRoom, inviteKey, hadInvite } = captureInviteFromUrl();
    if (!linkedRoom) return;
    setRoomCode(linkedRoom);
    if (hadInvite) setInviteNotice('Invite key loaded from this link - this room is protected.');
    const params = new URLSearchParams(window.location.search);
    const asParam = params.get('as') || params.get('clientId');
    if (asParam) {
      setClientId(asParam.trim().toLowerCase());
      setConnected(true);
    } else {
      // Ask for a handle instead of silently assuming a canned identity.
      setClientId(lastHandle());
    }
  }, []);

  // 2. Chained background polling loop (non-overlapping, 2s rest after completion)
  useEffect(() => {
    if (!connected || !roomCode || !clientId) return;

    let isMounted = true;
    let polling = false;
    let acknowledgements: string[] = [];
    let failCount = 0;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (delay = 2000) => {
      if (!isMounted) return;
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(pollPresence, delay);
    };

    const pollPresence = async () => {
      if (polling) return;
      polling = true;
      try {
        const data: PresenceResponse = await relayRequest('/api/presence', {
          action: 'inbox', roomCode, clientId, role: 'human', status: 'Viewing Dashboard',
          ack: acknowledgements,
        }, roomCode);
        if (!isMounted) return;
        failCount = 0;
        acknowledgements = (data.messages || []).map(m => m.messageId);
        setConnectionError('');
        setInviteNotice('');

        setParticipants(data.participants || {});
        setFileLocks(data.fileLocks || {});
        setLatestCommit(data.latestCommit || null);
        setGitRepo(data.gitRepo ?? null);

        // Only the messages drained by this beat: recentHistory is replayed on mount and must never
        // turn into a wall of alerts about what happened before this tab existed.
        center.ingest({
          clientId,
          incoming: data.messages || [],
          participants: data.participants || {},
          latestCommit: data.latestCommit || null,
          now: Date.now(),
        });

        // Drained new messages with array identity preservation
        if (data.messages && data.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.messageId));
            const newOnes = data.messages.filter((m) => !existingIds.has(m.messageId));
            if (newOnes.length === 0) return prev;
            return [...prev, ...newOnes].slice(-500);
          });
        }

        // Merge history on mount with array identity preservation
        if (data.recentHistory && data.recentHistory.length > 0) {
          setMessages((prev) => {
            if (prev.length === 0) return data.recentHistory;
            const existingIds = new Set(prev.map((m) => m.messageId));
            const missing = data.recentHistory.filter((m) => !existingIds.has(m.messageId));
            if (missing.length === 0) return prev;
            return [...missing, ...prev].sort((a, b) => a.timestamp - b.timestamp).slice(-500);
          });
        }
      } catch (err) {
        failCount++;
        // Only show disconnected error after 3 consecutive failures to ignore transient cold-starts
        if (isMounted && failCount >= 3) {
          setConnectionError(err instanceof Error ? err.message : 'Relay unavailable');
        }
      } finally {
        polling = false;
        if (isMounted) {
          scheduleNext(2000);
        }
      }
    };

    pollTriggerRef.current = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollPresence();
    };

    pollPresence();

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [connected, roomCode, clientId, center.ingest]);

  // A system notification clicked outside the tab arrives through the worker as a message.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; data?: { messageId?: string } } | undefined;
      if (payload?.type !== 'cowork:notification-click') return;
      const messageId = payload.data?.messageId;
      if (messageId) setFocusMessageId(messageId);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const handleJoin = (joinedRoom: string, joinedId: string) => {
    setMessages([]); setParticipants({}); setFileLocks({}); setLatestCommit(null); setGitRepo(null);
    setConnectionError(''); setInviteNotice('');
    setRoomCode(joinedRoom);
    setClientId(joinedId);
    setConnected(true);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('room', joinedRoom);
      url.searchParams.set('as', joinedId);
      const key = inviteKeyFor(joinedRoom);
      if (key) url.hash = `k=${key}`; else url.hash = '';
      window.history.pushState({}, '', url.toString());
    }
  };

  const handleLeave = () => {
    setConnected(false);
    setRoomCode('');
    setMessages([]);
    setGitRepo(null);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      url.searchParams.delete('as');
      window.history.pushState({}, '', url.toString());
    }
  };

  /**
   * Links the room's repository. A refusal comes back as text instead of throwing, because "this room
   * is already bound to X" is something the human should read where they typed it.
   */
  const handleLinkRepo = async (repo: string): Promise<string | void> => {
    if (!roomCode || !clientId) return 'Join a room first.';
    const parsed = parseRepoUrl(repo);
    if (!parsed) return 'That is not a repository. Use owner/repo or a full URL.';
    try {
      const res = await relayRequest<{ ok: boolean; gitRepo?: GitRepoBinding | null }>('/api/send', {
        roomCode, senderId: clientId, targetId: 'all', contentType: 'GIT_REPO', text: parsed.url,
      }, roomCode);
      if (res.gitRepo !== undefined) setGitRepo(res.gitRepo ?? null);
      setTimeout(() => pollTriggerRef.current?.(), 150);
      return;
    } catch (err) {
      return err instanceof Error ? err.message : 'The relay refused that repository.';
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!roomCode || !clientId) return;

    // Parse all mentions in the outgoing message
    const allMentions = [...new Set([...text.matchAll(/@([a-zA-Z0-9_-]+)/g)].map(m => m[1]))];
    const isDirected = allMentions.length > 0;
    const tempId = `msg_opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const optimisticMsg: CoWorkMessage = {
      messageId: tempId,
      timestamp: Date.now(),
      roomCode,
      senderId: clientId,
      targetId: isDirected ? (allMentions.length === 1 ? allMentions[0] : 'all') : 'all',
      contentType: isDirected ? 'CROSS_PROMPT' : 'CHAT',
      text,
      mentions: allMentions.length > 0 ? allMentions : undefined,
      priority: isDirected ? 'HIGH' : 'NORMAL',
    };

    // 0ms perceived latency: immediately append to local chat stream
    setMessages((prev) => [...prev, optimisticMsg].slice(-500));

    try {
      const res = await relayRequest<{ ok: boolean; messageId?: string }>('/api/send', {
        roomCode, senderId: clientId, targetId: 'all', contentType: 'CHAT', text,
      }, roomCode);

      if (res && res.messageId) {
        setMessages((prev) =>
          prev.map((m) => (m.messageId === tempId ? { ...m, messageId: res.messageId! } : m))
        );
      }
      // Instant drain trigger for rapid replies
      setTimeout(() => {
        pollTriggerRef.current?.();
      }, 250);
    } catch (err) {
      console.error('[Send Error]', err);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-canvas text-primary overflow-hidden font-sans select-text">
      {!connected ? (
        <JoinModal
          initialRoom={roomCode}
          initialClientId={clientId}
          theme={theme}
          onToggleTheme={toggleTheme}
          onJoin={handleJoin}
        />
      ) : (
        <>
          {/* Top Hardware Telemetry Bar */}
          <RoomHeader
            roomCode={roomCode}
            clientId={clientId}
            latestCommit={latestCommit}
            gitRepo={gitRepo}
            participants={participants}
            theme={theme}
            center={center}
            onToggleTheme={toggleTheme}
            onLeave={handleLeave}
            onNewRoom={(newCode) => handleJoin(newCode, clientId)}
          />

          <ToastStack
            toasts={center.toasts}
            onDismiss={center.dismissToast}
            onOpen={center.openPanel}
          />

          {connectionError && (
            <div role="alert" className="mx-3 mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
              Relay disconnected: {connectionError}
            </div>
          )}
          {inviteNotice && !connectionError && (
            <div className="mx-3 mt-3 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
              {inviteNotice}
            </div>
          )}
          {/* Mobile Tab Switcher */}
          <div className="md:hidden flex items-stretch border-b border-grid bg-panel h-11 text-xs font-mono divide-x divide-grid shrink-0 select-none">
            <button
              onClick={() => setMobileTab('stream')}
              aria-pressed={mobileTab === 'stream'}
              className={`flex-1 flex items-center justify-center gap-2 transition-colors ${
                mobileTab === 'stream'
                  ? 'bg-canvas text-accent font-semibold border-b-2 border-accent'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>STREAM</span>
              {mentionCount(messages, clientId) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-2xs bg-accent text-accent-ink font-bold">
                  {mentionCount(messages, clientId)}
                </span>
              )}
            </button>
            <button
              onClick={() => setMobileTab('agents')}
              aria-pressed={mobileTab === 'agents'}
              className={`flex-1 flex items-center justify-center gap-2 transition-colors ${
                mobileTab === 'agents'
                  ? 'bg-canvas text-accent font-semibold border-b-2 border-accent'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AGENTS & LOCKS</span>
              {Object.values(participants).filter(
                (p) => p.role === 'agent' && Date.now() - (p.lastSeen || 0) < 90000
              ).length > 0 ? (
                <span className="flex items-center gap-1 text-2xs font-mono text-ok font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                  {
                    Object.values(participants).filter(
                      (p) => p.role === 'agent' && Date.now() - (p.lastSeen || 0) < 90000
                    ).length
                  }
                </span>
              ) : (
                <span className="text-2xs text-muted font-mono">0</span>
              )}
            </button>
          </div>

          {/* Main Full-Viewport Structural Split Workspace */}
          <main className="flex-1 min-h-0 flex overflow-hidden">
            {/* Desktop Left: AgentHUD (4 Cols) */}
            <section
              className={`w-full md:w-[380px] lg:w-[420px] shrink-0 border-r border-grid flex flex-col h-full overflow-hidden ${
                mobileTab === 'agents' ? 'flex' : 'hidden md:flex'
              }`}
            >
              <AgentHUD
                participants={participants}
                fileLocks={fileLocks}
                roomCode={roomCode}
                gitRepo={gitRepo}
                onLinkRepo={handleLinkRepo}
                onDirectMessage={(agentId) => {
                  setPrefilledMessage(`@${agentId} `);
                  setMobileTab('stream');
                }}
              />
            </section>

            {/* Desktop Right: ChatTerminal (8 Cols / flex-1) */}
            <section
              className={`flex-1 min-w-0 flex flex-col h-full overflow-hidden ${
                mobileTab === 'stream' ? 'flex' : 'hidden md:flex'
              }`}
            >
              <ChatTerminal
                key={roomCode}
                participants={participants}
                messages={messages}
                currentClientId={clientId}
                roomCode={roomCode}
                repoUrl={gitRepo?.url}
                onSendMessage={handleSendMessage}
                prefilledInput={prefilledMessage}
                onClearPrefill={() => setPrefilledMessage('')}
                focusMessageId={focusMessageId}
                onFocusHandled={() => setFocusMessageId('')}
              />
            </section>
          </main>
        </>
      )}
    </div>
  );
};

export default App;
