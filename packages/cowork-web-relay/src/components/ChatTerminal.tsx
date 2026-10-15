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
  ChevronDown,
  ChevronUp,
  User,
} from 'lucide-react';
import type { CoWorkMessage, ContentType, ParticipantInfo } from '../../api/_types.js';
import { inviteKeyFor, inviteLink } from '../relay.js';
import { GitMerge } from 'lucide-react';
import { ActivityRail } from './ActivityRail.js';

interface ChatTerminalProps {
  messages: CoWorkMessage[];
  participants: Record<string, ParticipantInfo>;
  currentClientId: string;
  roomCode?: string;
  /** Shared with the repo already linked for this room, so a pasted link configures the agent fully. */
  repoUrl?: string;
  onSendMessage: (text: string) => Promise<void>;
  onShowQr?: () => void;
  prefilledInput?: string;
  onClearPrefill?: () => void;
  /** Set when a system notification was clicked: that message is scrolled to and ringed once. */
  focusMessageId?: string;
  onFocusHandled?: () => void;
}

type FilterType = 'ALL' | 'MENTIONS' | 'GIT' | 'LOCKS';

export const ChatTerminal: React.FC<ChatTerminalProps> = ({
  messages,
  participants,
  currentClientId,
  roomCode = 'SED-409',
  repoUrl,
  onSendMessage,
  onShowQr,
  prefilledInput,
  onClearPrefill,
  focusMessageId = '',
  onFocusHandled,
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

  // A banner clicked outside the tab should land on the message it was about. The stream filter is
  // cleared first, because a message hidden by the current filter is indistinguishable from a
  // message that never arrived - and the ring has to be dropped again, or it stays forever.
  useEffect(() => {
    if (!focusMessageId) return;
    let ring: ReturnType<typeof setTimeout> | null = null;
    const reveal = () => {
      const node = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(focusMessageId)}"]`);
      if (!node) {
        setFilter('ALL');
        requestAnimationFrame(() => {
          const found = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(focusMessageId)}"]`);
          found?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          ring = setTimeout(() => onFocusHandled?.(), 2600);
        });
        return;
      }
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ring = setTimeout(() => onFocusHandled?.(), 2600);
    };
    reveal();
    return () => {
      if (ring) clearTimeout(ring);
    };
  }, [focusMessageId]);

  const focusRing = (messageId: string) =>
    focusMessageId === messageId ? ' rounded-xl ring-2 ring-accent/70' : '';
  const streamEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const prevMessagesLengthRef = useRef(messages.length);

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState(0);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  const isUserInteractingRef = useRef(false);
  const interactTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startUserInteraction = () => {
    isUserInteractingRef.current = true;
    if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
  };

  const endUserInteraction = () => {
    if (interactTimeoutRef.current) clearTimeout(interactTimeoutRef.current);
    interactTimeoutRef.current = setTimeout(() => {
      isUserInteractingRef.current = false;
    }, 1200);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY < 0) {
      startUserInteraction();
    }
  };

  const toggleExpand = (messageId: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }));
  };

  const isMessageLong = (text: string) => {
    if (!text) return false;
    const lineCount = (text.match(/\n/g) || []).length + 1;
    return text.length > 150 || lineCount > 3;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    streamEndRef.current?.scrollIntoView({ behavior });
    setIsScrolledUp(false);
    setUnreadWhileScrolled(0);
    isNearBottomRef.current = true;
  };

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Strict threshold: user is only at the bottom if within 35px
    const atBottom = distanceToBottom <= 35;
    isNearBottomRef.current = atBottom;
    setIsScrolledUp(!atBottom);
    if (atBottom) {
      setUnreadWhileScrolled(0);
    }
  };

  useEffect(() => {
    const countDiff = messages.length - prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = messages.length;

    const lastMsg = messages[messages.length - 1];
    const isSelfLast = lastMsg && lastMsg.senderId === currentClientId;

    // Self messages always scroll immediately
    if (isSelfLast) {
      scrollToBottom('smooth');
      return;
    }

    // Only scroll background messages if user is sitting at bottom AND not touching/scrolling
    if (isNearBottomRef.current && !isUserInteractingRef.current) {
      scrollToBottom('smooth');
    } else if (countDiff > 0) {
      setUnreadWhileScrolled((prev) => prev + countDiff);
    }
  }, [messages, currentClientId]);

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

  // One template for both the preview and the copied text, so they can never drift apart.
  const onboardingPrompt = (agentId: string) => {
    const key = inviteKeyFor(roomCode);
    return (
      `Connect to CoWork room ${roomCode} as ${agentId} in this repository using cowork_connect${key ? ` with inviteKey ${key}` : ''}. ` +
      `Then keep the room current: call cowork_report when you start, before a large edit, when you are ` +
      `blocked and when you finish, so the dashboard shows what you are doing.`
    );
  };

  const handleCopyCustomPrompt = (agentId: string) => {
    const prompt = onboardingPrompt(agentId);
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(agentId);
    setTimeout(() => setCopiedPrompt(null), 2500);
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(roomCode, repoUrl));
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
    if (filter === 'GIT') return m.contentType === 'GIT_PUSH' || m.contentType === 'GIT_REPO';
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

  const promptPreview = onboardingPrompt(onboardingAgentId || 'my-agent');

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
      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onTouchStart={startUserInteraction}
          onTouchEnd={endUserInteraction}
          onTouchMove={startUserInteraction}
          onWheel={handleWheel}
          className="flex-1 overflow-y-auto scroll-panel bg-canvas p-3 xs:p-4 space-y-2"
        >
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
            const timeStr = clock.slice(0, 5);
            const isSelf = msg.senderId === currentClientId;

            // System Event: GIT_PUSH
            if (msg.contentType === 'GIT_PUSH') {
              return (
                <div key={msg.messageId} className="flex justify-center my-2 select-none">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-panel border border-grid rounded-full shadow-sm text-xs font-mono max-w-full">
                    <GitPullRequest className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-secondary font-medium shrink-0">@{msg.senderId} pushed</span>
                    {msg.commitHash && (
                      <span className="px-1.5 py-0.2 rounded bg-hover text-accent font-semibold border border-grid shrink-0">
                        {msg.commitHash.slice(0, 7)}
                      </span>
                    )}
                    {msg.text && (
                      <span className="text-muted text-[11px] truncate max-w-[180px] xs:max-w-[280px]">
                        {msg.text}
                      </span>
                    )}
                    <span className="text-muted text-2xs shrink-0">{timeStr}</span>
                  </div>
                </div>
              );
            }

            // System Event: GIT_REPO - the room deciding which repository everyone works in
            if (msg.contentType === 'GIT_REPO') {
              return (
                <div key={msg.messageId} className="flex justify-center my-2 select-none">
                  <div className="flex max-w-full items-center gap-2 rounded-full border border-grid bg-panel px-3 py-1.5 text-xs font-mono shadow-sm">
                    <GitMerge className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="shrink-0 font-medium text-secondary">@{msg.senderId} linked the room repository</span>
                    <span className="max-w-[180px] truncate font-semibold text-accent xs:max-w-[280px]" title={msg.text}>
                      {msg.text?.replace(/^https?:\/\//, '').replace(/^ssh:\/\/git@/, '')}
                    </span>
                    <span className="shrink-0 text-2xs text-muted">{timeStr}</span>
                  </div>
                </div>
              );
            }

            // System Event: FILE_LOCK
            if (msg.contentType === 'FILE_LOCK') {
              return (
                <div key={msg.messageId} className="flex justify-center my-2 select-none">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-panel border border-grid rounded-full shadow-sm text-xs font-mono max-w-full">
                    <Lock className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="text-secondary font-medium shrink-0">@{msg.senderId} locked</span>
                    <span className="text-accent font-semibold truncate max-w-[180px] xs:max-w-[260px]">
                      {msg.files?.join(', ') || 'files'}
                    </span>
                    <span className="text-muted text-2xs shrink-0">{timeStr}</span>
                  </div>
                </div>
              );
            }

            // Multiple tagging & High Priority detection
            const parsedMentions = [...new Set([...(msg.text?.matchAll(/@([a-zA-Z0-9_-]+)/g) || [])].map(m => m[1]))];
            const allMentions = msg.mentions && msg.mentions.length > 0 ? msg.mentions : parsedMentions;
            const isPriority = msg.priority === 'HIGH' || allMentions.length > 0 || (msg.targetId && msg.targetId !== 'all') || msg.contentType === 'CROSS_PROMPT';
            const isDirectedAtMe = allMentions.includes(currentClientId) || msg.targetId === currentClientId;

            // Self Message: Right-Aligned Speech Bubble
            if (isSelf) {
              const isLong = isMessageLong(msg.text);
              const isExpanded = !!expandedMap[msg.messageId];

              return (
                <div
                  key={msg.messageId}
                  data-message-id={msg.messageId}
                  className={`flex justify-end my-1 select-text${focusRing(msg.messageId)}`}
                >
                  <div className="flex flex-col items-end max-w-[85%] sm:max-w-[72%] space-y-1">
                    <div className="bg-accent text-accent-ink rounded-2xl rounded-tr-xs px-3.5 sm:px-4 py-2 sm:py-2.5 shadow-card break-words text-[14px] font-sans font-medium leading-relaxed">
                      {isLong && !isExpanded ? (
                        <div>
                          <div className="relative">
                            <div className="max-h-24 overflow-hidden whitespace-pre-wrap select-text">
                              {renderFormattedText(msg.text)}
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-t from-accent to-transparent" />
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(msg.messageId);
                            }}
                            className="mt-1.5 flex items-center gap-1 text-2xs font-mono font-bold bg-accent-strong hover:opacity-90 px-2.5 py-1 rounded-sm transition-all select-none cursor-pointer"
                            aria-expanded={false}
                          >
                            <ChevronDown className="w-3 h-3" />
                            <span>Show more</span>
                          </button>
                        </div>
                      ) : isLong && isExpanded ? (
                        <div>
                          <div className="whitespace-pre-wrap select-text">
                            {renderFormattedText(msg.text)}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpand(msg.messageId);
                            }}
                            className="mt-1.5 flex items-center gap-1 text-2xs font-mono font-bold bg-accent-strong hover:opacity-90 px-2.5 py-1 rounded-sm transition-all select-none cursor-pointer"
                            aria-expanded={true}
                          >
                            <ChevronUp className="w-3 h-3" />
                            <span>Show less</span>
                          </button>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap select-text">
                          {renderFormattedText(msg.text)}
                        </div>
                      )}

                      {msg.files && msg.files.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1.5 opacity-90">
                          {msg.files.map((f) => (
                            <span key={f} className="text-xs font-mono bg-accent-strong px-2 py-0.5 rounded-sm">
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-2xs font-mono text-muted pr-1 select-none">
                      <span>{timeStr}</span>
                      <Check className="w-3 h-3 text-accent" strokeWidth={2.5} />
                    </div>
                  </div>
                </div>
              );
            }

            // Peer / AI Agent Message: Left-Aligned Speech Bubble
            const isLong = isMessageLong(msg.text);
            const isExpanded = !!expandedMap[msg.messageId];
            const isAgent = msg.senderId.includes('ai');

            return (
              <div
                key={msg.messageId}
                data-message-id={msg.messageId}
                className={`flex justify-start my-1.5 select-text${focusRing(msg.messageId)}`}
              >
                <div className="flex flex-col items-start max-w-[88%] sm:max-w-[75%] space-y-1">
                  {/* Sender Header */}
                  <div className="flex items-center gap-1.5 pl-1 select-none flex-wrap">
                    <button
                      type="button"
                      onClick={() => handlePillClick(`@${msg.senderId}`)}
                      className="font-mono text-xs font-semibold text-primary hover:text-accent flex items-center gap-1 transition-colors"
                      title={`Tag @${msg.senderId}`}
                    >
                      {isAgent ? (
                        <Bot className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-secondary" />
                      )}
                      <span>@{msg.senderId}</span>
                    </button>

                    {isDirectedAtMe && (
                      <span className="px-1.5 py-0.2 rounded-full bg-accent text-accent-ink text-2xs font-bold font-mono flex items-center gap-0.5 shadow-card">
                        <Zap className="w-2.5 h-2.5 fill-current" /> YOU
                      </span>
                    )}

                    {isPriority && !isDirectedAtMe && (
                      <span className="px-1.5 py-0.2 rounded-full bg-accent-soft text-accent border border-accent/30 text-2xs font-semibold font-mono">
                        PRIORITY
                      </span>
                    )}

                    {isAgent && (
                      <span className="px-1.5 py-0.2 rounded-sm bg-hover text-secondary border border-grid text-2xs font-mono">
                        AGENT
                      </span>
                    )}

                    {allMentions.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {allMentions.map((m) => (
                          <span
                            key={m}
                            className={`font-mono text-2xs px-1 rounded-sm border ${
                              m === currentClientId
                                ? 'bg-accent/20 text-accent border-accent/40 font-bold'
                                : 'text-muted border-grid'
                            }`}
                          >
                            @{m}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bubble */}
                  <div
                    className={`rounded-2xl rounded-tl-xs px-3.5 sm:px-4 py-2.5 sm:py-3 shadow-sm break-words text-[14px] font-sans font-medium leading-relaxed ${
                      isDirectedAtMe
                        ? 'bg-panel border-2 border-accent text-primary shadow-float'
                        : 'bg-panel border border-grid text-primary'
                    }`}
                  >
                    {isLong && !isExpanded ? (
                      <div>
                        <div className="relative">
                          <div className="max-h-24 overflow-hidden whitespace-pre-wrap select-text">
                            {renderFormattedText(msg.text)}
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-panel to-transparent" />
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(msg.messageId);
                          }}
                          className="mt-2.5 flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-1 rounded-sm bg-accent-soft/80 hover:bg-accent-soft text-accent border border-accent/30 hover:border-accent transition-all select-none cursor-pointer"
                          aria-expanded={false}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>
                            {isAgent ? 'Expand agent work' : 'Show more'} ({Math.ceil(msg.text.length / 50)} lines)
                          </span>
                        </button>
                      </div>
                    ) : isLong && isExpanded ? (
                      <div>
                        <div className="whitespace-pre-wrap select-text">
                          {renderFormattedText(msg.text)}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(msg.messageId);
                          }}
                          className="mt-2.5 flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-1 rounded-sm bg-hover hover:bg-grid text-secondary hover:text-primary border border-grid transition-all select-none cursor-pointer"
                          aria-expanded={true}
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>Show less</span>
                        </button>
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap select-text">
                        {renderFormattedText(msg.text)}
                      </div>
                    )}

                    {/* Attached files */}
                    {msg.files && msg.files.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {msg.files.map((file) => (
                          <span
                            key={file}
                            className="font-mono text-xs bg-canvas px-2 py-0.5 rounded-sm border border-grid text-secondary font-medium"
                          >
                            {file}
                          </span>
                        ))}
                      </div>
                    )}

                    {msg.commitHash && (
                      <div className="pt-1.5">
                        <span className="font-mono text-xs bg-canvas px-2 py-0.5 rounded-sm border border-grid text-accent font-semibold">
                          {msg.commitHash.slice(0, 7)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="text-2xs font-mono text-muted pl-1 select-none">
                    {timeStr}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={streamEndRef} />
      </div>

      {/* Floating Scroll-to-Bottom Down-Arrow Button */}
      {isScrolledUp && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-4 sm:right-6 z-20 flex items-center gap-1.5 px-3.5 py-2 bg-panel/95 hover:bg-panel border border-grid hover:border-accent text-primary rounded-full shadow-float backdrop-blur-md text-xs font-mono font-semibold transition-all animate-bounce cursor-pointer select-none"
          title="Scroll down to latest messages"
          aria-label="Scroll to bottom"
        >
          <ChevronDown className="w-4 h-4 text-accent" strokeWidth={2.5} />
          {unreadWhileScrolled > 0 ? (
            <span className="px-1.5 py-0.2 rounded-full bg-accent text-accent-ink text-2xs font-bold">
              {unreadWhileScrolled} new
            </span>
          ) : (
            <span className="text-2xs text-secondary hidden xs:inline">Jump to bottom</span>
          )}
        </button>
      )}
    </div>

      {/* 2.5 Live working state of every agent - streamed over presence, never through chat */}
      <ActivityRail participants={participants} currentClientId={currentClientId} />

      {/* 3. Command Composer Dock (Flush Edge-to-Edge Input Row) */}
      <div className="bg-panel border-t border-grid shrink-0 relative pb-[max(env(safe-area-inset-bottom),0.65rem)] sm:pb-0">
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
        <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1 sm:py-1.5 border-b border-grid overflow-x-auto no-scrollbar bg-hover/30 overscroll-x-contain">
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

        {/* Row 2: 100% Flush Edge-to-Edge Input & Dispatch Button */}
        <form onSubmit={handleSubmit} className="h-12 xs:h-13 sm:h-14 flex items-stretch">
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
