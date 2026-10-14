import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { CoWorkPoller } from '../src/poller.js';
import sendHandler from '../../cowork-web-relay/api/send.js';
import presenceHandler from '../../cowork-web-relay/api/presence.js';
import { getRoom, resetStore } from '../../cowork-web-relay/api/_store.js';

/**
 * End-to-end for the live stream: what the agent's tracker holds is exactly what the room sees on a
 * normal 2s heartbeat - no extra request, no chat message, no inbox entry.
 */
describe('Poller activity stream -> relay', () => {
  let server: Server;
  const PORT = 3901;
  const RELAY_URL = `http://127.0.0.1:${PORT}`;

  beforeAll(async () => {
    await resetStore();
    const app = express();
    app.use(express.json());
    app.all('/api/send', sendHandler);
    app.all('/api/presence', presenceHandler);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(PORT, '127.0.0.1', () => resolve(s));
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  afterEach(async () => {
    await resetStore();
  });

  const makePoller = (activityMode: 'full' | 'state' | 'off', roomCode: string) =>
    new CoWorkPoller({
      roomCode,
      agentId: 'gem-ai',
      repoPath: process.cwd(),
      relayUrl: RELAY_URL,
      harness: 'Gemini CLI',
      model: 'test-model',
      autoPull: false,
      activityMode,
    });

  it('publishes reported state on the next heartbeat', async () => {
    const poller = makePoller('state', 'STREAM-1');
    expect(await poller.poll()).toBe(true);

    poller.setActivity({ state: 'editing', summary: 'threading activity through the poller', detail: 'private' });
    expect(await poller.poll()).toBe(true);

    const room = await getRoom('STREAM-1');
    const participant = room?.participants?.['gem-ai'];
    expect(participant?.activity?.state).toBe('editing');
    expect(participant?.activity?.summary).toBe('threading activity through the poller');
    // mode=state: the reasoning never leaves the machine.
    expect(participant?.activity?.detail).toBeUndefined();
    expect(participant?.activity?.files).toBeUndefined();
    // The status line humans already read stays in sync with the richer field.
    expect(participant?.status).toBe('editing: threading activity through the poller');
    expect(participant?.harness).toBe('Gemini CLI');
    expect(room?.history.length ?? 0).toBe(0);
    expect(poller.getActivity()?.state).toBe('editing');
  });

  it('shares edited file paths in full mode and stops everything in off mode', async () => {
    const full = makePoller('full', 'STREAM-2');
    await full.poll();
    full.setActivity({ state: 'testing', summary: 'npm test', files: ['src/poller.ts'] });
    await full.poll();
    const fullRoom = await getRoom('STREAM-2');
    expect(fullRoom?.participants?.['gem-ai'].activity?.files).toContain('src/poller.ts');
    expect(fullRoom?.participants?.['gem-ai'].activity?.detail).toBeUndefined();

    const muted = makePoller('off', 'STREAM-3');
    await muted.poll();
    muted.setActivity({ state: 'editing', summary: 'should not travel' });
    await muted.poll();
    const mutedRoom = await getRoom('STREAM-3');
    expect(mutedRoom?.participants?.['gem-ai'].activity).toBeUndefined();
    // Turning the stream off must not take presence down with it.
    expect(mutedRoom?.participants?.['gem-ai'].lastSeen).toBeGreaterThan(0);
  });

  it('carries a status-only agent without any report at all', async () => {
    const poller = makePoller('state', 'STREAM-4');
    await poller.poll();
    poller.setStatus('Locked files: src/git.ts');
    await poller.poll();
    const room = await getRoom('STREAM-4');
    expect(room?.participants?.['gem-ai'].activity?.state).toBe('editing');
    expect(room?.participants?.['gem-ai'].activity?.summary).toBe('Locked files: src/git.ts');
  });
});
