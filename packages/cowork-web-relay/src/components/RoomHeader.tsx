import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Terminal,
  Hash,
  Copy,
  Check,
  QrCode,
  GitBranch,
  GitCommit,
  User,
  Activity,
  Sun,
  Moon,
  LogOut,
  Sparkles,
  X,
  Bot,
  Users,
} from 'lucide-react';
import type { CommitInfo, ParticipantInfo } from '../../api/_types.js';
import { inviteKeyFor, inviteLink, rememberInvite } from '../relay.js';

interface RoomHeaderProps {
  roomCode: string;
  clientId: string;
  latestCommit: CommitInfo | null;
  participants: Record<string, ParticipantInfo>;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLeave: () => void;
  onNewRoom?: (newRoom: string) => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomCode,
  clientId,
  latestCommit,
  participants,
  theme,
  onToggleTheme,
  onLeave,
  onNewRoom,
}) => {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleCreateNewRoom = async () => {
    if (isGenerating || !onNewRoom) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/presence?action=new-room', { signal: AbortSignal.timeout(10000) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Unable to create room');
      if (data.roomCode) {
        rememberInvite(data.roomCode, data.inviteKey);
        onNewRoom(data.roomCode);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to create room');
    } finally {
      setIsGenerating(false);
    }
  };

  // The code identifies the room, the fragment carries its invite key (never sent to servers).
  const shareUrl = inviteLink(roomCode);
  const hasInviteKey = Boolean(inviteKeyFor(roomCode));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { alert('Clipboard unavailable. Copy the link shown in the QR dialog.'); }
  };

  const participantEntries = Object.entries(participants);
  const isOnline = (lastSeen?: number) => {
    if (!lastSeen) return false;
    return (Date.now() - lastSeen) < 90000;
  };

  return (
    <header className="min-h-14 pt-safe border-b border-grid bg-panel/85 backdrop-blur-md flex items-stretch divide-x divide-grid select-none text-xs sticky top-0 z-40">
      {/* 1. Brand Cell */}
      <div className="hidden md:flex items-center gap-3 px-4 md:px-5 shrink-0">
        <div className="w-7 h-7 bg-accent flex items-center justify-center rounded-lg shrink-0 shadow-card">
          <Terminal className="w-4 h-4 text-accent-ink" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold tracking-tight text-primary text-xs md:text-sm uppercase font-sans">
            SEDNIUM COWORK
          </span>
          <span className="text-2xs text-muted tracking-wider font-mono uppercase">
            RELAY HUD v1.0
          </span>
        </div>
      </div>

      {/* 2. Room Session Cell */}
      <div className="flex items-center gap-2 px-3 xs:px-4 flex-1 min-w-0 sm:flex-none">
        <div className="flex items-center gap-1.5 font-mono min-w-0">
          <Hash className="w-4 h-4 text-accent" strokeWidth={2.5} />
          <span title={roomCode} className="font-semibold text-primary text-sm xs:text-[15px] tracking-tight truncate min-w-0">{roomCode}</span>
        </div>

        <div className="flex items-center gap-1.5 ml-1 shrink-0">
          <button
            onClick={handleCopy}
            className="min-tap justify-center px-0 sm:px-2.5 py-1.5 flex items-center gap-1.5 bg-hover hover:bg-hover/80 text-primary rounded-sm transition-colors border border-grid text-xs font-sans font-medium"
            title="Copy invite link"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-accent" strokeWidth={2.5} />
            ) : (
              <Copy className="w-3.5 h-3.5 text-accent" />
            )}
            <span className="hidden sm:inline">{copied ? 'Copied!' : hasInviteKey ? 'Copy Link + Key' : 'Copy Link'}</span>
          </button>

          <button
            onClick={() => setShowQr(true)}
            className="min-tap justify-center px-0 sm:px-2.5 py-1.5 flex items-center gap-1.5 bg-hover hover:bg-hover/80 text-primary rounded-sm transition-colors border border-grid text-xs font-sans font-medium"
            title="Show mobile QR code"
          >
            <QrCode className="w-3.5 h-3.5 text-secondary" />
            <span className="hidden sm:inline">QR Code</span>
          </button>

          {onNewRoom && (
            <button
              onClick={handleCreateNewRoom}
              disabled={isGenerating}
              className="min-tap justify-center px-0 sm:px-2.5 py-1.5 flex items-center gap-1.5 bg-hover hover:bg-hover/80 text-secondary hover:text-primary rounded-sm border border-grid transition-colors text-xs font-sans font-medium disabled:opacity-50"
              title="Generate a new collision-free room code"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="hidden md:inline">New Room</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Git Main Status Cell */}
      <div className="hidden lg:flex flex-1 items-center px-4 gap-2.5 overflow-hidden">
        <div className="flex items-center gap-1 text-accent shrink-0 font-mono text-xs">
          <GitBranch className="w-4 h-4" strokeWidth={2.2} />
          <span className="font-semibold">Git</span>
        </div>
        <span className="text-muted text-xs">/</span>
        {latestCommit ? (
          <div className="flex items-center gap-2 overflow-hidden truncate">
            <span className="font-mono text-primary bg-hover px-2 py-0.5 rounded-sm text-xs border border-grid shrink-0 font-medium">
              {latestCommit.hash.slice(0, 7)}
            </span>
            <span className="text-secondary truncate text-xs font-sans font-medium">
              {latestCommit.message}
            </span>
            <span className="text-muted text-xs shrink-0 font-mono">
              @{latestCommit.author}
            </span>
          </div>
        ) : (
          <span className="text-muted text-xs truncate font-sans">
            Waiting for first git push...
          </span>
        )}
      </div>

      {/* 4. Active Room Roster & Theme Switcher Cell */}
      <div className="flex items-center gap-2.5 px-4 shrink-0 ml-auto lg:ml-0">
        {/* Active Participant Roster */}
        <div className="hidden sm:flex items-center gap-1.5 py-1 px-2.5 bg-hover/80 rounded-sm border border-grid">
          <Users className="w-3.5 h-3.5 text-muted shrink-0" />
          <div className="flex items-center gap-2 text-xs font-mono">
            {participantEntries.length === 0 ? (
              <span className="text-muted text-[11px]">1 in room</span>
            ) : (
              participantEntries.slice(0, 3).map(([pId, p]) => (
                <div key={pId} className="flex items-center gap-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOnline(p.lastSeen) ? 'bg-ok' : 'bg-muted'
                    }`}
                  />
                  <span
                    className={`text-[11px] font-medium ${
                      pId === clientId ? 'text-accent font-semibold' : 'text-primary'
                    }`}
                  >
                    @{pId}
                  </span>
                </div>
              ))
            )}
            {participantEntries.length > 3 && (
              <span className="text-muted text-2xs">+{participantEntries.length - 3}</span>
            )}
          </div>
        </div>

        {/* Compact roster for narrow screens: presence dots; handles live in the roster panel */}
        <div
          className="flex xs:hidden items-center gap-1 px-1"
          title="People in this room (green = seen in the last 90s)"
        >
          {participantEntries.slice(0, 4).map(([pId, p]) => (
            <span
              key={pId}
              className={`w-2 h-2 rounded-full ${isOnline(p.lastSeen) ? 'bg-ok' : 'bg-muted'}`}
            />
          ))}
        </div>

        {/* Live sync pulse */}
        <div className="flex items-center gap-1 text-muted pl-1" title="Active 2s heartbeat">
          <Activity className="w-4 h-4 text-accent animate-pulse" />
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="min-tap p-2 flex items-center justify-center hover:bg-hover text-secondary hover:text-primary rounded-sm transition-colors border border-transparent hover:border-grid"
          title={`Switch to ${theme === 'dark' ? 'Milk White (Light)' : 'Charcoal Black (Dark)'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-accent" strokeWidth={2} />
          ) : (
            <Moon className="w-4 h-4 text-accent" strokeWidth={2} />
          )}
        </button>

        <button
          onClick={onLeave}
          className="min-tap p-2 flex items-center justify-center hover:bg-hover text-muted hover:text-primary rounded-sm transition-colors border border-transparent hover:border-grid"
          title="Exit Room"
          aria-label="Leave this room"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* QR Code Modal Popover */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-panel border border-grid rounded-2xl p-5 w-[min(92vw,22rem)] max-h-[86dvh] overflow-y-auto scroll-panel shadow-float relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-grid">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-accent" />
                <span className="font-semibold text-xs uppercase font-sans text-primary">
                  Mobile Join Link
                </span>
              </div>
              <button
                onClick={() => setShowQr(false)}
                className="p-1 hover:bg-hover text-muted hover:text-primary rounded-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white p-4 rounded-sm flex items-center justify-center border border-grid shadow-inner mb-4">
              <QRCodeSVG value={shareUrl} size={190} level="M" />
            </div>

            <div className="text-center font-mono text-[13px] text-secondary mb-4 break-all bg-canvas p-2.5 rounded-lg border border-grid select-all">
              {shareUrl}
            </div>

            <button
              onClick={handleCopy}
              className="w-full min-h-[44px] bg-accent hover:bg-accent-strong text-accent-ink text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 font-sans tracking-wide"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'LINK COPIED' : 'COPY SHARE LINK'}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
