import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotificationCenter } from '../src/components/NotificationCenter.js';
import { ToastStack } from '../src/components/ToastStack.js';
import { defaultSettings } from '../src/notifyChannels.js';
import type { RoomNotification } from '../src/notifications.js';
import type { NotificationCenter as Model } from '../src/useNotificationCenter.js';

const center = (over: Partial<Model> = {}): Model => ({
  notifications: [],
  toasts: [],
  panelOpen: false,
  unread: 0,
  settings: defaultSettings(),
  permission: 'default',
  snoozedFor: 0,
  ingest: () => undefined,
  markRead: () => undefined,
  clearAll: () => undefined,
  dismissToast: () => undefined,
  setChannel: () => undefined,
  setSound: () => undefined,
  snooze: () => undefined,
  askPermission: async () => 'default' as const,
  openPanel: () => undefined,
  closePanel: () => undefined,
  ...over,
});

const note = (over: Partial<RoomNotification> = {}): RoomNotification => ({
  id: 'msg:1',
  kind: 'mention',
  severity: 'high',
  title: '@gem-ai mentioned you',
  body: 'the relay needs your review',
  at: Date.now(),
  ...over,
});

const render = (model: Model) => renderToStaticMarkup(React.createElement(NotificationCenter, { center: model }));

describe('NotificationCenter', () => {
  it('shows a plain bell while there is nothing to read', () => {
    const html = render(center());
    expect(html).toContain('data-id="notification-bell"');
    expect(html).toContain('aria-label="Notifications"');
    expect(html).not.toContain('data-id="notification-panel"');
    expect(html).not.toContain('unread'); // a dot, not a count
  });

  it('badges the unread count and stops at 9+', () => {
    expect(render(center({ unread: 3 }))).toContain('>3<');
    expect(render(center({ unread: 12 }))).toContain('9+');
    expect(render(center({ unread: 12 }))).toContain('12 unread');
  });

  it('lists alerts newest first with their context, and offers the two footer actions', () => {
    const html = render(
      center({
        panelOpen: true,
        notifications: [
          note({ id: 'b', title: '@cursor-ai finished', kind: 'done', body: 'patch is ready' }),
          note({
            id: 'a',
            title: '@gem-ai needs you',
            kind: 'attention',
            body: 'waiting on the API key',
            files: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.ts', 'src/e.ts'],
          }),
        ],
      }),
    );
    expect(html).toContain('data-id="notification-panel"');
    expect(html).toContain('@gem-ai needs you');
    expect(html).toContain('waiting on the API key');
    expect(html).toContain('@cursor-ai finished');
    // Five files, four chips and a counter: the panel is a glance, not a diff viewer.
    expect(html).toContain('src/d.ts');
    expect(html).not.toContain('src/e.ts');
    expect(html).toContain('+1');
    expect(html).toContain('Mark read');
    expect(html).toContain('Clear list');
    expect(html).toContain('Alerts');
    expect(html).toContain('Settings');
  });

  it('says so when there is nothing to see, and marks the snooze loudly when it is on', () => {
    expect(render(center({ panelOpen: true }))).toContain('Nothing needs you.');
    const snoozed = render(center({ panelOpen: true, snoozedFor: 15 * 60_000, unread: 4 }));
    expect(snoozed).toContain('Snoozed for 15 min');
    expect(snoozed).toContain('collected, not shown');
    expect(snoozed).toContain('>End<');
  });

  it('opens with the alert list, and swaps the bell while snoozed', () => {
    const html = render(center({ panelOpen: true, unread: 2 }));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Settings'); // the second tab is reachable from the panel itself
    expect(html).toContain('Mark read');
    const snoozedBell = render(center({ snoozedFor: 60_000 }));
    expect(snoozedBell).toContain('Notifications snoozed for 1 min'); // aria-label tells the story
    expect(snoozedBell).toContain('data-id="notification-bell"');
  });
});

describe('ToastStack', () => {
  it('renders nothing when there is nothing to say', () => {
    expect(renderToStaticMarkup(React.createElement(ToastStack, { toasts: [], onDismiss: () => undefined }))).toBe('');
  });

  it('gives each banner a title, the text that matters and a dismiss control', () => {
    const html = renderToStaticMarkup(
      React.createElement(ToastStack, {
        toasts: [
          note(),
          note({ id: 'push:1', kind: 'push', severity: 'normal', title: 'main is at abc1234', body: 'fix: notify', files: ['a.ts', 'b.ts', 'c.ts', 'd.ts'] }),
        ],
        onDismiss: () => undefined,
      }),
    );
    expect(html).toContain('data-id="toast-stack"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('@gem-ai mentioned you');
    expect(html).toContain('main is at abc1234');
    expect(html).toContain('a.ts, b.ts, c.ts +1');
    expect(html).toContain('Dismiss this notification');
    expect(html).toContain('notify-in');
  });
});
