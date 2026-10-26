import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { CoWorkPoller } from '../src/poller.js';
import sendHandler from '../../cowork-web-relay/api/send.js';
import presenceHandler from '../../cowork-web-relay/api/presence.js';
import { resetStore } from '../../cowork-web-relay/api/_store.js';

describe('MCP Poller & Relay Integration', () => {
  let server: Server;
  const PORT = 3899;
  const RELAY_URL = `http://localhost:${PORT}`;

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

  it('connects to relay, polls presence, and drains queued messages', async () => {
    const poller = new CoWorkPoller({
      roomCode: 'MCP-TEST-1',
      agentId: 'loid-ai',
      repoPath: process.cwd(),
      relayUrl: RELAY_URL,
    });

    // 1. Initial poll registers agent
    await poller.poll();
    expect(poller.getRoomCode()).toBe('MCP-TEST-1');
    expect(poller.getAgentId()).toBe('loid-ai');

    // 2. Peer sends message to loid-ai
    await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': 'b'.repeat(64) },
      body: JSON.stringify({
        roomCode: 'MCP-TEST-1',
        senderId: 'peer-ai',
        targetId: 'loid-ai',
        contentType: 'CROSS_PROMPT',
        text: 'Please review api/users.ts',
      }),
    });

    // 3. Poller polls again
    await poller.poll();

    // 4. Drain inbox
    const inbox = poller.drainInbox();
    expect(inbox.length).toBe(1);
    expect(inbox[0].text).toBe('Please review api/users.ts');
    expect(inbox[0].senderId).toBe('peer-ai');

    // 5. Subsequent drain is empty
    expect(poller.drainInbox().length).toBe(0);

    // 6. Branch get and set
    expect(poller.getBranch()).toBe('main');
    poller.setBranch('feature/auth-redesign');
    expect(poller.getBranch()).toBe('feature/auth-redesign');

    poller.stop();
  });

  it('supports peer-to-peer agent discussion and planning messages', async () => {
    const pollerA = new CoWorkPoller({
      roomCode: 'MCP-DISCUSS-1',
      agentId: 'agent-gemini',
      repoPath: process.cwd(),
      relayUrl: RELAY_URL,
    });
    const pollerB = new CoWorkPoller({
      roomCode: 'MCP-DISCUSS-1',
      agentId: 'agent-claude',
      repoPath: process.cwd(),
      relayUrl: RELAY_URL,
    });

    await pollerA.poll();
    await pollerB.poll();

    // Agent Gemini sends discussion message to Agent Claude
    await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: pollerA.getHeaders(),
      body: JSON.stringify({
        roomCode: 'MCP-DISCUSS-1',
        senderId: 'agent-gemini',
        targetId: 'agent-claude',
        contentType: 'AGENT_SYNC',
        text: '@agent-claude Should we use Upstash Redis for serverless storage?',
      }),
    });

    // Claude polls and receives Gemini's discussion proposal
    await pollerB.poll();
    const inboxB = pollerB.drainInbox();
    expect(inboxB.length).toBe(1);
    expect(inboxB[0].contentType).toBe('AGENT_SYNC');
    expect(inboxB[0].text).toContain('Upstash Redis');

    // Claude replies to Gemini
    await fetch(`${RELAY_URL}/api/send`, {
      method: 'POST',
      headers: pollerB.getHeaders(),
      body: JSON.stringify({
        roomCode: 'MCP-DISCUSS-1',
        senderId: 'agent-claude',
        targetId: 'agent-gemini',
        contentType: 'AGENT_SYNC',
        text: '@agent-gemini Agreed! Upstash never pauses from inactivity.',
      }),
    });

    // Gemini polls and receives Claude's reply
    await pollerA.poll();
    const inboxA = pollerA.drainInbox();
    expect(inboxA.length).toBe(1);
    expect(inboxA[0].text).toContain('Upstash never pauses');

    pollerA.stop();
    pollerB.stop();
  });
});
