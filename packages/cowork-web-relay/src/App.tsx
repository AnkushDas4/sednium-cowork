import { relayRequest } from './relay.js';
import React, { useState, useEffect } from 'react';
import { RoomHeader } from './components/RoomHeader.js';
import { AgentHUD } from './components/AgentHUD.js';
import { ChatTerminal } from './components/ChatTerminal.js';
import { JoinModal } from './components/JoinModal.js';
import { Bot, Terminal } from 'lucide-react';
import type {
  ParticipantInfo,
  FileLockInfo,
  CommitInfo,
  CoWorkMessage,
  PresenceResponse,
} from '../api/_types.js';

type ThemeMode = 'dark' | 'light';

export const App: React.FC = () => {
  const [roomCode, setRoomCode] = useState<string>(() => new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '');
  const [clientId, setClientId] = useState<string>('');
  const [connectionError, setConnectionError] = useState('');
  const [connected, setConnected] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'stream' | 'agents'>('stream');

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
  const [messages, setMessages] = useState<CoWorkMessage[]>([]);

  // 1. Parse initial room and clientId from URL query params (?room=SED409&as=loid)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const asParam = params.get('as') || params.get('clientId');

      if (roomParam) {
        const cleanRoom = roomParam.toUpperCase();
        setRoomCode(cleanRoom);

        if (asParam) {
          setClientId(asParam.trim().toLowerCase());
          setConnected(true);
        } else {
          setClientId('peer');
          setConnected(false);
        }
      }
    }
  }, []);

  // 2. Continuous 2-second background polling loop
  useEffect(() => {
    if (!connected || !roomCode || !clientId) return;

    let isMounted = true;
    let polling = false;
    let acknowledgements: string[] = [];

    const pollPresence = async () => {
      if (polling) return;
      polling = true;
      try {
        const data: PresenceResponse = await relayRequest('/api/presence', {
          action: 'inbox', roomCode, clientId, role: 'human', status: 'Viewing Dashboard',
          ack: acknowledgements,
        });
        if (!isMounted) return;
        acknowledgements = (data.messages || []).map(m => m.messageId);
        setConnectionError('');

        setParticipants(data.participants || {});
        setFileLocks(data.fileLocks || {});
        setLatestCommit(data.latestCommit || null);

        // Drained new messages
        if (data.messages && data.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.messageId));
            const newOnes = data.messages.filter((m) => !existingIds.has(m.messageId));
            return [...prev, ...newOnes].slice(-500);
          });
        }

        // Merge history on first mount
        if (data.recentHistory && data.recentHistory.length > 0) {
          setMessages((prev) => {
            if (prev.length === 0) return data.recentHistory;
            const existingIds = new Set(prev.map((m) => m.messageId));
            const missing = data.recentHistory.filter((m) => !existingIds.has(m.messageId));
            return [...missing, ...prev].sort((a, b) => a.timestamp - b.timestamp).slice(-500);
          });
        }
      } catch (err) {
        if (isMounted) setConnectionError(err instanceof Error ? err.message : 'Relay unavailable');
      } finally { polling = false; }
    };

    pollPresence();
    const interval = setInterval(pollPresence, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [connected, roomCode, clientId]);

  const handleJoin = (joinedRoom: string, joinedId: string) => {
    setMessages([]); setParticipants({}); setFileLocks({}); setLatestCommit(null);
    setConnectionError('');
    setRoomCode(joinedRoom);
    setClientId(joinedId);
    setConnected(true);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('room', joinedRoom);
      url.searchParams.set('as', joinedId);
      window.history.pushState({}, '', url.toString());
    }
  };

  const handleLeave = () => {
    setConnected(false);
    setRoomCode('');
    setMessages([]);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      url.searchParams.delete('as');
      window.history.pushState({}, '', url.toString());
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!roomCode || !clientId) return;

    await relayRequest('/api/send', {
      roomCode, senderId: clientId, targetId: 'all', contentType: 'CHAT', text,
    });
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-canvas text-primary overflow-hidden font-sans select-text">
      {!connected ? (
        <JoinModal
          initialRoom={roomCode}
          initialClientId={clientId || 'peer'}
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
            participants={participants}
            theme={theme}
            onToggleTheme={toggleTheme}
            onLeave={handleLeave}
            onNewRoom={(newCode) => handleJoin(newCode, clientId)}
          />

          {connectionError && <div role="alert" className="p-2 text-sm text-red-500 bg-panel">Relay disconnected: {connectionError}</div>}
          {/* Mobile Tab Switcher */}
          <div className="md:hidden flex items-stretch border-b border-grid bg-panel h-9 text-xs font-mono divide-x divide-grid shrink-0">
            <button
              onClick={() => setMobileTab('stream')}
              className={`flex-1 flex items-center justify-center gap-1.5 ${
                mobileTab === 'stream'
                  ? 'bg-canvas text-[#FF6B00] font-bold'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>DISPATCH STREAM</span>
            </button>
            <button
              onClick={() => setMobileTab('agents')}
              className={`flex-1 flex items-center justify-center gap-1.5 ${
                mobileTab === 'agents'
                  ? 'bg-canvas text-[#FF6B00] font-bold'
                  : 'text-muted hover:text-secondary'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AGENT NODES & LOCKS</span>
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
                onSendMessage={handleSendMessage}
              />
            </section>
          </main>
        </>
      )}
    </div>
  );
};

export default App;
