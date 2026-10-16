import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Clock,
  FileCode,
  GitBranch,
  Layers,
  Pause,
  Play,
  ShieldAlert,
  Sparkles,
  Terminal,
} from 'lucide-react';
import type { ActivityInfo, ActivityState, ParticipantInfo } from '../../api/_types.js';
import { timeAgo } from '../notifications.js';

interface ActivityRailProps {
  /** Participants as of the last poll - the rail never fetches on its own. */
  participants: Record<string, ParticipantInfo>;
  /** This session's client id, so your own row reads "you". */
  currentClientId?: string;
}

// Everything the rail can show comes from the token vocabulary in index.css / tailwind.config.js.
const META: Record<ActivityState, { label: string; Icon: typeof Activity; tone: string; dot: string }> = {
  idle: { label: 'IDLE', Icon: Clock, tone: 'text-muted bg-hover', dot: 'bg-muted/50' },
  thinking: { label: 'THINKING', Icon: Sparkles, tone: 'text-accent bg-accent-soft', dot: 'bg-accent' },
  reading: { label: 'READING', Icon: FileCode, tone: 'text-accent bg-accent-soft', dot: 'bg-accent' },
  editing: { label: 'EDITING', Icon: Layers, tone: 'text-accent bg-accent-soft', dot: 'bg-accent' },
  testing: { label: 'TESTING', Icon: Play, tone: 'text-accent bg-accent-soft', dot: 'bg-accent' },
  debugging: { label: 'DEBUGGING', Icon: Terminal, tone: 'text-warn bg-warn-soft', dot: 'bg-warn' },
  syncing: { label: 'SYNCING', Icon: GitBranch, tone: 'text-accent bg-accent-soft', dot: 'bg-accent' },
  reviewing: { label: 'REVIEWING', Icon: ShieldAlert, tone: 'text-ok bg-ok-soft', dot: 'bg-ok' },
  blocked: { label: 'BLOCKED', Icon: Pause, tone: 'text-danger bg-danger-soft', dot: 'bg-danger' },
  done: { label: 'DONE', Icon: CircleDot, tone: 'text-ok bg-ok-soft', dot: 'bg-ok' },
  error: { label: 'ERROR', Icon: ShieldAlert, tone: 'text-danger bg-danger-soft', dot: 'bg-danger' },
};

const META_FALLBACK = META.idle;

/** Past this delay the row stops pulsing and dims: the agent stopped heartbeating, not just thinking. */
const STALE_AFTER_MS = 90_000;

/** Status strings that carry no information worth showing as a one-liner. */
const GENERIC_SUMMARY = /^(idle\s*\/\s*(connected|synced)|listening for instructions.*|waiting for input.*)$/i;

const shortenPath = (path: string): string => {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join('/') : path;
};

/**
 * Live working state for every agent in the room: what it is doing, which files it is touching, and -
 * under Show more - the reasoning it chose to publish.
 *
 * This is presence, not chat. The relay overwrites each agent's activity on every 2s heartbeat, so the
 * rail always shows the current moment, it never fills the message history, and a row quietly stops
 * pulsing when that agent's heartbeat lapses.
 */
export const ActivityRail: React.FC<ActivityRailProps> = ({ participants, currentClientId }) => {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [now, setNow] = useState(() => Date.now());

  // On mobile devices, default the activity rail to collapsed so it does not clutter the screen like a cockpit.
  // Initial state remains `true` for SSR / static markup tests (which assert rendered rows without executing effects).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setOpen(false);
    }
  }, []);

  // One shared tick makes "12s ago" move and fades stale rows; it only runs while the rail is open.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const rows = useMemo(() => {
    return Object.entries(participants)
      .filter(([, p]) => Boolean(p.activity))
      .map(([id, p]) => {
        const activity = p.activity as ActivityInfo;
        return {
          id,
          activity,
          isSelf: id === currentClientId,
          quiet: now - (activity.at ?? 0) > STALE_AFTER_MS,
          elapsed: now - (activity.at ?? 0),
        };
      })
      .sort((a, b) => {
        if (a.isSelf) return -1;
        if (b.isSelf) return 1;
        return (b.activity.at ?? 0) - (a.activity.at ?? 0);
      });
  }, [participants, currentClientId, now]);

  if (!rows.length) {
    // An agent that heartbeats with a current bundle always carries a state, because the poller derives
    // one from its status line. So "connected, no row" is a diagnosable condition, not an empty room -
    // and silence here reads exactly like a broken panel. Say which of the two it is.
    const quiet = Object.entries(participants).filter(
      ([, p]) => p.role === 'agent' && now - (p.lastSeen ?? 0) < STALE_AFTER_MS
    );
    if (!quiet.length) return null;
    return (
      <div className="shrink-0 bg-panel px-3 xs:px-4 py-2 border-b border-grid" data-id="activity-rail-empty">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
          <span className="text-2xs font-sans font-semibold uppercase tracking-[0.14em] text-secondary truncate">
            {quiet.map(([id]) => `@${id}`).join(', ')}{' '}
            {quiet.length === 1 ? 'is' : 'are'} connected and reporting no state
          </span>
        </div>
        <p className="mt-1 text-2xs font-sans text-muted leading-snug">
          That means the client on that machine is older than the activity stream or runs with activity
          reporting off. Check it there with{' '}
          <span className="font-mono text-secondary">node install.mjs --check</span> - the dashboard and
          the relay cannot supply what the agent never sends.
        </p>
      </div>
    );
  }
  const liveCount = rows.filter((r) => !r.quiet).length;

  return (
    <div className="shrink-0 bg-panel select-none" data-id="activity-rail">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-id="activity-rail-toggle"
        className="min-tap w-full flex items-center gap-2 px-3 xs:px-4 py-1.5 xs:py-2 border-b border-grid/70 bg-panel/70 hover:bg-hover transition-colors"
      >
        <Activity className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="text-2xs font-sans font-semibold uppercase tracking-[0.14em] text-secondary">
          Live activity
        </span>
        <span className="text-2xs font-mono tabular-nums text-muted">
          {liveCount}/{rows.length}
        </span>
        {liveCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse shrink-0" aria-hidden="true" />
        )}
        <span className="ml-auto flex items-center gap-1 text-2xs font-sans text-muted">
          {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          <span className="hidden xs:inline">{open ? 'Hide' : 'Show'}</span>
        </span>
      </button>

      {open && (
        <ul className="max-h-52 xs:max-h-64 overflow-y-auto divide-y divide-grid/60 scroll-panel bg-panel/40" aria-live="polite">
          {rows.map(({ id, activity, isSelf, quiet, elapsed }) => {
            const meta = META[activity.state] ?? META_FALLBACK;
            const { Icon } = meta;
            const files = activity.files ?? [];
            const shownFiles = files.slice(0, 6);
            const hidden = files.length - shownFiles.length;
            const isExpanded = Boolean(expanded[id]);
            const summary = activity.summary ?? '';
            const showSummary = summary && !GENERIC_SUMMARY.test(summary);

            return (
              <li key={id} className={`px-3 xs:px-4 py-2 transition-opacity${quiet ? ' opacity-55' : ''}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot} ${quiet || activity.state === 'idle' ? '' : 'animate-pulse'}`}
                    aria-hidden="true"
                  />
                  <Bot className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                  <span className="text-xs font-mono font-semibold uppercase text-primary truncate">
                    @{id}
                  </span>
                  {isSelf && (
                    <span className="text-2xs font-sans text-muted border border-grid rounded-sm px-1 shrink-0">
                      you
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-2xs font-sans font-semibold uppercase tracking-wider shrink-0 ${meta.tone}`}
                  >
                    <Icon className="w-3 h-3" aria-hidden="true" />
                    {meta.label}
                  </span>
                  <span className="ml-auto text-2xs font-mono tabular-nums text-muted shrink-0">
                    {timeAgo(elapsed)}
                  </span>
                </div>

                <p className="mt-1 text-xs font-sans text-secondary break-words leading-snug">
                  {showSummary ? (
                    summary
                  ) : (
                    <span className="italic text-muted">
                      no narration yet - this agent has not called cowork_report
                    </span>
                  )}
                  {activity.tool && (
                    <span className="ml-1.5 font-mono text-2xs text-muted">via {activity.tool}</span>
                  )}
                </p>

                {files.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1" aria-label={`Files @${id} is touching`}>
                    {shownFiles.map((f) => (
                      <span
                        key={f}
                        title={f}
                        className="max-w-[16rem] truncate rounded-sm border border-grid bg-canvas px-1.5 py-0.5 font-mono text-2xs text-secondary"
                      >
                        {shortenPath(f)}
                      </span>
                    ))}
                    {hidden > 0 && (
                      <span className="rounded-sm px-1 py-0.5 font-mono text-2xs text-muted">
                        +{hidden} more
                      </span>
                    )}
                  </div>
                )}

                {activity.detail && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => setExpanded((v) => ({ ...v, [id]: !v[id] }))}
                      aria-expanded={isExpanded}
                      data-id={`activity-more-${id}`}
                      className="inline-flex items-center gap-1 rounded-sm border border-grid bg-canvas px-1.5 py-1 text-2xs font-sans font-semibold uppercase tracking-wider text-muted hover:text-accent hover:border-accent/40 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExpanded ? 'Show less' : 'Show more'}
                      <span className="font-mono text-muted font-normal">{activity.detail.length}c</span>
                    </button>
                    {isExpanded && (
                      <div className="mt-1.5 rounded-sm border-l-2 border-accent bg-canvas px-2.5 py-2 text-xs font-sans text-secondary leading-relaxed whitespace-pre-wrap break-words shadow-card">
                        {activity.detail}
                        {activity.truncated && (
                          <p className="mt-1.5 text-2xs italic text-warn">
                            clipped by the relay - the agent sent more than the detail limit allows
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
