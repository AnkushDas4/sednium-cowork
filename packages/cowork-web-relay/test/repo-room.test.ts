import { describe, it, expect, beforeEach } from 'vitest';
import { handleSend as send } from '../api/send.js';
import { handlePresence as presence } from '../api/presence.js';
import { resetStore } from '../api/_store.js';

const token = 'a'.repeat(64);
const sendAs = (p: Parameters<typeof send>[0], withToken = token) => send(p, withToken);
const poll = (p: Parameters<typeof presence>[0]) => presence(p, token);
const ROOM = 'SED-REPO';

const link = (repo: string, senderId = 'loid-ai') =>
  sendAs({ roomCode: ROOM, senderId, contentType: 'GIT_REPO', text: repo });

describe('Room repository binding', () => {
  beforeEach(async () => {
    await resetStore();
    await poll({ roomCode: ROOM, clientId: 'loid-ai', role: 'agent' });
    await poll({ roomCode: ROOM, clientId: 'gem-ai', role: 'agent' });
  });

  it('starts unbound and tells every client so on each heartbeat', async () => {
    const beat = await poll({ roomCode: ROOM, clientId: 'loid-ai' });
    expect(beat.body.gitRepo).toBeNull();
  });

  it('links once, from either spelling, and reports the canonical form', async () => {
    const res = await link('acme/app');
    expect(res.status).toBe(200);
    expect(res.body.gitRepo).toMatchObject({
      url: 'https://github.com/acme/app',
      host: 'github.com',
      slug: 'acme/app',
      by: 'loid-ai',
      source: 'linked',
    });

    const beat = await poll({ roomCode: ROOM, clientId: 'gem-ai' });
    expect(beat.body.gitRepo).toMatchObject({ url: 'https://github.com/acme/app' });

    // The event reaches peers as a room event, not as a mention of someone called "github".
    const event = beat.body.recentHistory.find((m: any) => m.contentType === 'GIT_REPO');
    expect(event.text).toBe('https://github.com/acme/app');
    expect(event.targetId).toBe('all');
    expect(event.mentions).toBeUndefined();
  });

  it('treats a re-link of the same repository as a no-op, not a second event', async () => {
    await link('git@github.com:acme/app.git');
    const again = await link('https://github.com/acme/app');
    expect(again.status).toBe(200);
    expect(again.body.code).toBe('GIT_REPO_ALREADY_LINKED');
    expect(again.body.gitRepo).toMatchObject({ url: 'ssh://git@github.com/acme/app', source: 'linked' });

    const beat = await poll({ roomCode: ROOM, clientId: 'gem-ai' });
    expect(beat.body.recentHistory.filter((m: any) => m.contentType === 'GIT_REPO')).toHaveLength(1);
  });

  it('refuses a different repository, with the bound one in the message', async () => {
    await link('acme/app');
    await expect(link('other/app')).rejects.toThrow(/bound to github.com\/acme\/app/);
    let caught: any;
    try {
      await link('gitlab.com/acme/app');
    } catch (err) {
      caught = err;
    }
    expect(caught.status).toBe(409);
    expect(caught.code).toBe('GIT_REPO_TAKEN');
    expect(caught.hint).toMatch(/new room/);

    const beat = await poll({ roomCode: ROOM, clientId: 'gem-ai' });
    expect(beat.body.gitRepo).toMatchObject({ slug: 'acme/app' });
  });

  it('lets the first push decide the repository when nobody linked one', async () => {
    const push = await sendAs({
      roomCode: ROOM,
      senderId: 'gem-ai',
      contentType: 'GIT_PUSH',
      text: 'feat: notify',
      commitHash: 'abc1234def',
      repoUrl: 'github.com/acme/app.git',
    });
    expect(push.status).toBe(200);
    expect(push.body.gitRepo).toMatchObject({ slug: 'acme/app', by: 'gem-ai', source: 'push' });
    expect(push.body.note).toMatch(/first push decided it/);

    const beat = await poll({ roomCode: ROOM, clientId: 'loid-ai' });
    expect(beat.body.gitRepo).toMatchObject({ url: 'https://github.com/acme/app' });
  });

  it('refuses a push to another repository and leaves the room exactly as it was', async () => {
    await link('acme/app');
    await sendAs({ roomCode: ROOM, senderId: 'gem-ai', contentType: 'FILE_LOCK', files: ['src/a.ts'], text: 'mine' });

    let caught: any;
    try {
      await sendAs({
        roomCode: ROOM,
        senderId: 'gem-ai',
        contentType: 'GIT_PUSH',
        text: 'feat: to the fork',
        commitHash: 'deadbeef01',
        repoUrl: 'github.com/gem/fork',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught.status).toBe(409);
    expect(caught.code).toBe('GIT_REPO_MISMATCH');
    expect(caught.message).toMatch(/this room works in github.com\/acme\/app/);
    expect(caught.hint).toMatch(/git remote set-url origin https:\/\/github.com\/acme\/app/);

    // Nothing half-happened: no commit recorded, lock still held, no stray event in history.
    const beat = await poll({ roomCode: ROOM, clientId: 'loid-ai' });
    expect(beat.body.latestCommit).toBeNull();
    expect(beat.body.fileLocks['src/a.ts']).toMatchObject({ lockedBy: 'gem-ai' });
    expect(beat.body.recentHistory.some((m: any) => m.text === 'feat: to the fork')).toBe(false);
  });

  it('accepts the same repository written differently by the pusher', async () => {
    await link('acme/app');
    const push = await sendAs({
      roomCode: ROOM,
      senderId: 'gem-ai',
      contentType: 'GIT_PUSH',
      text: 'feat: from the ssh remote',
      commitHash: 'abcdef1234',
      repoUrl: 'git@github.com:acme/app.git',
    });
    expect(push.status).toBe(200);
    const beat = await poll({ roomCode: ROOM, clientId: 'loid-ai' });
    expect(beat.body.latestCommit).toMatchObject({ hash: 'abcdef1234' });
    expect(beat.body.gitRepo).toMatchObject({ url: 'https://github.com/acme/app' });
  });

  it('accepts a push whose author never claimed a repository, and keeps the binding', async () => {
    await link('acme/app');
    const push = await sendAs({
      roomCode: ROOM,
      senderId: 'gem-ai',
      contentType: 'GIT_PUSH',
      text: 'fix: tests',
      commitHash: '1234567890abcdef',
    });
    expect(push.status).toBe(200);
    expect(push.body.gitRepo).toMatchObject({ slug: 'acme/app', source: 'linked' });
    const beat = await poll({ roomCode: ROOM, clientId: 'loid-ai' });
    expect(beat.body.latestCommit).toMatchObject({ hash: '1234567890abcdef' });
  });

  it('never stores or echoes a credential that came in with the remote', async () => {
    const secret = 'ghp_SUPERSECRET123';
    const res = await link(`https://oauth2:${secret}@github.com/acme/app`);
    expect(res.body.gitRepo?.url).toBe('https://github.com/acme/app');

    const beat = await poll({ roomCode: ROOM, clientId: 'gem-ai' });
    const serialized = JSON.stringify(beat.body);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain('oauth2');
    expect(beat.body.recentHistory.find((m: any) => m.contentType === 'GIT_REPO').text).toBe('https://github.com/acme/app');
  });

  it('rejects a repo claim that is not a repository, and one that is empty', async () => {
    await expect(link('/home/dev/checkout')).rejects.toThrow(/Invalid repo/);
    await expect(link('https://github.com/acme')).rejects.toThrow(/GIT_REPO_INVALID|Invalid repo/);
    await expect(sendAs({ roomCode: ROOM, senderId: 'loid-ai', contentType: 'GIT_REPO' })).rejects.toThrow(/Invalid repo/);

    const beat = await poll({ roomCode: ROOM, clientId: 'loid-ai' });
    expect(beat.body.gitRepo).toBeNull(); // a rejected claim must not half-apply
  });

  it('delivers the link to a peer that joins afterwards', async () => {
    await link('acme/app');
    await poll({ roomCode: ROOM, clientId: 'late-ai', role: 'agent' });
    // A late joiner has no inbox entry for an event from before it existed, but it always gets the
    // rule itself: the binding rides on every heartbeat.
    const beat = await poll({ roomCode: ROOM, clientId: 'late-ai' });
    expect(beat.body.gitRepo).toMatchObject({ url: 'https://github.com/acme/app' });
    expect(beat.body.messages).toHaveLength(0);
  });
});
