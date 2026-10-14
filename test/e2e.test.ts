import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import sendHandler from '../packages/cowork-web-relay/api/send.js';
import presenceHandler from '../packages/cowork-web-relay/api/presence.js';
import { resetStore } from '../packages/cowork-web-relay/api/_store.js';
import { CoWorkPoller } from '../packages/cowork-mcp/src/poller.js';

describe('Sednium CoWork End-to-End Simulation', () => {
  let server: Server;
  const PORT = 3988;
  const RELAY_URL = `http://localhost:${PORT}`;
  const ROOM = 'SED-409';

  beforeAll(async () => {
    await resetStore();
    const app = express();
    app.use(express.json());
    app.all('/api/send', sendHandler);
    app.all('/api/presence', presenceHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(PORT, () => resolve());
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('runs complete multi-agent, human dashboard, and file lock lifecycle', async () => {
    // 1. Loid MCP connects
    const loidPoller = new CoWorkPoller({
      roomCode: ROOM,
      agentId: 'loid-ai',
      repoPath: process.cwd(),
      relayUrl: RELAY_URL,
      participantToken: 'a'.repeat(64),
    });
    await loidPoller.poll();

    // 2. Peer MCP connects
    const peerPoller = new CoWorkPoller({
      roomCode: ROOM,
      agentId: 'peer-ai',
      repoPath: process.cwd(),
      relayUrl: RELAY_URL,
      participantToken: 'a'.repeat(64),
    });
    await peerPoller.poll();

    // 3. Human joins via Web Dashboard (polls presence)
    const humanPresenceRes = await fetch(
      `${RELAY_URL}/api/presence?action=inbox&roomCode=${ROOM}&clientId=loid&role=human&status=Online`, { headers: { 'X-Cowork-Client-Token': 'a'.repeat(64) } }
    );
    const humanData = await humanPresenceRes.json();
    expect(humanData.participants['loid-ai']).toBeDefined();
    expect(humanData.participants['peer-ai']).toBeDefined();
    expect(humanData.participants['loid']).toBeDefined();

    // 4. Loid AI locks src/App.tsx
    const lockRes = await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': 'a'.repeat(64) },
      body: JSON.stringify({
        roomCode: ROOM,
        senderId: 'loid-ai',
        targetId: 'all',
        contentType: 'FILE_LOCK',
        text: 'Building header and core routing',
        files: ['src/App.tsx'],
      }),
    });
    const lockData = await lockRes.json();
    expect(lockRes.status).toBe(200);
    expect(lockData.ok).toBe(true);

    // 5. Peer AI tries to lock src/App.tsx -> 409 Conflict
    const conflictRes = await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': 'a'.repeat(64) },
      body: JSON.stringify({
        roomCode: ROOM,
        senderId: 'peer-ai',
        targetId: 'all',
        contentType: 'FILE_LOCK',
        text: 'Editing App.tsx as well',
        files: ['src/App.tsx'],
      }),
    });
    const conflictData = await conflictRes.json();
    expect(conflictRes.status).toBe(409);
    expect(conflictData.ok).toBe(false);
    expect(conflictData.error).toBe('FILE_LOCKED');
    expect(conflictData.lockedBy).toBe('loid-ai');

    // 6. Human uses dashboard to send @peer-ai instruction
    const promptRes = await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': 'a'.repeat(64) },
      body: JSON.stringify({
        roomCode: ROOM,
        senderId: 'loid',
        targetId: 'all',
        contentType: 'CHAT',
        text: '@peer-ai build the Navbar component and unit tests',
      }),
    });
    expect(promptRes.status).toBe(200);

    // 7. Peer AI polls and receives multicast FILE_LOCK notification and CROSS_PROMPT
    await peerPoller.poll();
    const peerInbox = peerPoller.drainInbox();
    expect(peerInbox.length).toBe(2);
    expect(peerInbox[0].contentType).toBe('FILE_LOCK');
    expect(peerInbox[1].targetId).toBe('peer-ai');
    expect(peerInbox[1].contentType).toBe('CROSS_PROMPT');
    expect(peerInbox[1].text).toContain('@peer-ai build the Navbar component');

    // 8. Loid AI finishes work and pushes to git (GIT_PUSH)
    const gitPushRes = await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': 'a'.repeat(64) },
      body: JSON.stringify({
        roomCode: ROOM,
        senderId: 'loid-ai',
        targetId: 'all',
        contentType: 'GIT_PUSH',
        text: 'feat: add App.tsx and core routing',
        commitHash: '7f9a12c',
      }),
    });
    const gitPushData = await gitPushRes.json();
    expect(gitPushRes.status).toBe(200);
    expect(gitPushData.roomStateSummary.activeFileLocks).toBe(0); // App.tsx unlocked!
    expect(gitPushData.roomStateSummary.latestCommit.hash).toBe('7f9a12c');

    // 9. Peer AI can now lock src/App.tsx without conflict
    const peerLockRes = await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': 'a'.repeat(64) },
      body: JSON.stringify({
        roomCode: ROOM,
        senderId: 'peer-ai',
        targetId: 'all',
        contentType: 'FILE_LOCK',
        text: 'Integrating Navbar into App.tsx',
        files: ['src/App.tsx'],
      }),
    });
    expect(peerLockRes.status).toBe(200);

    loidPoller.stop();
    peerPoller.stop();
  });
});
