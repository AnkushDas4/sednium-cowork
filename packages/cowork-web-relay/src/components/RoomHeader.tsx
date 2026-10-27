import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import type { CommitInfo, GitRepoBinding, ParticipantInfo } from '../../api/_types.js';
import { repoLabel } from '../../api/_repo.js';
import { inviteKeyFor, inviteLink, rememberInvite } from '../relay.js';
import { NotificationCenter } from './NotificationCenter.js';
import type { NotificationCenter as NotificationModel } from '../useNotificationCenter.js';

interface RoomHeaderProps {
  roomCode: string;
  clientId: string;
  latestCommit: CommitInfo | null;
  /** Linked repository, shown next to the branch so "where did that commit go?" is answerable at a glance. */
  gitRepo?: GitRepoBinding | null;
  participants: Record<string, ParticipantInfo>;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLeave: () => void;
  onNewRoom?: (newRoom: string) => void;
  /** Notifications for this room, owned by App because the poll loop is what feeds them. */
  center?: NotificationModel;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomCode,
  clientId,
  latestCommit,
  gitRepo = null,
  participants,
  theme,
  onToggleTheme,
  onLeave,
  onNewRoom,
  center,
}) => {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!showQr) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowQr(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showQr]);
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
  const shareUrl = inviteLink(roomCode, gitRepo?.url);
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
    <header className="min-h-14 pt-safe border-b border-grid bg-panel/90 backdrop-blur-md flex items-stretch sm:divide-x sm:divide-grid select-none text-xs sticky top-0 z-40">
      {/* 1. Brand Cell */}
      <div className="flex items-center gap-2.5 px-3 md:px-5 shrink-0">
        <div className="w-7 h-7 bg-accent flex items-center justify-center rounded-lg shrink-0 shadow-card">
          <Terminal className="w-4 h-4 text-accent-ink" strokeWidth={2.5} />
        </div>
        <div className="hidden sm:flex flex-col">
          <span className="font-semibold tracking-tight text-primary text-xs font-sans">
            Sednium CoWork
          </span>
          <span className="text-2xs text-muted tracking-wider font-mono uppercase">
            Pair Programming Relay
          </span>
        </div>
      </div>

      {/* 2. Room Session Cell - the code is the invite: one tap opens the sheet that carries the QR,
          the raw link and the copy button. */}
      <div className="flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-4 flex-1 min-w-0 sm:flex-none">
        <button
          onClick={() => setShowQr(true)}
          className="flex items-center gap-1.5 font-mono min-w-0 bg-hover/40 hover:bg-hover px-2.5 py-1.5 min-h-[36px] sm:min-h-0 rounded-lg border border-grid/50 hover:border-grid transition-colors text-left"
          title="Invite link - QR code, share and copy"
          aria-label="Show the invite link for this room"
        >
          <Hash className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent shrink-0" strokeWidth={2.5} />
          <span className="font-semibold text-primary text-xs xs:text-sm tracking-tight truncate min-w-0">
            {roomCode.length > 15 ? `${roomCode.slice(0, 7)}...${roomCode.slice(-4)}` : roomCode}
          </span>
        </button>

        <div className="flex items-center gap-1 ml-auto sm:ml-1 shrink-0">
          <button
            onClick={handleCopy}
            className="hidden sm:flex min-tap justify-center px-2.5 py-1.5 items-center gap-1.5 bg-hover hover:bg-hover/80 text-primary rounded-sm transition-colors border border-grid text-xs font-sans font-medium"
            title="Copy invite link"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-accent" strokeWidth={2.5} />
            ) : (
              <Copy className="w-3.5 h-3.5 text-accent" />
            )}
            <span>{copied ? 'Copied!' : hasInviteKey ? 'Copy Link' : 'Copy'}</span>
          </button>

          {onNewRoom && (
            <button
              onClick={handleCreateNewRoom}
              disabled={isGenerating}
              className="hidden sm:flex min-tap justify-center px-2.5 py-1.5 items-center gap-1.5 bg-hover hover:bg-hover/80 text-secondary hover:text-primary rounded-sm border border-grid transition-colors text-xs font-sans font-medium disabled:opacity-50"
              title="Generate a new collision-free room code"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span className="hidden md:inline">New</span>
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
        {gitRepo && (
          <>
            <span className="truncate font-mono text-xs font-medium text-secondary" title={`${gitRepo.url} - every agent here pushes and clones only this`}>
              {repoLabel(gitRepo)}
            </span>
            <span className="text-muted text-xs">/</span>
          </>
        )}
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
            {gitRepo ? 'No push in this repository yet' : 'Waiting for a repo - the first git push decides it'}
          </span>
        )}
      </div>

      {/* 4. Active Room Roster & Theme Switcher Cell */}
      <div className="flex items-center gap-1 sm:gap-2.5 px-2 sm:px-4 shrink-0 ml-auto lg:ml-0">
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

        {/* Compact roster for mobile screens */}
        <div
          className="flex xs:hidden items-center gap-1 px-1 text-2xs font-mono font-medium text-secondary"
          title="Active participants online"
        >
          <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
          <span>{participantEntries.filter(([, p]) => isOnline(p.lastSeen)).length}</span>
        </div>

        {/* Notification bell (only once a room is actually being polled) */}
        {center && <NotificationCenter center={center} />}

        {/* Live sync pulse - a decoration that means "we are polling"; on a phone the Agents count
            in FeedNav already answers that, so it does not get a tap target's width here. */}
        <div className="hidden sm:flex items-center gap-1 text-muted pl-1" title="Active 2s heartbeat">
          <Activity className="w-4 h-4 text-accent animate-pulse" />
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="min-tap p-2 flex items-center justify-center hover:bg-hover text-secondary hover:text-primary rounded-sm transition-all duration-200 border border-transparent hover:border-grid active:scale-90"
          title={`Switch to ${theme === 'dark' ? 'Milk White (Light)' : 'Charcoal Black (Dark)'} mode`}
          aria-label="Toggle theme"
        >
          <div className="relative w-4 h-4 flex items-center justify-center">
            <Sun
              className={`w-4 h-4 text-accent absolute inset-0 transform transition-all duration-300 ease-out ${
                theme === 'dark'
                  ? 'rotate-0 scale-100 opacity-100'
                  : '-rotate-90 scale-0 opacity-0 pointer-events-none'
              }`}
              strokeWidth={2}
            />
            <Moon
              className={`w-4 h-4 text-accent absolute inset-0 transform transition-all duration-300 ease-out ${
                theme === 'light'
                  ? 'rotate-0 scale-100 opacity-100'
                  : 'rotate-90 scale-0 opacity-0 pointer-events-none'
              }`}
              strokeWidth={2}
            />
          </div>
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

      {/* QR Code Modal Popover - rendered via Portal to document.body to prevent containing-block clipping */}
      {showQr && typeof document !== 'undefined' && createPortal(
        <div
          onClick={() => setShowQr(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Join Link QR Code"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-panel border border-grid rounded-2xl p-5 w-[min(92vw,22rem)] max-h-[86dvh] overflow-y-auto scroll-panel shadow-float relative"
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-grid">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-accent" />
                <span className="font-semibold text-xs uppercase font-sans text-primary">
                  Mobile Join Link
                </span>
              </div>
              <button
                onClick={() => setShowQr(false)}
                className="p-1.5 hover:bg-hover text-muted hover:text-primary rounded-lg transition-colors cursor-pointer"
                title="Close QR Code"
                aria-label="Close QR Code"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white p-4 rounded-xl flex items-center justify-center border border-grid shadow-inner mb-4">
              <QRCodeSVG value={shareUrl} size={190} level="M" />
            </div>

            <div className="text-center font-mono text-[13px] text-secondary mb-4 break-all bg-canvas p-2.5 rounded-lg border border-grid select-all">
              {shareUrl}
            </div>

            <button
              onClick={handleCopy}
              className="w-full min-h-[44px] bg-accent hover:bg-accent-strong text-accent-ink text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 font-sans tracking-wide cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'LINK COPIED' : 'COPY SHARE LINK'}</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};
