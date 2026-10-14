import React, { useState, useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Sparkles, Filter, GitCommit, FileCode, MessageSquare } from 'lucide-react';
import type { CoWorkMessage, ContentType } from '../../api/_types.js';

interface ChatTerminalProps {
  messages: CoWorkMessage[];
  currentClientId: string;
  onSendMessage: (text: string) => Promise<void>;
}

export const ChatTerminal: React.FC<ChatTerminalProps> = ({
  messages,
  currentClientId,
  onSendMessage,
}) => {
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PROMPTS' | 'GIT'>('ALL');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const getTagColor = (type: ContentType) => {
    switch (type) {
      case 'CROSS_PROMPT':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'AGENT_SYNC':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
      case 'GIT_PUSH':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'FILE_LOCK':
      case 'FILE_UNLOCK':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'STATUS':
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
  };

  const filteredMessages = messages.filter((m) => {
    if (filter === 'PROMPTS') return m.contentType === 'CROSS_PROMPT' || m.contentType === 'AGENT_SYNC';
    if (filter === 'GIT') return m.contentType === 'GIT_PUSH' || m.contentType === 'FILE_LOCK';
    return true;
  });

  return (
    <div className="bg-cyber-card border border-cyber-border rounded-xl flex flex-col h-[520px] overflow-hidden">
      {/* Top Bar with Filter Tabs */}
      <div className="border-b border-cyber-border px-4 py-2.5 flex items-center justify-between bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-cyber-emerald" />
          <span className="text-xs font-bold text-white tracking-wider">COLLABORATION TERMINAL</span>
          <span className="text-[10px] text-zinc-500 font-mono">({filteredMessages.length})</span>
        </div>

        <div className="flex items-center gap-1">
          {(['ALL', 'PROMPTS', 'GIT'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                filter === tab
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
        {filteredMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
            <Sparkles className="w-6 h-6 text-zinc-700" />
            <p>No messages yet in this room.</p>
            <p className="text-[11px] text-zinc-700">Use @peer-ai or @loid-ai to dispatch instructions.</p>
          </div>
        ) : (
          filteredMessages.map((msg) => {
            const isMe = msg.senderId === currentClientId;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            return (
              <div
                key={msg.messageId}
                className={`p-3 rounded-lg border transition-all ${
                  isMe
                    ? 'bg-zinc-900/90 border-zinc-700/60 ml-4'
                    : 'bg-zinc-950/70 border-cyber-border mr-4'
                }`}
              >
                {/* Meta header */}
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">[{timeStr}]</span>
                    <span className={`font-bold ${isMe ? 'text-cyber-emerald' : 'text-zinc-300'}`}>
                      @{msg.senderId}
                    </span>
                    {msg.senderModel && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-zinc-400 font-mono">
                        {msg.senderModel}
                      </span>
                    )}
                    {msg.targetId && msg.targetId !== 'all' && (
                      <>
                        <span className="text-zinc-600">→</span>
                        <span className="text-cyber-cyan font-semibold">@{msg.targetId}</span>
                      </>
                    )}
                  </div>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border uppercase font-semibold ${getTagColor(
                      msg.contentType
                    )}`}
                  >
                    {msg.contentType}
                  </span>
                </div>

                {/* Content */}
                <div className="text-zinc-200 whitespace-pre-wrap break-words leading-relaxed">
                  {msg.text}
                </div>

                {/* File locks / Git artifacts */}
                {(msg.files || msg.commitHash) && (
                  <div className="mt-2 pt-2 border-t border-zinc-800/60 flex flex-wrap gap-2 text-[11px]">
                    {msg.files?.map((f) => (
                      <span key={f} className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                        <FileCode className="w-3 h-3" />
                        {f}
                      </span>
                    ))}
                    {msg.commitHash && (
                      <span className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        <GitCommit className="w-3 h-3" />
                        {msg.commitHash.slice(0, 7)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pill Bar */}
      <div className="px-4 py-2 border-t border-zinc-800/80 bg-zinc-950/80 flex items-center gap-1.5 overflow-x-auto text-xs">
        <span className="text-zinc-500 text-[10px] uppercase tracking-wider shrink-0 mr-1">Quick @:</span>
        {['@peer-ai', '@loid-ai', '@peer', '@loid', '@all'].map((mention) => (
          <button
            key={mention}
            type="button"
            onClick={() => handlePillClick(mention)}
            className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 hover:border-cyber-emerald text-zinc-300 hover:text-cyber-emerald transition-colors font-mono shrink-0"
          >
            {mention}
          </button>
        ))}
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-cyber-border bg-zinc-950 flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type message or @peer-ai instructions..."
            disabled={sending}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-xs font-mono text-white placeholder-zinc-500 focus:outline-none focus:border-cyber-emerald transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="bg-cyber-emerald hover:bg-emerald-400 disabled:opacity-40 text-black px-4 py-2.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20"
        >
          <span>Send</span>
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
