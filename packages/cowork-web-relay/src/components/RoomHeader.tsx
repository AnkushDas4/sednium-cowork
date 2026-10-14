import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode, Copy, Check, GitCommit, Users, LogOut, ExternalLink } from 'lucide-react';
import type { CommitInfo, ParticipantInfo } from '../../api/_types.js';

interface RoomHeaderProps {
  roomCode: string;
  clientId: string;
  latestCommit: CommitInfo | null;
  participants: Record<string, ParticipantInfo>;
  onLeave: () => void;
  onNewRoom?: (newRoom: string) => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomCode,
  clientId,
  latestCommit,
  participants,
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

  const shareUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`
    : `https://cowork.sednium.com/?room=${encodeURIComponent(roomCode)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const participantCount = Object.keys(participants).length;

  return (
    <header className="border-b border-cyber-border bg-cyber-bg/95 backdrop-blur sticky top-0 z-40 px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Branding & Room Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyber-emerald animate-glow" />
            <h1 className="text-sm font-bold tracking-wider text-white">SEDNIUM COWORK</h1>
          </div>
          <div className="h-4 w-[1px] bg-zinc-800" />
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 px-2.5 py-1 rounded text-xs">
            <span className="text-zinc-500">ROOM:</span>
            <span className="font-bold text-cyber-cyan">{roomCode}</span>
          </div>
          <div className="hidden sm:flex items-center gap-1 text-xs text-zinc-400">
            <Users className="w-3.5 h-3.5 text-zinc-500" />
            <span>{participantCount} online</span>
          </div>
        </div>

        {/* Middle: Latest Commit HUD */}
        <div className="hidden md:flex items-center gap-2 bg-zinc-950 border border-zinc-800/80 px-3 py-1.5 rounded-lg text-xs max-w-md truncate">
          <GitCommit className="w-4 h-4 text-cyber-emerald shrink-0" />
          {latestCommit ? (
            <div className="truncate flex items-center gap-2">
              <span className="font-mono text-cyber-emerald bg-emerald-500/10 px-1 rounded text-[11px]">
                {latestCommit.hash.slice(0, 7)}
              </span>
              <span className="text-zinc-300 truncate">{latestCommit.message}</span>
              <span className="text-zinc-500 text-[10px]">by @{latestCommit.author}</span>
            </div>
          ) : (
            <span className="text-zinc-500">Waiting for first git commit sync...</span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {onNewRoom && (
            <button
              onClick={handleCreateNewRoom}
              disabled={isGenerating}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-cyber-emerald px-2.5 py-1.5 rounded text-xs transition-colors disabled:opacity-50"
              title="Generate a fresh, guaranteed collision-free room"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyber-cyan" />
              <span className="hidden sm:inline">New Room</span>
            </button>
          )}

          <button
            onClick={() => setShowQr(true)}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white px-2.5 py-1.5 rounded text-xs transition-colors"
            title="Scan QR to join on mobile"
          >
            <QrCode className="w-3.5 h-3.5 text-cyber-emerald" />
            <span className="hidden sm:inline">QR Code</span>
          </button>

          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white px-2.5 py-1.5 rounded text-xs transition-colors"
            title="Copy room link"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-cyber-emerald" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

          <div className="flex items-center gap-1 text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800/60 px-2 py-1 rounded">
            <span>as</span>
            <span className="font-semibold text-white">@{clientId}</span>
          </div>

          <button
            onClick={onLeave}
            className="text-zinc-500 hover:text-red-400 p-1.5 rounded hover:bg-zinc-900 transition-colors"
            title="Disconnect"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* QR Code Modal */}
      {showQr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-cyber-card border border-cyber-border rounded-xl p-6 max-w-xs w-full text-center relative">
            <h3 className="text-sm font-bold text-white mb-1">SCAN TO JOIN</h3>
            <p className="text-xs text-zinc-400 mb-4">Open on your phone or peer laptop</p>
            
            <div className="bg-white p-4 rounded-lg inline-block shadow-lg mx-auto">
              <QRCodeSVG value={shareUrl} size={180} level="M" />
            </div>

            <p className="text-[11px] font-mono text-cyber-emerald mt-4 truncate bg-zinc-950 p-2 rounded border border-zinc-800">
              {shareUrl}
            </p>

            <button
              onClick={() => setShowQr(false)}
              className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
