import { describe, expect, it } from 'vitest';
import {
  emptyCursor,
  evaluate,
  isForMe,
  mentionCount,
  mergeNotifications,
  timeAgo,
  type NotifyCursor,
  type RoomNotification,
} from '../src/notifications.js';
import type { ActivityState, CoWorkMessage, ParticipantInfo } from '../api/_types.js';

const ME = 'loid';
const T0 = 1_700_000_000_000;

const message = (over: Partial<CoWorkMessage> = {}): CoWorkMessage => ({
  messageId: `m${Math.random().toString(36).slice(2, 8)}`,
  timestamp: T0,
  roomCode: 'ROOM',
  senderId: 'gem-ai',
  targetId: 'all',
  contentType: 'CHAT',
  text: 'hello',
  ...over,
});

const participant = (over: Partial<ParticipantInfo> = {}): ParticipantInfo => ({
  clientId: 'gem-ai',
  role: 'agent',
  status: 'Idle / Connected',
  lastSeen: T0,
  ...over,
});

const run = (
  input: Partial<Parameters<typeof evaluate>[0]> & { incoming?: CoWorkMessage[] },
  cursor: NotifyCursor = emptyCursor(),
) =>
  evaluate(
    {
      clientId: ME,
      incoming: input.incoming ?? [],
      participants: input.participants ?? {},
      latestCommit: input.latestCommit ?? null,
      now: input.now ?? T0,
    },
    cursor,
  );

const kindsOf = (events: RoomNotification[]) => events.map((e) => e.kind);

describe('Notification rules', () => {
  it('primes on the first poll instead of alerting about the room\'s past', () => {
    const first = run({
      participants: { 'gem-ai': participant({ activity: { state: 'blocked', summary: 'needs approval', at: T0 } }) },
    });
    expect(first.events).toHaveLength(0);
    expect(first.cursor.primed).toBe(true);
    expect(first.cursor.roster['gem-ai'].state).toBe('blocked');
  });

  it('reads mentions, prompts and direct messages apart', () => {
    const { events } = run(
      {
        incoming: [
          message({ messageId: 'a', contentType: 'CHAT', text: 'ping @loid can you look?' }),
          message({ messageId: 'b', contentType: 'CROSS_PROMPT', targetId: ME, text: 'run the tests' }),
          message({ messageId: 'c', contentType: 'CHAT', targetId: ME, text: 'quick question' }),
        ],
      },
      { ...emptyCursor(), primed: true },
    );
    expect(kindsOf(events)).toEqual(['mention', 'prompt', 'dm']);
    expect(events[0].severity).toBe('high');
    expect(events[1].title).toContain('@gem-ai');
    expect(events[0].messageId).toBe('a');
  });

  it('ignores your own words, heartbeats and chat that was not about you', () => {
    const { events } = run(
      {
        incoming: [
          message({ senderId: ME, text: 'mentioning @loid myself' }),
          message({ contentType: 'STATUS', targetId: ME, text: 'noise' }),
          message({ text: 'two agents talking @someone-else' }),
          message({ contentType: 'FILE_LOCK', targetId: 'all', text: 'claiming src/a.ts' }),
        ],
      },
      { ...emptyCursor(), primed: true },
    );
    expect(events).toHaveLength(0);
  });

  it('notifies about a lock message only when it names you', () => {
    const { events } = run(
      { incoming: [message({ contentType: 'FILE_LOCK', text: '@loid stop, I already hold src/a.ts' })] },
      { ...emptyCursor(), primed: true },
    );
    expect(kindsOf(events)).toEqual(['mention']);
  });

  it('reports a pushed branch once, whichever source saw it first', () => {
    const cursor = { ...emptyCursor(), primed: true };
    const viaMessage = run(
      {
        incoming: [message({ contentType: 'GIT_PUSH', commitHash: 'abc1234def', text: 'fix: retry' })],
        latestCommit: { hash: 'abc1234def', message: 'fix: retry', author: 'gem-ai', timestamp: T0 },
      },
      cursor,
    );
    expect(kindsOf(viaMessage.events)).toEqual(['push']);
    expect(viaMessage.events[0].title).toContain('abc1234');

    // Next beat: the same commit is still the latest, and the message is gone. Nothing to say.
    const again = run({ latestCommit: { hash: 'abc1234def', message: 'fix: retry', author: 'gem-ai', timestamp: T0 } }, viaMessage.cursor);
    expect(again.events).toHaveLength(0);

    const moved = run({ latestCommit: { hash: 'ffee000111', message: 'chore: docs', author: 'gem-ai', timestamp: T0 + 1000 } }, again.cursor);
    expect(kindsOf(moved.events)).toEqual(['push']);
  });

  it('follows an agent through stuck, unblocked and finished', () => {
    const roster = (state: ActivityState, since: number, summary = '') => ({
      'gem-ai': participant({
        lastSeen: since,
        activity: { state, summary, at: since + 2_000, since },
      }),
    });
    let cursor = { ...emptyCursor(), primed: true };

    const stuck = run({ participants: roster('blocked', T0, 'needs the API key'), now: T0 }, cursor);
    expect(kindsOf(stuck.events)).toEqual(['attention']);
    expect(stuck.events[0].severity).toBe('high');
    expect(stuck.events[0].body).toContain('API key');
    cursor = stuck.cursor;

    // Same blocked state, newer heartbeat: only `at` moved, so nothing may fire again.
    const still = run({ participants: roster('blocked', T0, 'needs the API key'), now: T0 + 2_000 }, cursor);
    expect(still.events).toHaveLength(0);

    const resumed = run({ participants: roster('editing', T0 + 4_000, 'continuing'), now: T0 + 4_000 }, still.cursor);
    expect(resumed.events).toHaveLength(0); // back to work is not an alert

    const finished = run({ participants: roster('done', T0 + 6_000, 'patch is ready'), now: T0 + 6_000 }, resumed.cursor);
    expect(kindsOf(finished.events)).toEqual(['done']);
  });

  it('announces a peer arriving and going quiet, but only once each', () => {
    let cursor = { ...emptyCursor(), primed: true };
    const joined = run({ participants: { 'gem-ai': participant() }, now: T0 }, cursor);
    expect(kindsOf(joined.events)).toEqual(['joined']);

    // A peer that arrives already stuck interrupts instead of being logged as a join.
    const arrivedStuck = run(
      { participants: { 'gem-ai': participant({ activity: { state: 'blocked', summary: 'no key', at: T0 } }) }, now: T0 },
      { ...emptyCursor(), primed: true },
    );
    expect(kindsOf(arrivedStuck.events)).toEqual(['attention']);

    cursor = run({ participants: {}, now: T0 }, joined.cursor).cursor;
    // The handle is gone from the roster entirely: nothing to compare against, so nothing fires.
    const empty = run({ participants: {}, now: T0 + 200_000 }, cursor);
    expect(empty.events).toHaveLength(0);

    // Heartbeating then falling silent is the case that matters.
    const online = run({ participants: { 'gem-ai': participant({ lastSeen: T0 }) }, now: T0 }, { ...emptyCursor(), primed: true });
    const stale = run({ participants: { 'gem-ai': participant({ lastSeen: T0 }) }, now: T0 + 120_000 }, online.cursor);
    expect(kindsOf(stale.events)).toEqual(['left']);
    const later = run({ participants: { 'gem-ai': participant({ lastSeen: T0 }) }, now: T0 + 130_000 }, stale.cursor);
    expect(later.events).toHaveLength(0);
  });

  it('never fires twice for a redelivered message', () => {
    const redelivery = message({ messageId: 'same-id', targetId: ME, text: 'are you there?' });
    const first = run({ incoming: [redelivery] }, { ...emptyCursor(), primed: true });
    expect(first.events).toHaveLength(1);
    const second = run({ incoming: [redelivery] }, first.cursor);
    expect(second.events).toHaveLength(0);
  });

  it('keeps bodies short enough for a lock screen and never throws on empty text', () => {
    const { events } = run(
      { incoming: [message({ targetId: ME, text: 'x'.repeat(900) }), message({ messageId: 'z', senderId: 'other', targetId: ME, text: '' })] },
      { ...emptyCursor(), primed: true },
    );
    expect(events[0].body.length).toBeLessThanOrEqual(220);
    expect(events[0].body.endsWith('…')).toBe(true);
    expect(events[1].body).toBe('');
  });

  it('bounds its own memory across a long session', () => {
    let cursor: NotifyCursor = { ...emptyCursor(), primed: true };
    for (let n = 0; n < 600; n += 1) {
      cursor = run({ incoming: [message({ messageId: `bulk-${n}`, targetId: ME })] }, cursor).cursor;
    }
    expect(cursor.seen.length).toBeLessThanOrEqual(400);
    expect(cursor.seen).toContain('msg:bulk-599');
    expect(cursor.seen).not.toContain('msg:bulk-0');
  });
});

describe('Message targeting helpers', () => {
  it('treats targetId, relay mentions and a bare @handle as the same signal', () => {
    expect(isForMe(message({ targetId: ME }), ME)).toBe(true);
    expect(isForMe(message({ mentions: [ME] }), ME)).toBe(true);
    expect(isForMe(message({ text: 'hey @loid' }), ME)).toBe(true);
    expect(isForMe(message({ text: 'hey @someone' }), ME)).toBe(false);
    expect(isForMe(message({ senderId: ME, text: '@loid' }), ME)).toBe(false);
  });

  it('counts what the mobile tab badge shows', () => {
    const list = [
      message({ text: '@loid one' }),
      message({ text: '@loid two' }),
      message({ senderId: ME, text: '@loid mine' }),
      message({ text: 'not for me' }),
    ];
    expect(mentionCount(list, ME)).toBe(2);
  });
});

describe('Notification list shape', () => {
  const note = (id: string, at: number, kind: RoomNotification['kind'] = 'mention'): RoomNotification => ({
    id,
    kind,
    severity: 'high',
    title: `t-${id}`,
    body: '',
    at,
  });

  it('merges newest first, without duplicates, and caps the list', () => {
    const previous = [note('b', 2), note('a', 1)];
    const merged = mergeNotifications(previous, [note('c', 3), note('a', 1)]);
    expect(merged.map((n) => n.id)).toEqual(['c', 'b', 'a']);

    const flood = mergeNotifications(previous, Array.from({ length: 80 }, (_, n) => note(`f${n}`, 1000 + n)));
    expect(flood).toHaveLength(50);
    expect(flood[0].id).toBe('f79');
    expect(mergeNotifications(previous, [])).toBe(previous); // same array, so React can skip the work
  });

  it('formats elapsed time the way the rail and the centre need', () => {
    expect(timeAgo(-1)).toBe('now');
    expect(timeAgo(4_999)).toBe('now');
    expect(timeAgo(12_000)).toBe('12s ago');
    expect(timeAgo(95_000)).toBe('1m ago');
    expect(timeAgo(3 * 3_600_000)).toBe('3h ago');
    expect(timeAgo(2 * 86_400_000)).toBe('2d ago');
  });
});
