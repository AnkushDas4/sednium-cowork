import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { server } from '../src/index.js';

/**
 * The agent side of "one repository per room", driven through the real MCP tool surface with a fake
 * relay. What matters here is who wins when the room and the laptop disagree: the room always does,
 * and the agent has to be told in words it can act on rather than left to find out at push time.
 */
let client: Client | undefined;
const dirs: string[] = [];

const tempCheckout = (originUrl?: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-connect-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-b', 'main', dir], { stdio: 'ignore' });
  if (originUrl) execFileSync('git', ['remote', 'add', 'origin', originUrl], { cwd: dir, stdio: 'ignore' });
  return dir;
};

afterEach(async () => {
  await client?.close();
  await server.close();
  vi.unstubAllGlobals();
  while (dirs.length) {
    try { fs.rmSync(dirs.pop()!, { recursive: true, force: true }); } catch { /* gone */ }
  }
});

interface FakeRelay {
  /** what the relay answers on /api/presence - including, crucially, the binding */
  gitRepo: Record<string, unknown> | null;
  /** set when the room is already bound to something else: the first claim gets a 409 and this wins */
  conflict?: Record<string, unknown>;
  sends: Array<Record<string, unknown>>;
}

function relay(state: FakeRelay) {
  const handler = vi.fn(async (url: string, init?: { body?: string }) => {
    if (String(url).endsWith('/api/send')) {
      const payload = JSON.parse(String(init?.body || '{}'));
      state.sends.push(payload);
      if (payload.contentType === 'GIT_REPO') {
        if (state.conflict) {
          // Somebody linked it first: the room answers 409 and keeps its own binding.
          state.gitRepo = state.conflict;
          return new Response(JSON.stringify({
            ok: false,
            error: `This room is bound to ${state.conflict.host}/${state.conflict.slug}.`,
            code: 'GIT_REPO_TAKEN',
            hint: "Push and clone the room's repository. It is immutable, so to work elsewhere open a new room.",
          }), { status: 409 });
        }
        const url = String(payload.text);
        state.gitRepo = {
          url,
          host: url.replace(/^[a-z]+:\/\/([^/]+).*/, '$1'),
          slug: url.replace(/^[a-z]+:\/\/[^/]+\//, '').replace(/\.git$/, ''),
          by: payload.senderId,
          at: Date.now(),
          source: 'linked',
        };
      }
      return new Response(JSON.stringify({ ok: true, messageId: 'msg_1', gitRepo: state.gitRepo }), { status: 200 });
    }
    return new Response(JSON.stringify({
      ok: true,
      roomCode: 'TEST',
      messages: [],
      participants: {},
      fileLocks: {},
      latestCommit: null,
      gitRepo: state.gitRepo,
      recentHistory: [],
    }), { status: 200 });
  });
  vi.stubGlobal('fetch', handler);
  return handler;
}

async function connectWith(args: Record<string, unknown>) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(b);
  const result = await client.callTool({
    name: 'cowork_connect',
    arguments: { agentId: 'vfy-ai', roomCode: 'TEST', relayUrl: 'https://relay.invalid', participantToken: 'a'.repeat(64), ...args },
  });
  const text = (result.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? '').join('\n');
  return { text, isError: result.isError === true };
}

const textOf = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? '').join('\n');

describe('cowork_connect and the room repository', () => {
  it('links a configured repository to a room that has none', async () => {
    const state: FakeRelay = { gitRepo: null, sends: [] };
    relay(state);
    const dir = tempCheckout('https://github.com/acme/app.git');

    const out = await connectWith({ repoUrl: 'acme/app', repoPath: dir, cloneIfMissing: false });

    const claim = state.sends.find((p) => p.contentType === 'GIT_REPO');
    expect(claim, 'no repository claim was sent').toMatchObject({ senderId: 'vfy-ai', text: 'https://github.com/acme/app' });
    expect(out.text).toContain('Room repository: github.com/acme/app');
    expect(out.text).toContain('Push and clone only here');
    expect(out.isError).toBe(false);
  });

  it('obeys a room that already decided, and says the checkout is wrong', async () => {
    const state: FakeRelay = {
      gitRepo: { url: 'https://github.com/other/repo', host: 'github.com', slug: 'other/repo', by: 'host-ai', at: Date.now(), source: 'linked' },
      sends: [],
    };
    relay(state);
    const dir = tempCheckout('https://github.com/acme/app.git');

    const out = await connectWith({ repoUrl: 'acme/app', repoPath: dir, cloneIfMissing: false });

    // The room wins: no competing claim is even attempted.
    expect(state.sends.some((p) => p.contentType === 'GIT_REPO')).toBe(false);
    expect(out.text).toContain('Room repository: github.com/other/repo');
    expect(out.text).toMatch(/points at acme\/app, not the room's other\/repo/);
    expect(out.text).toMatch(/git remote set-url origin https:\/\/github.com\/other\/repo/);
    expect(out.isError).toBe(false); // a warning, not a failed connection
  });

  it('reports a refusal from the room instead of pretending the link worked', async () => {
    const state: FakeRelay = {
      gitRepo: null,
      conflict: { url: 'https://gitlab.com/team/real', host: 'gitlab.com', slug: 'team/real', by: 'first-ai', at: 1, source: 'push' },
      sends: [],
    };
    relay(state);
    const dir = tempCheckout('https://github.com/acme/app.git');

    const out = await connectWith({ repoUrl: 'acme/app', repoPath: dir, cloneIfMissing: false });

    expect(state.sends.some((p) => p.contentType === 'GIT_REPO')).toBe(true); // it tried; the room said no
    expect(out.text).toContain('gitlab.com/team/real'); // and it obeyed what the room said instead
    expect(out.text).toMatch(/points at acme\/app, not the room's team\/real/);
    expect(out.isError).toBe(false);
  });

  it('offers the clone command when there is no repository here', async () => {
    const state: FakeRelay = {
      gitRepo: { url: 'https://github.com/acme/app', host: 'github.com', slug: 'acme/app', by: 'host-ai', at: 1, source: 'linked' },
      sends: [],
    };
    relay(state);
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-norepo-'));
    dirs.push(empty);

    const out = await connectWith({ repoPath: empty, cloneIfMissing: false });
    expect(out.text).toMatch(/This directory is not a git repository/);
    expect(out.text).toMatch(/git clone https:\/\/github.com\/acme\/app/);
    expect(fs.readdirSync(empty)).toHaveLength(0); // refusing means refusing, not half-cloning
  });

  it('tells an agent the rule in the inbox it reads between steps', async () => {
    const state: FakeRelay = {
      gitRepo: { url: 'ssh://git@github.com/acme/app', host: 'github.com', slug: 'acme/app', by: 'pusher-ai', at: 1, source: 'push' },
      sends: [],
    };
    relay(state);
    await connectWith({ repoPath: tempCheckout('git@github.com:acme/app.git'), cloneIfMissing: false });

    const inbox = await client!.callTool({ name: 'cowork_check_inbox', arguments: {} });
    expect(textOf(inbox)).toContain('Room repository: github.com/acme/app');
    expect(textOf(inbox)).toContain('push and clone only here');
  });

  it('says so when nothing is decided yet, instead of inventing a rule', async () => {
    const state: FakeRelay = { gitRepo: null, sends: [] };
    relay(state);
    const dir = tempCheckout('https://github.com/someone/else.git');

    const out = await connectWith({ repoPath: dir, cloneIfMissing: false });
    expect(state.sends).toHaveLength(0); // no config, so nothing to claim
    expect(out.text).toMatch(/No repository linked for this room yet: your first push \(someone\/else\) decides it/);
  });
});
