import { describe, it, expect, beforeEach } from 'vitest';
import { handleSend as send } from '../api/send.js';
import { handlePresence as presence } from '../api/presence.js';
import { resetStore } from '../api/_store.js';

const token = 'a'.repeat(64);
const handleSend = (p: Parameters<typeof send>[0]) => send(p, token);
const handlePresence = (p: Parameters<typeof presence>[0]) => presence(p, token);

describe('Relay API Handlers (send.ts & presence.ts)', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('handles POST /api/send and creates room + routes to inbox', async () => {
    // Register receiver first via presence
    await handlePresence({
      roomCode: 'SED100',
      clientId: 'peer-ai',
      role: 'agent',
      status: 'Idle',
    });

    const res = await handleSend({
      roomCode: 'SED100',
      senderId: 'loid-ai',
      targetId: 'peer-ai',
      contentType: 'CHAT',
      text: 'Hello peer!',
    });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.messageId).toBeDefined();

    // Now peer-ai checks presence / inbox
    const presence = await handlePresence({
      roomCode: 'SED100',
      clientId: 'peer-ai',
      role: 'agent',
      status: 'Listening',
    });

    expect(presence.body.messages.length).toBe(1);
    expect(presence.body.messages[0].text).toBe('Hello peer!');
    expect(presence.body.messages[0].senderId).toBe('loid-ai');

    // Second poll acknowledges the delivered message -> 0 unread
    const secondPoll = await handlePresence({
      ack: presence.body.messages.map((m: any) => m.messageId),
      roomCode: 'SED100',
      clientId: 'peer-ai',
      role: 'agent',
      status: 'Listening',
    });
    expect(secondPoll.body.messages.length).toBe(0);
  });

  it('auto-parses @mention and promotes to CROSS_PROMPT', async () => {
    await handlePresence({
      roomCode: 'SED100',
      clientId: 'peer-ai',
      role: 'agent',
      status: 'Idle',
    });

    const res = await handleSend({
      roomCode: 'SED100',
      senderId: 'loid',
      targetId: 'all', // Should be promoted to peer-ai
      contentType: 'CHAT',
      text: '@peer-ai build the navbar and tests',
    });

    expect(res.status).toBe(200);

    const presence = await handlePresence({
      roomCode: 'SED100',
      clientId: 'peer-ai',
      role: 'agent',
      status: 'Idle',
    });

    expect(presence.body.messages.length).toBe(1);
    expect(presence.body.messages[0].targetId).toBe('peer-ai');
    expect(presence.body.messages[0].contentType).toBe('CROSS_PROMPT');
    expect(presence.body.messages[0].priority).toBe('HIGH');
  });

  it('handles multiple @mentions with high priority delivery to all tagged inboxes', async () => {
    await handlePresence({ roomCode: 'SED150', clientId: 'agent-1', role: 'agent', status: 'Idle' });
    await handlePresence({ roomCode: 'SED150', clientId: 'agent-2', role: 'agent', status: 'Idle' });
    await handlePresence({ roomCode: 'SED150', clientId: 'agent-3', role: 'agent', status: 'Idle' });

    const res = await handleSend({
      roomCode: 'SED150',
      senderId: 'host',
      targetId: 'all',
      contentType: 'CHAT',
      text: '@agent-1 @agent-2 please review this urgently!',
    });

    expect(res.status).toBe(200);

    const p1 = await handlePresence({ roomCode: 'SED150', clientId: 'agent-1', role: 'agent' });
    const p2 = await handlePresence({ roomCode: 'SED150', clientId: 'agent-2', role: 'agent' });
    const p3 = await handlePresence({ roomCode: 'SED150', clientId: 'agent-3', role: 'agent' });

    expect(p1.body.messages.length).toBe(1);
    expect(p1.body.messages[0].priority).toBe('HIGH');
    expect(p1.body.messages[0].mentions).toEqual(['agent-1', 'agent-2']);

    expect(p2.body.messages.length).toBe(1);
    expect(p2.body.messages[0].priority).toBe('HIGH');

    expect(p3.body.messages.length).toBe(1);
  });

  it('manages file locks and rejects conflicting locks with 409', async () => {
    // Agent 1 claims App.tsx
    const lock1 = await handleSend({
      roomCode: 'SED200',
      senderId: 'loid-ai',
      targetId: 'all',
      contentType: 'FILE_LOCK',
      text: 'Working on App.tsx',
      files: ['src/App.tsx'],
    });

    expect(lock1.status).toBe(200);
    expect(lock1.body.ok).toBe(true);

    // Agent 2 tries to claim App.tsx -> 409 Conflict
    const lock2 = await handleSend({
      roomCode: 'SED200',
      senderId: 'peer-ai',
      targetId: 'all',
      contentType: 'FILE_LOCK',
      text: 'Need App.tsx as well',
      files: ['src/App.tsx', 'src/Navbar.tsx'],
    });

    expect(lock2.status).toBe(409);
    expect(lock2.body.ok).toBe(false);
    expect(lock2.body.error).toBe('FILE_LOCKED');
    expect(lock2.body.lockedBy).toBe('loid-ai');
    expect(lock2.body.conflictingFiles).toContain('src/App.tsx');
  });

  it('releases locks on GIT_PUSH and updates latestCommit', async () => {
    // Lock file
    await handleSend({
      roomCode: 'SED300',
      senderId: 'loid-ai',
      targetId: 'all',
      contentType: 'FILE_LOCK',
      text: 'Locking files',
      files: ['src/api.ts'],
    });

    // Push git
    const pushRes = await handleSend({
      roomCode: 'SED300',
      senderId: 'loid-ai',
      targetId: 'all',
      contentType: 'GIT_PUSH',
      text: 'feat: add api routes',
      commitHash: 'a1b2c3d',
    });

    expect(pushRes.status).toBe(200);
    expect(pushRes.body.roomStateSummary?.activeFileLocks).toBe(0);
    expect(pushRes.body.roomStateSummary?.latestCommit?.hash).toBe('a1b2c3d');

    // Verify peer can now lock src/api.ts
    const lockPeer = await handleSend({
      roomCode: 'SED300',
      senderId: 'peer-ai',
      targetId: 'all',
      contentType: 'FILE_LOCK',
      text: 'Locking api.ts for tests',
      files: ['src/api.ts'],
    });
    expect(lockPeer.status).toBe(200);
    expect(lockPeer.body.ok).toBe(true);
  });
});
