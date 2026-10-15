import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FeedNav } from '../src/components/FeedNav.js';

const render = (props: Partial<React.ComponentProps<typeof FeedNav>> = {}) =>
  renderToStaticMarkup(
    React.createElement(FeedNav, {
      filter: 'ALL',
      agentsActive: false,
      eventCount: 12,
      mentionCount: 0,
      agentCount: 0,
      onSelectFilter: vi.fn(),
      onSelectAgents: vi.fn(),
      ...props,
    })
  );

const buttons = (html: string) => (html.match(/<button/g) ?? []).length;

describe('FeedNav', () => {
  it('is one row that replaces the two stacked mobile bars', () => {
    const html = render();
    // The old design had a mobile tab bar in App plus a filter bar in ChatTerminal, both looking like
    // tab bars. This row is the mobile-only replacement and never renders at >= md.
    expect(html).toContain('md:hidden');
    expect(html).toContain('aria-label="Feed"');
    expect(buttons(html)).toBe(5); // All, Mentions, Git, Locks, Agents
    expect(html).toContain('>All<');
    expect(html).toContain('>Mentions<');
    expect(html).toContain('>Git<');
    expect(html).toContain('>Locks<');
    expect(html).toContain('>Agents<');
  });

  it('marks the active filter pressed and keeps the count quiet at zero', () => {
    const html = render({ filter: 'GIT', eventCount: 0 });
    expect(html).toContain('aria-pressed="true"');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    // "All (0)" and "0 agents" are decoration; a number only earns its place when it is non-zero.
    expect(html).not.toContain('>0<');
    expect(html).toContain('>Git<');
  });

  it('shows the feed size and the online agent count when they are real', () => {
    const html = render({ eventCount: 12, mentionCount: 3, agentCount: 2 });
    expect(html).toContain('>12<');
    expect(html).toContain('>3<');
    expect(html).toContain('>2<');
    expect(html).toContain('animate-pulse'); // the same live dot the roster uses
  });

  it('hands the underline to Agents without hiding the filters', () => {
    const onSelectFilter = vi.fn();
    const html = render({ agentsActive: true, onSelectFilter });
    // The chips stay visible while the HUD is up, so walking back is one tap on the thing you wanted.
    expect(buttons(html)).toBe(5);
    expect(html).toContain('aria-pressed="true"');
    // ...and it belongs to the Agents button, which is last, not to a filter chip.
    const agents = html.slice(html.lastIndexOf('<button'));
    expect(agents).toContain('aria-pressed="true"');
    expect(html.slice(0, html.lastIndexOf('<button'))).not.toContain('aria-pressed="true"');
  });
});
