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
  Bot,
  Zap,
} from 'lucide-react';
import type { CoWorkMessage, ContentType, ParticipantInfo } from '../../api/_types.js';
import { inviteKeyFor, inviteLink } from '../relay.js';

interface ChatTerminalProps {
  messages: CoWorkMessage[];
  participants: Record<string, ParticipantInfo>;
  currentClientId: string;
  roomCode?: string;
  onSendMessage: (text: string) => Promise<void>;
  onShowQr?: () => void;
  prefilledInput?: string;
  onClearPrefill?: () => void;
}

type FilterType = 'ALL' | 'MENTIONS' | 'GIT' | 'LOCKS';

export const ChatTerminal: React.FC<ChatTerminalProps> = ({
  messages,
  participants,
  currentClientId,
  roomCode = 'SED-409',
  onSendMessage,
  onShowQr,
  prefilledInput,
  onClearPrefill,
}) => {
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [sending, setSending] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showMentionPopup, setShowMentionPopup] = useState(false);

  // Flexible Onboarding Agent ID input
  const [onboardingAgentId, setOnboardingAgentId] = useState<string>(
    currentClientId ? `${currentClientId}-ai` : ''
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const streamEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (prefilledInput) {
      setInput(prefilledInput);
      inputRef.current?.focus();
      onClearPrefill?.();
    }
  }, [prefilledInput]);

  // Derived from who is actually in the room - no invented identities.
  const agentSuggestions = [
    ...new Set([
      ...(currentClientId ? [`${currentClientId}-ai`] : []),
      ...Object.keys(participants).filter(p => p !== currentClientId).map(p => `${p}-ai`),
    ]),
  ].slice(0, 4);

  const quickTargets = [...Object.keys(participants).filter(id => id !== currentClientId).map(id => `@${id}`), '@all'];

  const handlePillClick = (mention: string) => {
    if (mention === '@all') {
      setInput((prev) => {
        const textOnly = prev.replace(/@\S+/g, '').trim();
        return `@all ${textOnly}`.trim() + ' ';
      });
    } else {
      setInput((prev) => {
        let cleaned = prev.replace(/@all\s*/g, '').trim();
        const regex = new RegExp(`(^|\\s)${mention}(\\s|$)`, 'g');
        if (regex.test(cleaned)) {
          cleaned = cleaned.replace(regex, ' ').replace(/\s+/g, ' ').trim();
          return cleaned ? `${cleaned} ` : '';
        } else {
          return `${mention} ${cleaned}`.trim() + ' ';
        }
      });
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
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Send failed; your draft has been kept.');
    } finally {
      setSending(false);
    }
  };

  const handleCopyCustomPrompt = (agentId: string) => {
    const key = inviteKeyFor(roomCode);
    const prompt = `Connect to CoWork room ${roomCode} as ${agentId} in this repository using cowork_connect${key ? ` with inviteKey ${key}` : ''}.`;
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(agentId);
    setTimeout(() => setCopiedPrompt(null), 2500);
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(roomCode));
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      alert('Clipboard unavailable. Copy the link shown in the QR dialog instead.');
    }
  };

  const handleSendTestPing = async () => {
    await onSendMessage(`👋 Live relay test ping from ${currentClientId}`);
  };

  // Priority and Mentions count
  const mentionsCount = messages.filter((m) => {
    const mentions = m.mentions || [...(m.text?.matchAll(/@([a-zA-Z0-9_-]+)/g) || [])].map(x => x[1]);
    return (
      m.contentType === 'CROSS_PROMPT' ||
      m.priority === 'HIGH' ||
      mentions.length > 0 ||
      (m.targetId && m.targetId !== 'all')
    );
  }).length;

  // Filter messages
  const filteredMessages = messages.filter((m) => {
    if (filter === 'ALL') return true;
    if (filter === 'MENTIONS') {
      const mentions = m.mentions || [...(m.text?.matchAll(/@([a-zA-Z0-9_-]+)/g) || [])].map(x => x[1]);
      return (
        m.contentType === 'CROSS_PROMPT' ||
        m.priority === 'HIGH' ||
        mentions.includes(currentClientId) ||
        mentions.length > 0 ||
        (m.targetId && m.targetId !== 'all') ||
        m.text.includes('@')
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
        return <AtSign className="w-4 h-4 text-accent" strokeWidth={2.2} />;
      case 'GIT_PUSH':
        return <GitCommit className="w-4 h-4 text-accent" strokeWidth={2.2} />;
      case 'FILE_LOCK':
      case 'FILE_UNLOCK':
        return <Lock className="w-4 h-4 text-accent" strokeWidth={2.2} />;
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
            className="inline-flex items-center px-1.5 py-0.2 rounded-sm bg-accent-soft text-accent border border-accent/30 font-mono text-xs font-semibold mr-1"
          >
            {part}
          </span>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const promptPreview = `Connect to CoWork room ${roomCode} as ${
    onboardingAgentId || 'my-agent'
  } in this repository using cowork_connect${inviteKeyFor(roomCode) ? ` with inviteKey ${inviteKeyFor(roomCode)}` : ''}.`;

  return (
    <div className="h-full flex flex-col bg-canvas divide-y divide-grid overflow-hidden">
      {/* 1. Filter Tab Bar */}
      <div className="h-10 bg-panel border-b border-grid flex items-stretch px-1 xs:px-3 divide-x divide-grid select-none shrink-0 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setFilter('ALL')}
          className={`min-tap justify-center gap-1.5 px-3 xs:px-3.5 text-xs font-sans font-medium relative transition-colors flex items-center shrink-0 ${
            filter === 'ALL'
              ? 'text-primary font-semibold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>All<span className="hidden xs:inline"> Events</span></span>
          <span className="text-[11px] font-mono text-muted">({messages.length})</span>
          {filter === 'ALL' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
          )}
        </button>

        <button
          onClick={() => setFilter('MENTIONS')}
          className={`min-tap justify-center gap-1.5 px-3 xs:px-3.5 text-xs font-sans font-medium relative transition-colors flex items-center shrink-0 ${
            filter === 'MENTIONS'
              ? 'text-primary font-semibold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <AtSign className="w-3.5 h-3.5 text-accent" />
          <span><span className="hidden sm:inline">Priority & </span>Mentions</span>
          {mentionsCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-sm bg-accent text-accent-ink font-bold">
              {mentionsCount}
            </span>
          )}
          {filter === 'MENTIONS' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
          )}
        </button>

        <button
          onClick={() => setFilter('GIT')}
          className={`min-tap justify-center gap-1.5 px-3 xs:px-3.5 text-xs font-sans font-medium relative transition-colors flex items-center shrink-0 ${
            filter === 'GIT'
              ? 'text-primary font-semibold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <GitPullRequest className="w-3.5 h-3.5" />
          <span>Git<span className="hidden xs:inline"> Sync</span></span>
          {filter === 'GIT' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
          )}
        </button>

        <button
          onClick={() => setFilter('LOCKS')}
          className={`min-tap justify-center gap-1.5 px-3 xs:px-3.5 text-xs font-sans font-medium relative transition-colors flex items-center shrink-0 ${
            filter === 'LOCKS'
              ? 'text-primary font-semibold'
              : 'text-muted hover:text-secondary'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span><span className="hidden xs:inline">File </span>Locks</span>
          {filter === 'LOCKS' && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent" />
          )}
        </button>
      </div>

      {/* 2. Structured Event Stream OR Interactive Onboarding Card */}
      <div className="flex-1 overflow-y-auto scroll-panel divide-y divide-grid bg-canvas">
        {filteredMessages.length === 0 ? (
          /* Flexible Quick-Start Onboarding Card */
          <div className="p-6 md:p-10 max-w-2xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 bg-accent-soft border border-accent/30 text-accent rounded-sm flex items-center justify-center mx-auto mb-2">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <h2 className="text-base md:text-lg font-semibold font-sans text-primary">
                CoWork Relay Session Active: {roomCode}
              </h2>
              <p className="text-xs md:text-sm font-sans text-secondary max-w-md mx-auto leading-relaxed">
                Your stateless collaboration room is live. Follow these 3 steps to pair agents and begin coding together:
              </p>
            </div>

            <div className="border border-grid rounded-sm bg-panel divide-y divide-grid shadow-card">
              {/* Step 1: Flexible Custom Agent Prompt Generator */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-sm bg-accent text-accent-ink font-mono text-xs font-semibold flex items-center justify-center">
                    1
                  </span>
                  <span className="font-semibold text-xs md:text-sm font-sans text-primary">
                    Connect Your Antigravity AI Agent
                  </span>
                </div>
                <p className="text-xs text-secondary font-sans pl-7">
                  Type any agent handle you want to assign, or pick a suggestion:
                </p>

                <div className="pl-7 space-y-2.5">
                  {/* Custom Handle Input + Chips */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-accent font-semibold">
                        @
                      </span>
                      <input
                        type="text"
                        value={onboardingAgentId}
                        onChange={(e) =>
                          setOnboardingAgentId(
                            e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase()
                          )
                        }
                        placeholder="agent handle (e.g. cursor-ai, claude-code)"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="w-full bg-canvas border border-grid rounded-sm pl-7 pr-3 py-2 text-xs font-mono text-primary font-semibold placeholder:text-muted focus:outline-none focus:border-accent"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      {agentSuggestions.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onClick={() => setOnboardingAgentId(suggestion)}
                            className={`px-2 py-1 text-[11px] font-mono rounded-sm border transition-colors shrink-0 ${
                              onboardingAgentId === suggestion
                                ? 'bg-accent text-accent-ink border-accent font-semibold shadow-card'
                                : 'bg-canvas hover:bg-hover text-secondary border-grid'
                            }`}
                          >
                            @{suggestion}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Live Prompt Preview + Copy Button */}
                  <div className="flex flex-col sm:flex-row items-stretch gap-2 pt-0.5">
                    <div className="flex-1 bg-canvas border border-grid rounded-sm px-3 py-2 font-mono text-xs text-secondary truncate flex items-center select-all">
                      <span className="text-primary truncate">{promptPreview}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyCustomPrompt(onboardingAgentId || 'this-agent')}
                      className="px-4 py-2 bg-accent hover:bg-accent-strong text-accent-ink text-xs font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 shrink-0 shadow-card"
                    >
                      {copiedPrompt ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Copied Prompt!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Connect Prompt</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-sm bg-accent text-accent-ink font-mono text-xs font-semibold flex items-center justify-center">
                    2
                  </span>
                  <span className="font-semibold text-xs md:text-sm font-sans text-primary">
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
                      <Check className="w-3.5 h-3.5 text-accent" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-accent" />
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
                  <span className="w-5 h-5 rounded-sm bg-accent text-accent-ink font-mono text-xs font-semibold flex items-center justify-center">
                    3
                  </span>
                  <span className="font-semibold text-xs md:text-sm font-sans text-primary">
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
                    className="py-2 px-4 bg-accent hover:bg-accent-strong text-accent-ink rounded-sm text-xs font-sans font-semibold flex items-center gap-2 transition-colors shadow-card"
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
            const clock = new Date(msg.timestamp).toLocaleTimeString([], {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
            // Seconds only pay for themselves once there is room for them.
            const timeStr = clock.slice(0, 5);
            const timeSec = clock.slice(5);
            const isSelf = msg.senderId === currentClientId;

            // Multiple tagging & High Priority detection
            const parsedMentions = [...new Set([...(msg.text?.matchAll(/@([a-zA-Z0-9_-]+)/g) || [])].map(m => m[1]))];
            const allMentions = msg.mentions && msg.mentions.length > 0 ? msg.mentions : parsedMentions;
            const isPriority = msg.priority === 'HIGH' || allMentions.length > 0 || (msg.targetId && msg.targetId !== 'all') || msg.contentType === 'CROSS_PROMPT';
            const isDirectedAtMe = allMentions.includes(currentClientId) || msg.targetId === currentClientId;

            return (
              <div
                key={msg.messageId}
                className={`px-3 xs:px-4 py-2.5 xs:py-3.5 flex items-start gap-2.5 xs:gap-3 transition-colors ${
                  isDirectedAtMe
                    ? 'bg-accent/10 border-l-4 border-accent pl-2.5 xs:pl-3.5 shadow-sm'
                    : isPriority
                      ? 'bg-panel/40 border-l-2 border-accent/60 pl-3 xs:pl-3.5'
                      : isSelf
                        ? 'bg-panel/20'
                        : 'hover:bg-hover/30'
                }`}
              >
                {/* Timestamp */}
                <div className="font-mono text-[11px] xs:text-xs text-muted shrink-0 pt-0.5 select-none font-medium w-[34px] xs:w-auto">
                  {timeStr}
                  <span className="hidden xs:inline">{timeSec}</span>
                </div>

                {/* Event Type Icon */}
                <div className="shrink-0 pt-0.5">
                  {isPriority ? (
                    <Zap className="w-4 h-4 text-accent fill-accent" strokeWidth={1.5} />
                  ) : (
                    getTypeIcon(msg.contentType)
                  )}
                </div>

                {/* Content Area */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 xs:gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handlePillClick(`@${msg.senderId}`)}
                      className="font-mono text-xs font-semibold text-primary hover:text-accent transition-colors text-left"
                      title={`Click to tag @${msg.senderId}`}
                    >
                      @{msg.senderId}
                    </button>
                    <ArrowRight className="w-3 h-3 text-muted shrink-0" />
                    {allMentions.length > 0 ? (
                      <div className="flex items-center gap-1 flex-wrap">
                        {allMentions.map((m) => (
                          <span
                            key={m}
                            className={`font-mono text-xs font-semibold px-1.5 py-0.2 rounded-sm border ${
                              m === currentClientId
                                ? 'bg-accent text-accent-ink border-accent font-bold'
                                : 'bg-panel text-accent border-accent/40'
                            }`}
                          >
                            @{m}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="font-mono text-xs font-semibold text-accent">
                        @{msg.targetId}
                      </span>
                    )}
                    <span className="font-mono text-2xs uppercase px-1.5 py-0.2 rounded-sm bg-panel text-muted border border-grid">
                      {msg.contentType}
                    </span>

                    {/* High Priority & Direct Mention Badges */}
                    {isDirectedAtMe && (
                      <span className="font-mono text-2xs uppercase px-1.5 py-0.5 rounded-sm bg-accent text-accent-ink font-bold flex items-center gap-1 shadow-card">
                        <Zap className="w-2.5 h-2.5 fill-current" />
                        DIRECTED AT YOU
                      </span>
                    )}
                    {!isDirectedAtMe && isPriority && (
                      <span className="font-mono text-2xs uppercase px-1.5 py-0.5 rounded-sm bg-accent-soft text-accent border border-accent/30 font-semibold flex items-center gap-1">
                        <Zap className="w-2.5 h-2.5 fill-current" />
                        HIGH PRIORITY
                      </span>
                    )}
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
                      <span className="font-mono text-xs bg-panel px-2 py-0.5 rounded-sm border border-grid text-accent font-semibold">
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
          <div className="absolute bottom-full left-4 mb-2 bg-panel border border-grid rounded-sm shadow-float py-1 z-30 w-52 divide-y divide-grid">
            <div className="px-3 py-1 text-2xs font-mono text-muted uppercase">
              SELECT TARGET MENTION
            </div>
            {quickTargets.map((mention) => (
              <button
                key={mention}
                type="button"
                onClick={() => handleSelectMention(mention)}
                className="w-full text-left px-3 py-1.5 text-xs font-mono text-primary hover:bg-accent hover:text-accent-ink transition-colors flex items-center justify-between"
              >
                <span>{mention}</span>
                <span className="text-2xs opacity-70">tab/click</span>
              </button>
            ))}
          </div>
        )}

        {/* Row 1: Quick Target Mention Bar with Multiple Tagging Support */}
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 border-b border-grid overflow-x-auto no-scrollbar bg-hover/30 overscroll-x-contain">
          <span className="text-2xs font-mono uppercase text-muted shrink-0 mr-1 flex items-center gap-1 font-semibold select-none">
            <AtSign className="w-3 h-3 text-accent" />
            <span className="hidden xs:inline">TAG </span>TARGETS:
          </span>
          {quickTargets.map((mention) => {
            const isSelected = new RegExp(`(^|\\s)${mention}(\\s|$)`).test(input);
            return (
              <button
                key={mention}
                type="button"
                onClick={() => handlePillClick(mention)}
                className={`px-2.5 py-1 sm:py-0.5 rounded-sm text-xs font-mono transition-all shrink-0 border flex items-center gap-1 active:scale-95 ${
                  isSelected
                    ? 'bg-accent text-accent-ink border-accent font-semibold shadow-card'
                    : 'bg-panel hover:bg-hover text-secondary hover:text-primary border-grid'
                }`}
              >
                <span>{mention}</span>
                {isSelected && mention !== '@all' && (
                  <span className="text-[10px] opacity-75 hover:opacity-100 font-bold ml-0.5">✕</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Row 2: 100% Flush Edge-to-Edge Input & Dispatch Button (h-14) */}
        <form onSubmit={handleSubmit} className="h-13 xs:h-14 flex items-stretch">
          <div className="pl-3 sm:pl-4 pr-1.5 sm:pr-2 flex items-center text-accent shrink-0 bg-canvas">
            <Terminal className="w-4 h-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Message room, or @handle..."
            enterKeyHint="send"
            autoComplete="off"
            className="flex-1 bg-canvas h-full px-2 text-[16px] md:text-sm text-primary placeholder:text-muted focus:outline-none font-sans font-medium"
          />

          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="h-full min-w-[50px] px-3.5 xs:px-6 bg-accent hover:bg-accent-strong disabled:opacity-40 text-accent-ink font-sans font-semibold text-sm flex items-center justify-center gap-2 transition-all shrink-0 select-none shadow-card active:scale-[0.98]"
          >
            <Send className="w-4 h-4" />
            <span className="hidden xs:inline">DISPATCH</span>
          </button>
        </form>
      </div>
    </div>
  );
};
