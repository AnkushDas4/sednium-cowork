import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActivityRail } from '../src/components/ActivityRail.js';

const now = Date.now();

/** Static markup is enough: the rail has no fetching, no effects to await, only state derived from props. */
const render = (participants: any, currentClientId = 'loid') =>
  renderToStaticMarkup(
    React.createElement(ActivityRail, {
      participants,
      currentClientId,
      // ChatTerminal always renders it inside a flex column; provide a bare wrapper.
    }) as React.ReactElement,
  );

describe('ActivityRail', () => {
  it('says nothing about an empty room, and nothing about a room of humans', () => {
    expect(render({})).toBe('');
    // A human never streams state, so a panel about "reporting nothing" would nag the operator.
    expect(render({ loid: { clientId: 'loid', role: 'human', status: 'Idle / Connected', lastSeen: now } })).toBe('');
  });

  it('names an agent that is connected but streaming no state, instead of rendering nothing', () => {
    // A current client derives a state from its status line on every heartbeat, so silence here means a
    // stale bundle or a switched-off reporter. An empty area with no explanation reads as a broken panel.
    const html = render({ 'gem-ai': { clientId: 'gem-ai', role: 'agent', status: 'Idle / Connected', lastSeen: now } });
    expect(html).toContain('data-id="activity-rail-empty"');
    expect(html).toContain('@gem-ai is connected and reporting no state');
    expect(html).toContain('node install.mjs --check');
    expect(html).not.toContain('data-id="activity-rail"'); // not a rail of rows with nothing in them
    expect(html).not.toContain('activity-rail-toggle');
  });

  it('leaves an agent that stopped heartbeating alone - that is a gone agent, not a mute one', () => {
    expect(render({ 'gem-ai': { clientId: 'gem-ai', role: 'agent', status: 'Idle', lastSeen: now - 600_000 } })).toBe('');
  });

  it('shows the state chip, the one-liner and the folded reasoning', () => {
    const html = render({
      'gem-ai': {
        clientId: 'gem-ai', role: 'agent', status: 'editing', lastSeen: now,
        activity: {
          state: 'editing',
          summary: 'threading activity through the poller',
          detail: 'I considered /api/send but it would evict peer chat from history.',
          files: ['packages/cowork-mcp/src/poller.ts'],
          tool: 'cowork_report',
          at: now - 9000,
          since: now - 46_000,
        },
      },
    });
    expect(html).toContain('Live activity');
    expect(html).toContain('@gem-ai');
    expect(html).toContain('EDITING');
    expect(html).toContain('threading activity through the poller');
    expect(html).toContain('via cowork_report');
    // Paths are shortened for narrow screens but the full path stays available as the tooltip.
    expect(html).toContain('src/poller.ts');
    expect(html).toContain('packages/cowork-mcp/src/poller.ts');
    expect(html).toContain('9s ago');
    // Thoughts are folded by default - the button is what opens them.
    expect(html).toContain('Show more');
    expect(html).not.toContain('Show less');
    expect(html).not.toContain('evict peer chat');
    expect(html).toContain('aria-expanded="false"');
  });

  it('labels the local session, counts only rows that are still beating, and folds long file lists', () => {
    const html = render({
      loid: {
        clientId: 'loid', role: 'human', status: 'reviewing', lastSeen: now,
        activity: { state: 'reviewing', summary: 'reading the diff', at: now - 2000 },
      },
      'cursor-ai': {
        clientId: 'cursor-ai', role: 'agent', status: 'testing', lastSeen: now,
        activity: {
          state: 'testing',
          at: now - 20 * 60_000, // silent for 20 minutes: kept, but not counted as live
          files: Array.from({ length: 8 }, (_, n) => `src/mod${n}.ts`),
        },
      },
    });
    expect(html).toContain('>1/2<');
    expect(html).toContain('>you<');
    expect(html).toContain('20m ago');
    expect(html).toContain('+2 more');
    // A row with no summary admits that the agent never narrated, instead of showing an empty line.
    expect(html).toContain('no narration yet');
    // And with no status text at all, the chip still reads.
    expect(html).toContain('TESTING');
  });

  it('does not invent a summary out of a filler status line', () => {
    const html = render({
      'gem-ai': {
        clientId: 'gem-ai', role: 'agent', status: 'idle', lastSeen: now,
        activity: { state: 'idle', summary: 'Idle / Connected', at: now - 1000 },
      },
    });
    expect(html).toContain('IDLE');
    expect(html).toContain('no narration yet');
    expect(html).not.toContain('>Idle / Connected<');
  });
});
