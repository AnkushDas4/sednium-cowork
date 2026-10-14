import React, { useState, useEffect, useRef } from 'react';
import { RoomHeader } from './components/RoomHeader.js';
import { AgentHUD } from './components/AgentHUD.js';
import { ChatTerminal } from './components/ChatTerminal.js';
import { JoinModal } from './components/JoinModal.js';
import type { RoomState, CoWorkMessage, ParticipantInfo, FileLockInfo, CommitInfo, PresenceResponse } from '../api/_types.js';

export const App: React.FC = () => {
  const [roomCode, setRoomCode] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [connected, setConnected] = useState<boolean>(false);

  const [participants, setParticipants] = useState<Record<string, ParticipantInfo>>({});
  const [fileLocks, setFileLocks] = useState<Record<string, FileLockInfo>>({});
  const [latestCommit, setLatestCommit] = useState<CommitInfo | null>(null);
  const [messages, setMessages] = useState<CoWorkMessage[]>([]);

  // 1. Parse initial room and clientId from query params (?room=SED409&as=loid)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const asParam = params.get('as') || params.get('clientId');

      if (roomParam) {
        const cleanRoom = roomParam.toUpperCase();
        setRoomCode(cleanRoom);

        if (asParam) {
          // Only auto-connect if user handle is explicitly specified in the URL
          setClientId(asParam.trim().toLowerCase());
          setConnected(true);
        } else {
          // Room was shared via invite link: Prompt peer to enter their name!
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

    const pollPresence = async () => {
      try {
        const query = new URLSearchParams({
          action: 'inbox',
          roomCode,
          clientId,
          role: 'human',
          status: 'Viewing Dashboard',
        });

        const res = await fetch(`/api/presence?${query.toString()}`);
        if (!res.ok) return;

        const data: PresenceResponse = await res.json();
        if (!isMounted) return;

        setParticipants(data.participants || {});
        setFileLocks(data.fileLocks || {});
        setLatestCommit(data.latestCommit || null);

        // If we have drained new messages, append them to local log
        if (data.messages && data.messages.length > 0) {
          setMessages((prev) => {
            const existingIds = new Set(prev.map((m) => m.messageId));
            const newOnes = data.messages.filter((m) => !existingIds.has(m.messageId));
            return [...prev, ...newOnes];
          });
        }

        // Also merge any history items on first load if messages are empty
        if (data.recentHistory && data.recentHistory.length > 0) {
          setMessages((prev) => {
            if (prev.length === 0) return data.recentHistory;
            const existingIds = new Set(prev.map((m) => m.messageId));
            const missing = data.recentHistory.filter((m) => !existingIds.has(m.messageId));
            return [...missing, ...prev].sort((a, b) => a.timestamp - b.timestamp);
          });
        }
      } catch (err) {
        console.warn('[Presence Poll Failed]', err);
      }
    };

    // Immediate initial poll, then 2000ms loop
    pollPresence();
    const interval = setInterval(pollPresence, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [connected, roomCode, clientId]);

  const handleJoin = (joinedRoom: string, joinedId: string) => {
    setRoomCode(joinedRoom);
    setClientId(joinedId);
    setConnected(true);

    // Sync to URL
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

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomCode,
          senderId: clientId,
          targetId: 'all',
          contentType: 'CHAT',
          text,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(`Failed to send: ${errorData.error || res.statusText}`);
      }
    } catch (err: any) {
      alert(`Send error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-bg flex flex-col text-zinc-100">
      {!connected ? (
        <JoinModal
          initialRoom={roomCode || 'SED-409'}
          initialClientId={clientId || 'loid'}
          onJoin={handleJoin}
        />
      ) : (
        <>
          <RoomHeader
            roomCode={roomCode}
            clientId={clientId}
            latestCommit={latestCommit}
            participants={participants}
            onLeave={handleLeave}
          />

          <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
            {/* Split Screen Agent HUD */}
            <section>
              <AgentHUD participants={participants} fileLocks={fileLocks} />
            </section>

            {/* Interactive @ Command & Chat Terminal */}
            <section>
              <ChatTerminal
                messages={messages}
                currentClientId={clientId}
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
