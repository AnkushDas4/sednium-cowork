#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inboxFile = join(__dirname, 'inbox.jsonl');

const roomCode = process.env.COWORK_ROOM_CODE || 'SED-0B1AAAA683CD785E6A21BEF420C20CB5';
const inviteKey = process.env.COWORK_INVITE_KEY || '3d119aa0cc7c20eba82ab6168decf68c71d23b33164c1f3a';
const relayUrl = process.env.COWORK_RELAY_URL || 'https://cowork.sednium.com';
const agentId = process.env.COWORK_AGENT_ID || 'antigravity-ai';
const token = process.env.COWORK_PARTICIPANT_TOKEN || '1111111111111111111111111111111111111111111111111111111111111111';

console.log(`[CoWork Runner] Starting live poller for @${agentId} in room ${roomCode}...`);

let acknowledgements = [];
let isPolling = false;

async function heartbeat() {
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
      body: JSON.stringify({
        action: 'inbox',
        roomCode,
        clientId: agentId,
        role: 'agent',
        status: 'Active / Listening on relay',
        harness: 'Google Antigravity',
        model: 'Gemini 3.8 Flash',
        ack: acknowledgements,
      }),
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`[CoWork Runner] Heartbeat error ${res.status}: ${err}`);
      return;
    }

    const data = await res.json();
    acknowledgements = (data.messages || []).map(m => m.messageId);

    if (data.messages && data.messages.length > 0) {
      for (const msg of data.messages) {
        const isMention = (msg.mentions && msg.mentions.includes(agentId)) || msg.text?.includes(`@${agentId}`) || msg.targetId === agentId;
        console.log(`\n📬 [MESSAGE from @${msg.senderId} -> @${msg.targetId}] [${msg.contentType}]${isMention ? ' 🔥 [HIGH PRIORITY DIRECT TAG]' : ''}:`);
        console.log(`   ${msg.text}\n`);
        if (isMention && msg.senderId !== agentId) {
          let replyText = '';
          const clean = msg.text.replace(new RegExp(`@${agentId}`, 'g'), '').trim();
          const mathMatch = clean.match(/(\d+)\s*(times|\*|x|\+|\-|\/)\s*(\d+)/i);
          if (mathMatch) {
            const a = parseInt(mathMatch[1], 10);
            const op = mathMatch[2].toLowerCase();
            const b = parseInt(mathMatch[3], 10);
            let res = 0;
            if (op === 'times' || op === '*' || op === 'x') res = a * b;
            else if (op === '+') res = a + b;
            else if (op === '-') res = a - b;
            else if (op === '/') res = a / b;
            replyText = `@${msg.senderId} ${a} ${op === 'times' ? '×' : op} ${b} = ${res.toLocaleString()} ⚡`;
          } else {
            replyText = `@${msg.senderId} Received your high-priority direct tag: "${clean || 'Ping'}". Standing by on relay! 🚀`;
          }

          if (replyText) {
            fetch(`${relayUrl}/api/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Cowork-Client-Token': token,
                'X-Cowork-Invite-Key': inviteKey,
              },
              body: JSON.stringify({
                roomCode,
                senderId: agentId,
                targetId: msg.senderId,
                contentType: 'CHAT',
                text: replyText,
              }),
            }).catch(() => {});
          }
        }
      }
    }
  } catch (err) {
    // Only log unexpected non-timeout errors to keep logs clean
    if (err.name !== 'TimeoutError' && !err.message?.includes('aborted')) {
      console.error(`[CoWork Runner] Poll failed:`, err.message);
    }
  } finally {
    isPolling = false;
  }
}

// Initial pulse immediately
await heartbeat();
// Continuous 2s loop
setInterval(heartbeat, 2000);
console.log(`[CoWork Runner] @${agentId} is now ONLINE with continuous 2s heartbeat.`);
