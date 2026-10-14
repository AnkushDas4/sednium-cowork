import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePresence } from '../api/presence.js';
import { getRoom, resetStore } from '../api/_store.js';
import { ACTIVITY_DETAIL_MAX, ACTIVITY_FILES_MAX, ACTIVITY_SUMMARY_MAX } from '../api/_validation.js';

const token = 'a'.repeat(64);
const roomCode = 'ACTIVITY';
const beat = (payload: Record<string, unknown> = {}) =>
  handlePresence({ roomCode, clientId: 'gemini-ai', ...payload }, token);
const stored = async (clientId = 'gemini-ai') => (await getRoom(roomCode))?.participants?.[clientId];

beforeEach(async () => {
  await resetStore();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Presence activity stream', () => {
  it('publishes validated activity and hands it to every poller', async () => {
    const first = await beat({
      activity: { state: 'editing', summary: 'rewiring the poller', files: ['src/poller.ts', './src/../src/a.ts'] },
    });
    expect(first.status).toBe(200);
    const mine = first.body.participants['gemini-ai'].activity;
    expect(mine.state).toBe('editing');
    expect(mine.summary).toBe('rewiring the poller');
    // Paths are normalized by the same validator that guards file locks.
    expect(mine.files).toEqual(['src/poller.ts', 'src/a.ts']);
    expect(typeof mine.at).toBe('number');
    expect(mine.since).toBe(mine.at);

    const observer = await handlePresence({ roomCode, clientId: 'loid', role: 'human' }, token);
    expect(observer.body.participants['gemini-ai'].activity.summary).toBe('rewiring the poller');
  });

  it('derives the legacy status line from activity when the client sends none', async () => {
    const res = await beat({ activity: { state: 'editing', summary: 'tightening the lock check' } });
    expect(res.body.participants['gemini-ai'].status).toBe('editing: tightening the lock check');
  });

  it('keeps one timer across beats while the state is unchanged, and restarts it on change', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const start = await beat({ activity: { state: 'editing', summary: 'first' } });
    const since = start.body.participants['gemini-ai'].activity.since;

    vi.advanceTimersByTime(42_000);
    const continued = await beat({ activity: { state: 'editing', summary: 'still first' } });
    expect(continued.body.participants['gemini-ai'].activity.since).toBe(since);
    expect(continued.body.participants['gemini-ai'].activity.at).toBe(since + 42_000);

    vi.advanceTimersByTime(1000);
    const changed = await beat({ activity: { state: 'testing', summary: 'running vitest' } });
    const testing = changed.body.participants['gemini-ai'].activity;
    expect(testing.since).toBe(testing.at);
    expect(testing.since).not.toBe(since);
  });

  it('preserves the last activity on a plain heartbeat and clears it on null', async () => {
    await beat({ activity: { state: 'reading', summary: 'checking the diff' } });

    const idle = await beat({ status: 'Idle / Connected' });
    expect(idle.body.participants['gemini-ai'].activity.summary).toBe('checking the diff');

    const cleared = await beat({ activity: null });
    expect(cleared.body.participants['gemini-ai'].activity).toBeUndefined();
    expect(await (await stored())?.activity).toBeUndefined();
  });

  it('refuses an unknown state without wiping what the room already had', async () => {
    await beat({ activity: { state: 'debugging', summary: 'chasing a flake' } });
    await expect(beat({ activity: { state: 'sleeping' } })).rejects.toThrow('Invalid activity state');
    expect((await stored())?.activity?.state).toBe('debugging');

    await expect(beat({ activity: 'editing stuff' })).rejects.toThrow('Invalid activity');
    expect((await stored())?.activity?.summary).toBe('chasing a flake');
  });

  it('clips oversized text instead of rejecting the heartbeat', async () => {
    const res = await beat({
      activity: {
        state: 'thinking',
        summary: 's'.repeat(4000),
        detail: 'd'.repeat(9000),
        files: Array.from({ length: 60 }, (_, n) => `src/f${n}.ts`),
      },
    });
    expect(res.status).toBe(200);
    const activity = res.body.participants['gemini-ai'].activity;
    expect(activity.summary.length).toBe(ACTIVITY_SUMMARY_MAX);
    expect(activity.detail.length).toBe(ACTIVITY_DETAIL_MAX);
    expect(activity.files.length).toBe(ACTIVITY_FILES_MAX);
    expect(activity.truncated).toBe(true);
  });

  it('strips control characters so a log blob cannot forge lines in the dashboard', async () => {
    const res = await beat({
      activity: { state: 'thinking', summary: 'before\u0000\u001b[31mred\u001b[0m\nafter', detail: 'a\r\nb' },
    });
    const activity = res.body.participants['gemini-ai'].activity;
    expect(activity.summary).not.toContain('\u001b');
    expect(activity.summary).not.toContain('\n');
    // Multi-line thoughts survive as \n (so the UI can keep paragraphs) but CRLF is folded.
    expect(activity.detail).toBe('a\nb');
    expect(activity.detail).not.toContain('\r');
  });

  it('refuses file paths that escape the repository', async () => {
    for (const files of [['/etc/passwd'], ['../.env'], ['C:/Windows/x']]) {
      await expect(beat({ activity: { state: 'editing', files } })).rejects.toThrow(
        'File paths must be repository-relative',
      );
    }
    expect((await stored())?.activity?.files).toBeUndefined();
  });

  it('keeps activity out of chat history and out of every inbox', async () => {
    await handlePresence({ roomCode, clientId: 'peer-ai', role: 'agent' }, token);
    for (let n = 0; n < 5; n += 1) {
      await beat({ activity: { state: 'editing', summary: `pass ${n}`, detail: 'thinking hard' } });
    }
    const room = await getRoom(roomCode);
    expect(room?.history.length ?? 0).toBe(0);

    const peer = await handlePresence({ roomCode, clientId: 'peer-ai', role: 'agent' }, token);
    expect(peer.body.messages.length).toBe(0);
  });

  it('drops a departed participant\'s stale thoughts after 30 minutes, never its own', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    await beat({ activity: { state: 'editing', summary: 'old work' } });

    vi.advanceTimersByTime(31 * 60_000);
    const other = await handlePresence({ roomCode, clientId: 'loid', role: 'human' }, token);
    expect(other.body.participants['gemini-ai'].activity).toBeUndefined();

    // Its own heartbeat keeps the row alive, so a long tool call is not punished by the relay.
    await beat({ activity: { state: 'editing', summary: 'back now' } });
    const revived = await handlePresence({ roomCode, clientId: 'loid', role: 'human' }, token);
    expect(revived.body.participants['gemini-ai'].activity.summary).toBe('back now');
  });

  it('does not let one participant overwrite another\'s activity', async () => {
    await beat({ activity: { state: 'editing', summary: 'mine' } });
    const other = await handlePresence(
      { roomCode, clientId: 'peer-ai', role: 'agent', activity: { state: 'testing', summary: 'theirs' } },
      token,
    );
    expect(other.body.participants['gemini-ai'].activity.summary).toBe('mine');
    expect(other.body.participants['peer-ai'].activity.summary).toBe('theirs');
  });

  it('exposes the published caps so clients can pre-clip', () => {
    expect(ACTIVITY_SUMMARY_MAX).toBe(240);
    expect(ACTIVITY_DETAIL_MAX).toBe(1600);
    expect(ACTIVITY_FILES_MAX).toBe(24);
  });
});
