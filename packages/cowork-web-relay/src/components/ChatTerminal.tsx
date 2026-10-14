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
  CornerDownLeft,
  ArrowRight,
} from 'lucide-react';
import type { CoWorkMessage, ContentType } from '../../api/_types.js';

interface ChatTerminalProps {
  messages: CoWorkMessage[];
  currentClientId: string;
  onSendMessage: (text: string) => Promise<void>;
}

type FilterType = 'ALL' | 'MENTIONS' | 'GIT' | 'LOCKS';

export const ChatTerminal: React.FC<ChatTerminalProps> = ({
  messages,
  currentClientId,
  onSendMessage,
}) => {
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sending, setSending] = useState(false);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handlePillClick = (mention: string) => {
    if (!input.includes(mention)) {
      setInput((prev) => `${mention} ${prev}`.trim());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    setSending(true);
    try {
      await onSendMessage(input.trim());
      setInput('');
    } finally {
      setSending(false);
    }
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
        return <AtSign className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={2.2} />;
      case 'GIT_PUSH':
        return <GitCommit className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={2.2} />;
      case 'FILE_LOCK':
      case 'FILE_UNLOCK':
        return <Lock className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={2.2} />;
      case 'AGENT_SYNC':
        return <Cpu className="w-3.5 h-3.5 text-secondary" strokeWidth={2} />;
      default:
        return <MessageSquare className="w-3.5 h-3.5 text-secondary" strokeWidth={2} />;
    }
  };

  // Render message text with highlighted @ mentions
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(@[a-zA-Z0-9_-]+)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('@')) {
        return (
          <span
            key={idx}
            className="inline-flex items-center px-1.5 py-0.2 rounded-sm bg-[#FF6B00]/15 text-[#FF6B00] border border-[#FF6B00]/30 font-mono text-xs font-semibold mr-1"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const quickTargets = ['@peer-ai', '@loid-ai', '@peer', '@loid', '@all'];

  return (
    <div className="h-full flex flex-col bg-canvas divide-y divide-grid overflow-hidden">
      {/* 1. Filter Tab Bar */}
      <div className="h-10 bg-panel border-b border-grid flex items-stretch px-2 divide-x divide-grid select-none shrink-0 overflow-x-auto">
        <button
          onClick={() => setFilter('ALL')}
          className={`flex items-center gap-1.5 px-3 text-xs font-sans font-medium relative transition-colors ${
            filter === 'ALL'
              ? 'text-primary font-bold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All Events</span>
          <span className="text-[10px] font-mono text-muted">({messages.length})</span>
          {filter === 'ALL' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FF6B00]" />
          )}
        </button>

        <button
          onClick={() => setFilter('MENTIONS')}
          className={`flex items-center gap-1.5 px-3 text-xs font-sans font-medium relative transition-colors ${
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
          className={`flex items-center gap-1.5 px-3 text-xs font-sans font-medium relative transition-colors ${
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
          className={`flex items-center gap-1.5 px-3 text-xs font-sans font-medium relative transition-colors ${
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

      {/* 2. Structured Event Stream */}
      <div className="flex-1 overflow-y-auto divide-y divide-grid bg-canvas">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted space-y-2">
            <Terminal className="w-8 h-8 opacity-40 text-[#FF6B00]" />
            <div className="text-sm font-sans font-semibold text-secondary">
              Relay stream initialized
            </div>
            <div className="text-xs font-mono max-w-sm">
              Ready for real-time AI prompts, lock acquisitions, and commit handoffs.
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
                className={`px-4 py-2.5 flex items-start gap-3 transition-colors hover:bg-hover/40 ${
                  isSelf ? 'bg-panel/30' : ''
                }`}
              >
                {/* Timestamp */}
                <div className="font-mono text-[11px] text-muted shrink-0 pt-0.5 select-none">
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
                    <span className="font-mono text-xs font-semibold text-[#FF6B00]">
                      @{msg.targetId}
                    </span>
                    <span className="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded-sm bg-hover text-muted border border-grid">
                      {msg.contentType}
                    </span>
                  </div>

                  <div className="text-[13px] md:text-[14px] text-primary font-sans font-medium leading-relaxed break-words">
                    {renderFormattedText(msg.text)}
                  </div>

                  {/* Render files or commits if attached */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {msg.files.map((file) => (
                        <span
                          key={file}
                          className="font-mono text-[10px] bg-hover px-1.5 py-0.5 rounded-sm border border-grid text-secondary"
                        >
                          {file}
                        </span>
                      ))}
                    </div>
                  )}

                  {msg.commitHash && (
                    <div className="pt-1">
                      <span className="font-mono text-[11px] bg-hover px-2 py-0.5 rounded-sm border border-grid text-[#FF6B00] font-semibold">
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

      {/* 3. Command Composer Dock */}
      <div className="p-3 bg-panel border-t border-grid space-y-2 shrink-0">
        {/* Row 1: Quick Target Mention Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="text-[10px] font-mono uppercase text-muted shrink-0 mr-1 flex items-center gap-1">
            <AtSign className="w-3 h-3 text-[#FF6B00]" />
            TARGET:
          </span>
          {quickTargets.map((mention) => {
            const isSelected = input.includes(mention);
            return (
              <button
                key={mention}
                type="button"
                onClick={() => handlePillClick(mention)}
                className={`px-2 py-0.5 rounded-sm text-xs font-mono transition-colors shrink-0 border ${
                  isSelected
                    ? 'bg-[#FF6B00] text-white border-[#FF6B00] font-semibold'
                    : 'bg-canvas hover:bg-hover text-secondary hover:text-primary border-grid'
                }`}
              >
                {mention}
              </button>
            );
          })}
        </div>

        {/* Row 2: Input & Submit */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center">
            <div className="absolute left-3 text-[#FF6B00] pointer-events-none">
              <Terminal className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Assign task with @peer-ai or message room..."
              className="w-full bg-canvas border border-grid rounded-sm pl-9 pr-4 py-2 text-xs md:text-sm text-primary placeholder:text-muted focus:outline-none focus:border-[#FF6B00] font-sans transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="px-4 py-2 bg-[#FF6B00] hover:bg-[#E66000] disabled:opacity-40 text-white rounded-sm text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">DISPATCH</span>
          </button>
        </form>
      </div>
    </div>
  );
};
