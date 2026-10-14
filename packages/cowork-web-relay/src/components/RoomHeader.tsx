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
} from 'lucide-react';
import type { CommitInfo, ParticipantInfo } from '../../api/_types.js';

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
      const res = await fetch('/api/presence?action=new-room');
      const data = await res.json();
      if (data.roomCode) {
        onNewRoom(data.roomCode);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`
      : `https://cowork.sednium.com/?room=${encodeURIComponent(roomCode)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const participantCount = Object.keys(participants).length;

  return (
    <header className="h-12 border-b border-grid bg-panel flex items-stretch divide-x divide-grid select-none text-xs sticky top-0 z-40">
      {/* 1. Brand Cell */}
      <div className="flex items-center gap-2.5 px-3 md:px-4 shrink-0">
        <div className="w-6 h-6 bg-[#FF6B00] flex items-center justify-center rounded-sm shrink-0">
          <Terminal className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col">
          <span className="font-bold tracking-tight text-primary text-[11px] md:text-xs uppercase font-sans">
            SEDNIUM COWORK
          </span>
          <span className="text-[9px] text-muted tracking-wider font-mono uppercase">
            RELAY HUD v1.0
          </span>
        </div>
      </div>

      {/* 2. Room Session Cell */}
      <div className="flex items-center gap-2 px-3 shrink-0">
        <div className="flex items-center gap-1 font-mono">
          <Hash className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={2.5} />
          <span className="font-semibold text-primary text-xs">{roomCode}</span>
        </div>

        <button
          onClick={handleCopy}
          className="p-1 hover:bg-hover text-secondary hover:text-primary rounded-sm transition-colors border border-transparent hover:border-grid"
          title="Copy invite link"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={2.5} />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>

        <button
          onClick={() => setShowQr(true)}
          className="p-1 hover:bg-hover text-secondary hover:text-primary rounded-sm transition-colors border border-transparent hover:border-grid"
          title="Show mobile QR code"
        >
          <QrCode className="w-3.5 h-3.5" />
        </button>

        {onNewRoom && (
          <button
            onClick={handleCreateNewRoom}
            disabled={isGenerating}
            className="hidden lg:flex items-center gap-1 px-1.5 py-0.5 hover:bg-hover text-muted hover:text-primary rounded-sm border border-transparent hover:border-grid transition-colors"
            title="Generate a new collision-free room code"
          >
            <Sparkles className="w-3 h-3 text-[#FF6B00]" />
            <span className="text-[10px] uppercase font-mono">NEW</span>
          </button>
        )}
      </div>

      {/* 3. Git Main Status Cell */}
      <div className="hidden md:flex flex-1 items-center px-3 gap-2 overflow-hidden">
        <div className="flex items-center gap-1 text-[#FF6B00] shrink-0 font-mono text-[11px]">
          <GitBranch className="w-3.5 h-3.5" strokeWidth={2.2} />
          <span className="font-semibold">main</span>
        </div>
        <span className="text-muted text-[10px]">/</span>
        {latestCommit ? (
          <div className="flex items-center gap-2 overflow-hidden truncate">
            <span className="font-mono text-primary bg-hover px-1.5 py-0.5 rounded-sm text-[11px] border border-grid shrink-0">
              {latestCommit.hash.slice(0, 7)}
            </span>
            <span className="text-secondary truncate text-xs font-sans">
              {latestCommit.message}
            </span>
            <span className="text-muted text-[10px] shrink-0 font-mono">
              @{latestCommit.author}
            </span>
          </div>
        ) : (
          <span className="text-muted text-xs truncate">
            Waiting for first git push on main...
          </span>
        )}
      </div>

      {/* 4. Operator & Theme Switcher Cell */}
      <div className="flex items-center gap-2 px-3 shrink-0 ml-auto md:ml-0">
        <div className="flex items-center gap-1.5 bg-hover px-2 py-1 rounded-sm border border-grid">
          <User className="w-3 h-3 text-[#FF6B00]" />
          <span className="font-mono text-primary text-[11px] font-medium">@{clientId}</span>
          <span className="text-muted text-[10px]">({participantCount})</span>
        </div>

        <div className="flex items-center gap-1 text-muted pl-1" title="Active 2s heartbeat">
          <Activity className="w-3.5 h-3.5 text-[#FF6B00] animate-pulse" />
        </div>

        {/* Theme Toggle Button */}
        <button
          onClick={onToggleTheme}
          className="p-1.5 hover:bg-hover text-secondary hover:text-primary rounded-sm transition-colors border border-transparent hover:border-grid ml-1"
          title={`Switch to ${theme === 'dark' ? 'Milk White (Light)' : 'Charcoal Black (Dark)'} mode`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-[#FF6B00]" strokeWidth={2} />
          ) : (
            <Moon className="w-4 h-4 text-[#FF6B00]" strokeWidth={2} />
          )}
        </button>

        <button
          onClick={onLeave}
          className="p-1.5 hover:bg-hover text-muted hover:text-primary rounded-sm transition-colors border border-transparent hover:border-grid"
          title="Exit Room"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* QR Code Modal Popover */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-panel border border-grid rounded-sm p-6 max-w-xs w-full shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-grid">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-[#FF6B00]" />
                <span className="font-bold text-xs uppercase font-sans text-primary">
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

            <div className="bg-white p-3.5 rounded-sm flex items-center justify-center border border-grid shadow-inner mb-4">
              <QRCodeSVG value={shareUrl} size={190} level="M" />
            </div>

            <div className="text-center font-mono text-[11px] text-muted mb-3 break-all">
              {shareUrl}
            </div>

            <button
              onClick={handleCopy}
              className="w-full py-2 bg-[#FF6B00] hover:bg-[#E66000] text-white text-xs font-semibold rounded-sm transition-colors flex items-center justify-center gap-2"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'LINK COPIED' : 'COPY SHARE LINK'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
