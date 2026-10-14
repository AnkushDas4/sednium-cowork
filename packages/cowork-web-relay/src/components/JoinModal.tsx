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
} from 'lucide-react';

interface JoinModalProps {
  initialRoom?: string;
  initialClientId?: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onJoin: (roomCode: string, clientId: string) => void;
}

export const JoinModal: React.FC<JoinModalProps> = ({
  initialRoom = '',
  initialClientId = 'peer',
  theme,
  onToggleTheme,
  onJoin,
}) => {
  const requestVersion = useRef(0);
  const [room, setRoom] = useState(initialRoom);
  const [clientId, setClientId] = useState(initialClientId);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCollisionFreeCode = async () => {
    const version = ++requestVersion.current;
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/presence?action=new-room', { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        if (data.roomCode) {
          if (requestVersion.current === version) setRoom(data.roomCode);
          return;
        }
      }
    } catch {
      // Show a failure rather than claiming an unreserved room was created.
    } finally {
      setIsRefreshing(false);
    }

    if (requestVersion.current === version) alert('Cannot create room: relay unavailable. Please retry.');
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
      onJoin(room.trim().toUpperCase(), clientId.trim().toLowerCase());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 select-none">
      <div className="w-full max-w-md bg-panel border border-grid rounded-sm shadow-2xl overflow-hidden relative">
        {/* Hardware Top Accent Bar in Safety Orange */}
        <div className="h-1 bg-[#FF6B00] w-full" />

        {/* Modal Header */}
        <div className="p-4 border-b border-grid flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-[#FF6B00] flex items-center justify-center rounded-sm text-white">
              <Terminal className="w-3.5 h-3.5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-bold text-xs uppercase tracking-tight text-primary font-sans">
                SEDNIUM COWORK
              </div>
              <div className="text-[10px] text-muted font-mono">
                PAIR PROGRAMMING RELAY
              </div>
            </div>
          </div>

          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-1.5 hover:bg-hover text-secondary hover:text-primary rounded-sm transition-colors border border-transparent hover:border-grid"
            title={`Switch to ${theme === 'dark' ? 'Milk White (Light)' : 'Charcoal Black (Dark)'} mode`}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-[#FF6B00]" strokeWidth={2} />
            ) : (
              <Moon className="w-4 h-4 text-[#FF6B00]" strokeWidth={2} />
            )}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Room Code */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <label className="text-secondary flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-[#FF6B00]" />
                <span>ROOM SESSION CODE</span>
              </label>
              <button
                type="button"
                onClick={fetchCollisionFreeCode}
                disabled={isRefreshing}
                className="text-[10px] text-muted hover:text-[#FF6B00] flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span>NEW CODE</span>
              </button>
            </div>

            <input
              type="text"
              required
              value={room}
              onChange={(e) => { requestVersion.current++; setRoom(e.target.value.toUpperCase()); }}
              placeholder="e.g. SED-409"
              className="w-full bg-canvas border border-grid rounded-sm px-3 py-2 text-sm text-primary font-mono font-semibold placeholder:text-muted focus:outline-none focus:border-[#FF6B00] tracking-wider"
            />
          </div>

          {/* Operator Handle */}
          <div className="space-y-1.5">
            <label className="text-xs text-secondary flex items-center gap-1.5 font-mono">
              <User className="w-3.5 h-3.5 text-[#FF6B00]" />
              <span>YOUR OPERATOR HANDLE</span>
            </label>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setClientId('loid')}
                className={`py-1.5 px-3 rounded-sm text-xs font-mono border transition-colors ${
                  clientId === 'loid'
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00] font-semibold'
                    : 'bg-canvas hover:bg-hover text-secondary border-grid'
                }`}
              >
                @loid (Host)
              </button>
              <button
                type="button"
                onClick={() => setClientId('peer')}
                className={`py-1.5 px-3 rounded-sm text-xs font-mono border transition-colors ${
                  clientId === 'peer'
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00] font-semibold'
                    : 'bg-canvas hover:bg-hover text-secondary border-grid'
                }`}
              >
                @peer (Collaborator)
              </button>
            </div>

            <input
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value.toLowerCase())}
              placeholder="operator handle"
              className="w-full bg-canvas border border-grid rounded-sm px-3 py-2 text-xs text-primary font-mono placeholder:text-muted focus:outline-none focus:border-[#FF6B00]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[#FF6B00] hover:bg-[#E66000] text-white text-xs font-semibold rounded-sm transition-colors flex items-center justify-center gap-2 shadow-sm font-sans tracking-wide"
          >
            <span>CONNECT TO RELAY</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="text-[10px] text-muted text-center font-mono pt-1">
            Zero WebSockets • Zero Login Walls • Stateless HTTP Mailbox
          </div>
        </form>
      </div>
    </div>
  );
};
