import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  AtSign,
  GitPullRequest,
  Lock,
  GitCommit,
  Cpu,
  MessageSquare,
  Terminal,
  Send,
  ArrowRight,
  Copy,
  Check,
  QrCode,
  Sparkles,
  Radio,
} from 'lucide-react';
import type { CoWorkMessage, ContentType } from '../../api/_types.js';

interface ChatTerminalProps {
  messages: CoWorkMessage[];
  currentClientId: string;
  roomCode?: string;
  onSendMessage: (text: string) => Promise<void>;
  onShowQr?: () => void;
}

type FilterType = 'ALL' | 'MENTIONS' | 'GIT' | 'LOCKS';

export const ChatTerminal: React.FC<ChatTerminalProps> = ({
  messages,
  currentClientId,
  roomCode = 'SED-409',
  onSendMessage,
  onShowQr,
}) => {
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sending, setSending] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showMentionPopup, setShowMentionPopup] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const quickTargets = ['@peer-ai', '@loid-ai', '@peer', '@loid', '@all'];

  const handlePillClick = (mention: string) => {
    if (!input.includes(mention)) {
      setInput((prev) => `${mention} ${prev}`.trim() + ' ');
    }
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInput(val);

    // Show mention popup if user typed '@'
    const lastWord = val.split(' ').pop() || '';
    if (lastWord.startsWith('@')) {
      setShowMentionPopup(true);
    } else {
      setShowMentionPopup(false);
    }
  };

  const handleSelectMention = (mention: string) => {
    const words = input.split(' ');
    words.pop(); // remove partial '@...'
    words.push(mention);
    setInput(words.join(' ') + ' ');
    setShowMentionPopup(false);
    inputRef.current?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      await onSendMessage(input.trim());
      setInput('');
      setShowMentionPopup(false);
    } finally {
      setSending(false);
    }
  };

  const handleCopyPrompt = (agentId: string) => {
    const prompt = `Connect to CoWork room ${roomCode} as ${agentId} in this repository using cowork_connect.`;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(agentId);
    setTimeout(() => setCopiedPrompt(null), 2500);
  };

  const handleCopyInviteLink = () => {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`
        : `https://cowork.sednium.com/?room=${encodeURIComponent(roomCode)}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendTestPing = async () => {
    await onSendMessage(`👋 Live relay test ping from @${currentClientId}`);
  };

  // Filter messages
  const filteredMessages = messages.filter((m) => {
    if (filter === 'ALL') return true;
    if (filter === 'MENTIONS') {
      return (
        m.contentType === 'CROSS_PROMPT' ||
        m.text.includes('@') ||
        m.targetId !== 'all'
      );
    }
    if (filter === 'GIT') return m.contentType === 'GIT_PUSH';
    if (filter === 'LOCKS') {
      return m.contentType === 'FILE_LOCK' || m.contentType === 'FILE_UNLOCK';
    }
    return true;
  });

  const getTypeIcon = (type: ContentType) => {
    switch (type) {
      case 'CROSS_PROMPT':
        return <AtSign className="w-4 h-4 text-[#FF6B00]" strokeWidth={2.2} />;
      case 'GIT_PUSH':
        return <GitCommit className="w-4 h-4 text-[#FF6B00]" strokeWidth={2.2} />;
      case 'FILE_LOCK':
      case 'FILE_UNLOCK':
        return <Lock className="w-4 h-4 text-[#FF6B00]" strokeWidth={2.2} />;
      case 'AGENT_SYNC':
        return <Cpu className="w-4 h-4 text-secondary" strokeWidth={2} />;
      default:
        return <MessageSquare className="w-4 h-4 text-secondary" strokeWidth={2} />;
    }
  };

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={idx}
            className="inline-flex items-center px-1.5 py-0.2 rounded-sm bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-mono text-xs font-bold mr-1"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="h-full flex flex-col bg-canvas divide-y divide-grid overflow-hidden">
      {/* 1. Filter Tab Bar */}
      <div className="h-10 bg-panel border-b border-grid flex items-stretch px-3 divide-x divide-grid select-none shrink-0 overflow-x-auto">
        <button
          onClick={() => setFilter('ALL')}
          className={`flex items-center gap-1.5 px-3.5 text-xs font-sans font-medium relative transition-colors ${
            filter === 'ALL'
              ? 'text-primary font-bold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All Events</span>
          <span className="text-[11px] font-mono text-muted">({messages.length})</span>
          {filter === 'ALL' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B00]" />
          )}
        </button>

        <button
          onClick={() => setFilter('MENTIONS')}
          className={`flex items-center gap-1.5 px-3.5 text-xs font-sans font-medium relative transition-colors ${
            filter === 'MENTIONS'
              ? 'text-primary font-bold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <AtSign className="w-3.5 h-3.5" />
          <span>@Mentions & Tasks</span>
          {filter === 'MENTIONS' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B00]" />
          )}
        </button>

        <button
          onClick={() => setFilter('GIT')}
          className={`flex items-center gap-1.5 px-3.5 text-xs font-sans font-medium relative transition-colors ${
            filter === 'GIT'
              ? 'text-primary font-bold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <GitPullRequest className="w-3.5 h-3.5" />
          <span>Git Sync</span>
          {filter === 'GIT' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B00]" />
          )}
        </button>

        <button
          onClick={() => setFilter('LOCKS')}
          className={`flex items-center gap-1.5 px-3.5 text-xs font-sans font-medium relative transition-colors ${
            filter === 'LOCKS'
              ? 'text-primary font-bold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>File Locks</span>
          {filter === 'LOCKS' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B00]" />
          )}
        </button>
      </div>

      {/* 2. Structured Event Stream OR Interactive Onboarding Card */}
      <div className="flex-1 overflow-y-auto divide-y divide-grid bg-canvas">
        {filteredMessages.length === 0 ? (
          /* Interactive Quick-Start Onboarding Card (Fixes Dead Empty State) */
          <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 bg-[#FF6B00]/10 border border-[#FF6B00]/30 text-[#FF6B00] rounded-sm flex items-center justify-center mx-auto mb-2">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <h2 className="text-base md:text-lg font-bold font-sans text-primary">
                CoWork Relay Session Active: {roomCode}
              </h2>
              <p className="text-xs md:text-sm font-sans text-secondary max-w-md mx-auto leading-relaxed">
                Your stateless collaboration room is live. Follow these 3 steps to pair agents and begin coding together:
              </p>
            </div>

            <div className="border border-grid rounded-sm bg-panel divide-y divide-grid shadow-sm">
              {/* Step 1 */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-sm bg-[#FF6B00] text-white font-mono text-xs font-bold flex items-center justify-center">
                    1
                  </span>
                  <span className="font-bold text-xs md:text-sm font-sans text-primary">
                    Connect Your Antigravity AI Agent
                  </span>
                </div>
                <p className="text-xs text-secondary font-sans pl-7">
                  Copy and paste this instruction into your local Antigravity AI prompt window:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt('loid-ai')}
                    className="py-2 px-3 bg-canvas hover:bg-hover border border-grid text-primary rounded-sm text-xs font-mono text-left flex items-center justify-between gap-2 transition-colors"
                  >
                    <span>Connect @loid-ai</span>
                    {copiedPrompt === 'loid-ai' ? (
                      <Check className="w-3.5 h-3.5 text-[#FF6B00]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-muted" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyPrompt('peer-ai')}
                    className="py-2 px-3 bg-canvas hover:bg-hover border border-grid text-primary rounded-sm text-xs font-mono text-left flex items-center justify-between gap-2 transition-colors"
                  >
                    <span>Connect @peer-ai</span>
                    {copiedPrompt === 'peer-ai' ? (
                      <Check className="w-3.5 h-3.5 text-[#FF6B00]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-muted" />
                    )}
                  </button>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-sm bg-[#FF6B00] text-white font-mono text-xs font-bold flex items-center justify-center">
                    2
                  </span>
                  <span className="font-bold text-xs md:text-sm font-sans text-primary">
                    Share Room With Your Teammate
                  </span>
                </div>
                <p className="text-xs text-secondary font-sans pl-7">
                  Send your teammate the invite link or have them scan the QR code from their phone:
                </p>
                <div className="flex flex-wrap gap-2 pl-7 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="py-2 px-3 bg-canvas hover:bg-hover border border-grid text-primary rounded-sm text-xs font-sans font-medium flex items-center gap-2 transition-colors"
                  >
                    {copiedLink ? (
                      <Check className="w-3.5 h-3.5 text-[#FF6B00]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-[#FF6B00]" />
                    )}
                    <span>{copiedLink ? 'Link Copied!' : 'Copy Invite Link'}</span>
                  </button>
                  {onShowQr && (
                    <button
                      type="button"
                      onClick={onShowQr}
                      className="py-2 px-3 bg-canvas hover:bg-hover border border-grid text-primary rounded-sm text-xs font-sans font-medium flex items-center gap-2 transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5 text-secondary" />
                      <span>Show QR Code</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Step 3 */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-sm bg-[#FF6B00] text-white font-mono text-xs font-bold flex items-center justify-center">
                    3
                  </span>
                  <span className="font-bold text-xs md:text-sm font-sans text-primary">
                    Verify Relay Stream
                  </span>
                </div>
                <p className="text-xs text-secondary font-sans pl-7">
                  Test the serverless HTTP event stream right now with a single test ping:
                </p>
                <div className="pl-7 pt-1">
                  <button
                    type="button"
                    onClick={handleSendTestPing}
                    className="py-2 px-4 bg-[#FF6B00] hover:bg-[#E66000] text-white rounded-sm text-xs font-sans font-semibold flex items-center gap-2 transition-colors shadow-sm"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Send Test Ping Message</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            const isSelf = msg.senderId === currentClientId;

            return (
              <div
                key={msg.messageId}
                className={`px-5 py-3.5 flex items-start gap-3.5 transition-colors hover:bg-hover/30 ${
                  isSelf ? 'bg-panel/20' : ''
                }`}
              >
                {/* Timestamp */}
                <div className="font-mono text-xs text-muted shrink-0 pt-0.5 select-none font-medium">
                  {timeStr}
                </div>

                {/* Event Type Icon */}
                <div className="shrink-0 pt-0.5">{getTypeIcon(msg.contentType)}</div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-primary">
                      @{msg.senderId}
                    </span>
                    <ArrowRight className="w-3 h-3 text-muted shrink-0" />
                    <span className="font-mono text-xs font-bold text-[#FF6B00]">
                      @{msg.targetId}
                    </span>
                    <span className="font-mono text-[10px] uppercase px-1.5 py-0.2 rounded-sm bg-panel text-muted border border-grid">
                      {msg.contentType}
                    </span>
                  </div>

                  <div className="text-[14px] text-primary font-sans font-medium leading-relaxed break-words">
                    {renderFormattedText(msg.text)}
                  </div>

                  {/* Render files or commits if attached */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.files.map((file) => (
                        <span
                          key={file}
                          className="font-mono text-xs bg-panel px-2 py-0.5 rounded-sm border border-grid text-secondary font-medium"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.commitHash && (
                    <div className="pt-1">
                      <span className="font-mono text-xs bg-panel px-2 py-0.5 rounded-sm border border-grid text-[#FF6B00] font-bold">
                        {msg.commitHash.slice(0, 7)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={streamEndRef} />
      </div>

      {/* 3. Command Composer Dock (Flush Edge-to-Edge Input Row) */}
      <div className="bg-panel border-t border-grid shrink-0 relative">
        {/* Inline @ Mention Autocomplete Popup */}
        {showMentionPopup && (
          <div className="absolute bottom-full left-4 mb-2 bg-panel border border-grid rounded-sm shadow-2xl py-1 z-30 w-52 divide-y divide-grid">
            <div className="px-3 py-1 text-[10px] font-mono text-muted uppercase">
              SELECT TARGET MENTION
            </div>
            {quickTargets.map((mention) => (
              <button
                key={mention}
                type="button"
                onClick={() => handleSelectMention(mention)}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-primary hover:bg-[#FF6B00] hover:text-white transition-colors flex items-center justify-between"
              >
                <span>{mention}</span>
                <span className="text-[10px] opacity-70">tab/click</span>
              </button>
            ))}
          </div>
        )}

        {/* Row 1: Quick Target Mention Bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-grid overflow-x-auto bg-hover/30">
          <span className="text-[10px] font-mono uppercase text-muted shrink-0 mr-1 flex items-center gap-1 font-semibold">
            <AtSign className="w-3 h-3 text-[#FF6B00]" />
            QUICK TARGET:
          </span>
          {quickTargets.map((mention) => {
            const isSelected = input.includes(mention);
            return (
              <button
                key={mention}
                type="button"
                onClick={() => handlePillClick(mention)}
                className={`px-2.5 py-0.5 rounded-sm text-xs font-mono transition-colors shrink-0 border ${
                  isSelected
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00] font-bold shadow-sm'
                    : 'bg-panel hover:bg-hover text-secondary hover:text-primary border-grid'
                }`}
              >
                {mention}
              </button>
            );
          })}
        </div>

        {/* Row 2: 100% Flush Edge-to-Edge Input & Dispatch Button (h-14) */}
        <form onSubmit={handleSubmit} className="h-14 flex items-stretch">
          <div className="pl-4 pr-2 flex items-center text-[#FF6B00] shrink-0 bg-canvas">
            <Terminal className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Assign task with @peer-ai or message team..."
            className="flex-1 bg-canvas h-full px-2 text-xs md:text-sm text-primary placeholder:text-muted focus:outline-none font-sans font-medium"
          />

          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="h-full px-6 bg-[#FF6B00] hover:bg-[#ff7a1a] disabled:opacity-40 text-white font-sans font-bold text-xs md:text-sm flex items-center gap-2 transition-colors shrink-0 select-none shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>DISPATCH</span>
          </button>
        </form>
      </div>
    </div>
  );
};
