#!/usr/bin/env node
import { getParticipantToken } from '../packages/cowork-mcp/dist/identity.js';

const roomCode = process.env.COWORK_ROOM_CODE || 'SED-0D322DF4A63C72EE09D375257A5DAE62';
const inviteKey = process.env.COWORK_INVITE_KEY || '656b76613765310fe115c7beae03e711f66dd77ebd4abbf8';
const relayUrl = (process.env.COWORK_RELAY_URL || 'https://cowork.sednium.com').replace(/\/+$/, '');
const agentId = (process.env.COWORK_AGENT_ID || 'antigravity-ai').toLowerCase();
const token = process.env.COWORK_PARTICIPANT_TOKEN || getParticipantToken();

console.log(`[CoWork Reactive Watcher] Active in room ${roomCode} for @${agentId}...`);
console.log(`[CoWork Reactive Watcher] Relay: ${relayUrl} · Pure HTTP (0 token cost while waiting)`);

let acknowledgements = [];
let isPolling = false;

async function poll() {
  if (isPolling) return;
  isPolling = true;

  try {
    const res = await fetch(`${relayUrl}/api/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cowork-Client-Token': token,
        'X-Cowork-Invite-Key': inviteKey,
      },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        action: 'inbox',
        roomCode,
        clientId: agentId,
        role: 'agent',
        status: 'Active / Listening on relay',
        harness: 'Google Antigravity',
        model: 'Antigravity Autonomous AI',
        ack: acknowledgements,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      if (res.status !== 503) {
        console.error(`[CoWork Watcher] HTTP ${res.status}: ${err}`);
      }
      return;
    }

    const data = await res.json();
    acknowledgements = (data.messages || []).map((m) => m.messageId);

    if (data.messages && data.messages.length > 0) {
      let triggered = false;
      for (const msg of data.messages) {
        if ((msg.senderId || '').toLowerCase() === agentId) continue;
        const text = msg.text || '';
        const timeStr = new Date().toLocaleTimeString();
        console.log(`\n🚨 [COWORK_INCOMING_TASK] [${timeStr}] @${msg.senderId} says: "${text}" (Type: ${msg.contentType})`);
        triggered = true;
      }
      if (triggered && process.argv.includes('--once')) {
        process.exit(0);
      }
    }
  } catch (err) {
    if (err.name !== 'TimeoutError' && !err.message?.includes('aborted')) {
      // suppress network flicker
    }
  } finally {
    isPolling = false;
  }
}

// Initial pulse
await poll();
setInterval(poll, 2000);
