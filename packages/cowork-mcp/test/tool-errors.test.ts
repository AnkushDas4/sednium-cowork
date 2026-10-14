import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { server } from '../src/index.js';

let client: Client | undefined;
afterEach(async () => { await client?.close(); await server.close(); vi.unstubAllGlobals(); });
async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: 'test', version: '1' });
  await client.connect(b);
  return client;
}
const args = { agentId: 'agent', roomCode: 'TEST', relayUrl: 'https://relay.invalid', participantToken: 'a'.repeat(64) };
describe('MCP truthful errors', () => {
  it('does not report connected when the relay returns 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":false}', { status: 503 })));
    const c = await connect();
    const result = await c.callTool({ name: 'cowork_connect', arguments: args });
    expect(result.isError).toBe(true);
  });
  it('does not report sent when the relay returns 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/api/send')
      ? new Response('{"ok":false}', { status: 503 })
      : new Response(JSON.stringify({ ok: true, messages: [], participants: {}, fileLocks: {} }))));
    const c = await connect();
    expect((await c.callTool({ name: 'cowork_connect', arguments: args })).isError).not.toBe(true);
    expect((await c.callTool({ name: 'cowork_message_peer', arguments: { targetId: 'other', message: 'hello' } })).isError).toBe(true);
  });
});
