import React from 'react';
import { AtSign, Bot, GitPullRequest, Layers, Lock } from 'lucide-react';
import type { FilterType } from './ChatTerminal.js';

/**
 * The single mobile navigation row.
 *
 * Before this existed a phone showed two stacked bars that both looked like tab bars: one switching
 * between the stream and the agent HUD, one filtering the stream. They are the same decision - what
 * am I looking at right now - so they are one row: the four feed filters, then the HUD. The filters
 * stay visible while the HUD is open and tapping any of them walks back to the stream with that
 * filter applied, which is why the row never has to swap its own contents.
 *
 * Desktop is untouched: >=md renders ChatTerminal's own labelled filter bar and puts the HUD beside
 * the stream, so this component is `md:hidden`.
 */
export interface FeedNavProps {
  /** The stream's active filter. Ignored (and rendered inactive) while `agentsActive` is true. */
  filter: FilterType;
  agentsActive: boolean;
  /** Feed size, shown only when non-zero - "(0)" on a tab is decoration, not information. */
  eventCount: number;
  mentionCount: number;
  /** Agents online right now. Zero hides the badge rather than showing a dead "0". */
  agentCount: number;
  onSelectFilter: (filter: FilterType) => void;
  onSelectAgents: () => void;
}

const FEEDS: Array<{ id: FilterType; label: string; icon: React.FC<{ className?: string }> }> = [
  { id: 'ALL', label: 'All', icon: Layers },
  { id: 'MENTIONS', label: 'Mentions', icon: AtSign },
  { id: 'GIT', label: 'Git', icon: GitPullRequest },
  { id: 'LOCKS', label: 'Locks', icon: Lock },
];

export const FeedNav: React.FC<FeedNavProps> = ({
  filter,
  agentsActive,
  eventCount,
  mentionCount,
  agentCount,
  onSelectFilter,
  onSelectAgents,
}) => {
  const chip = (active: boolean) =>
    `min-tap relative flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-xs font-sans font-medium transition-all shrink-0 ${
      active ? 'bg-accent/15 text-accent font-semibold' : 'text-secondary hover:text-primary hover:bg-hover/60'
    }`;

  return (
    <nav
      aria-label="Feed"
      className="md:hidden min-h-11 bg-panel/95 backdrop-blur-md border-b border-grid/60 px-2.5 pr-3.5 py-1 flex items-center gap-1 shrink-0 select-none overflow-x-auto no-scrollbar scroll-px-2.5"
    >
      {FEEDS.map(({ id, label, icon: Icon }) => {
        const active = !agentsActive && filter === id;
        const count = id === 'ALL' ? eventCount : id === 'MENTIONS' ? mentionCount : 0;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelectFilter(id)}
            aria-pressed={active}
            className={chip(active)}
          >
            <Icon className={`w-3.5 h-3.5 ${id === 'MENTIONS' && !active ? 'text-accent' : ''}`} />
            <span>{label}</span>
            {count > 0 && <span className="text-[10px] font-mono text-muted">{count}</span>}
            {active && <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onSelectAgents}
        aria-pressed={agentsActive}
        className={`min-tap relative flex items-center justify-center gap-1.5 px-3 py-1 ml-auto rounded-lg text-xs font-sans font-medium transition-all shrink-0 ${
          agentsActive ? 'bg-accent/15 text-accent font-semibold' : 'text-secondary hover:text-primary hover:bg-hover/60'
        }`}
      >
        <Bot className="w-3.5 h-3.5" />
        <span>Agents</span>
        {agentCount > 0 && (
          <span className="flex items-center gap-1 text-2xs font-mono text-ok font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
            {agentCount}
          </span>
        )}
        {agentsActive && <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-accent rounded-full" />}
      </button>
    </nav>
  );
};
