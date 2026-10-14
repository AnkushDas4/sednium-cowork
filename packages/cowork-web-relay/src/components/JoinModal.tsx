import React, { useState, useEffect, useRef } from 'react';
import { rememberInvite, inviteKeyFor, lastHandle, rememberHandle } from '../relay.js';
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
  initialClientId = '',
  theme,
  onToggleTheme,
  onJoin,
}) => {
  const requestVersion = useRef(0);
  const [room, setRoom] = useState(initialRoom);
  // No preset identities: whatever this person typed last, otherwise an empty field that
  // explains the role in the placeholder.
  const [clientId, setClientId] = useState(initialClientId || lastHandle());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [invite, setInvite] = useState(() => inviteKeyFor(initialRoom));

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
          // A freshly minted room carries its invite key once, here. It is kept in localStorage
          // and embedded in the invite link/QR; the server only ever stores its hash.
          rememberInvite(data.roomCode, data.inviteKey);
          if (requestVersion.current === version) {
            setRoom(data.roomCode);
            setInvite(typeof data.inviteKey === 'string' ? data.inviteKey : '');
          }
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
      rememberInvite(room.trim().toUpperCase(), invite.trim()); // no-op unless the key is well-formed
      const handle = clientId.trim().toLowerCase();
      rememberHandle(handle);
      onJoin(room.trim().toUpperCase(), handle);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4 select-none">
      <div className="w-full sm:max-w-md bg-panel border border-grid rounded-t-2xl sm:rounded-2xl shadow-float max-h-[94dvh] overflow-y-auto scroll-panel relative">
        {/* Hardware Top Accent Bar in Safety Orange */}
        <div className="h-1 bg-accent w-full opacity-90" />

        {/* Modal Header */}
        <div className="p-4 border-b border-grid flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 bg-accent flex items-center justify-center rounded-lg text-accent-ink">
              <Terminal className="w-3.5 h-3.5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-semibold text-xs uppercase tracking-tight text-primary font-sans">
                SEDNIUM COWORK
              </div>
              <div className="text-2xs text-muted font-mono">
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
              <Sun className="w-4 h-4 text-accent" strokeWidth={2} />
            ) : (
              <Moon className="w-4 h-4 text-accent" strokeWidth={2} />
            )}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4">
          {/* Room Code */}
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
                className="min-h-[36px] -my-1.5 px-2 -ml-2 rounded-lg text-2xs text-muted hover:text-accent flex items-center gap-1 transition-colors disabled:opacity-50"
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
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-canvas border border-grid rounded-lg px-3 py-2.5 min-h-[44px] text-[16px] sm:text-sm text-primary font-mono font-semibold placeholder:text-muted focus:outline-none focus:border-accent tracking-wider"
            />

            {invite ? (
              <p className="text-[11px] font-mono text-accent flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" /> Invite key stored - link and QR will carry it
              </p>
            ) : (
              <input
                type="text"
                value={invite}
                onChange={(e) => setInvite(e.target.value.trim().toLowerCase())}
                placeholder="invite key (only if the room requires one)"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-canvas border border-grid rounded-lg px-3 py-2 min-h-[44px] text-[16px] sm:text-xs text-secondary font-mono placeholder:text-muted focus:outline-none focus:border-accent"
              />
            )}
          </div>

          {/* Operator Handle */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-secondary flex items-center gap-1.5 font-semibold uppercase tracking-wide">
              <User className="w-3.5 h-3.5 text-accent" />
              <span>YOUR OPERATOR HANDLE</span>
            </label>

            <p className="text-[11px] font-mono text-muted mb-2">
              This device joins as the room's host operator. Agents connect separately with their
              own handle, so keep yours unique in this room.
            </p>

            <input
              type="text"
              required
              value={clientId}
              autoFocus={!clientId}
              onChange={(e) => setClientId(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase())}
              placeholder="host - your handle (e.g. android-lab)"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              className="w-full bg-canvas border border-grid rounded-lg px-3 py-2.5 min-h-[44px] text-[16px] sm:text-sm text-primary font-mono placeholder:text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] bg-accent hover:bg-accent-strong text-accent-ink text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-card font-sans tracking-wide"
          >
            <span>CONNECT TO RELAY</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="text-2xs text-muted text-center font-mono pt-1">
            Zero WebSockets • Zero Login Walls • Stateless HTTP Mailbox
          </div>
        </form>
      </div>
    </div>
  );
};
