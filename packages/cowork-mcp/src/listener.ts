import { parseInviteLink } from './invite.js';
import { getParticipantToken } from './identity.js';
import { spawn } from 'node:child_process';

export interface ListenerOptions {
  relayUrl?: string;
  roomCode?: string;
  inviteKey?: string;
  inviteLink?: string;
  agentId?: string;
  harness?: string;
  execCommand?: string;
  once?: boolean;
}

export function parseListenerArgs(argv: string[]): ListenerOptions {
  const opts: ListenerOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--link' && argv[i + 1]) {
      opts.inviteLink = argv[++i];
    } else if (arg === '--room-code' && argv[i + 1]) {
      opts.roomCode = argv[++i];
    } else if (arg === '--invite-key' && argv[i + 1]) {
      opts.inviteKey = argv[++i];
    } else if (arg === '--agent-id' && argv[i + 1]) {
      opts.agentId = argv[++i];
    } else if (arg === '--relay-url' && argv[i + 1]) {
      opts.relayUrl = argv[++i];
    } else if (arg === '--harness' && argv[i + 1]) {
      opts.harness = argv[++i];
    } else if (arg === '--exec' && argv[i + 1]) {
      opts.execCommand = argv[++i];
    } else if (arg === '--once') {
      opts.once = true;
    }
  }
  return opts;
}

export async function runListener(rawArgs: string[]): Promise<void> {
  const args = parseListenerArgs(rawArgs);
  const parsedLink = parseInviteLink(args.inviteLink || process.env.COWORK_INVITE_LINK || '');

  const relayUrl = (args.relayUrl || parsedLink.relayUrl || process.env.COWORK_RELAY_URL || 'https://cowork.sednium.com').replace(/\/+$/, '');
  const roomCode = (args.roomCode || parsedLink.roomCode || process.env.COWORK_ROOM_CODE || '').toUpperCase();
  const inviteKey = args.inviteKey || parsedLink.inviteKey || process.env.COWORK_INVITE_KEY || '';
  const agentId = args.agentId || process.env.COWORK_AGENT_ID || 'autonomous-ai';
  const harness = args.harness || process.env.COWORK_HARNESS || 'CLI Listener';
  const token = getParticipantToken();

  if (!roomCode) {
    console.error('❌ Error: Room code is required. Pass --link "https://relay/?room=...#k=..." or --room-code CODE.');
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`  ⚡ SEDNIUM COWORK AUTONOMOUS AGENT LISTENER`);
  console.log(`======================================================`);
  console.log(`📡 Relay:       ${relayUrl}`);
  console.log(`🔑 Room:        ${roomCode}`);
  console.log(`🤖 Agent:       @${agentId} via ${harness}`);
  console.log(`💰 Token Cost:  0 tokens / $0.00 while waiting`);
  console.log(`⏱️  Polling:     2000ms presence loop`);
  if (args.execCommand) {
    console.log(`⚙️  Exec Hook:   ${args.execCommand}`);
  }
  console.log(`======================================================\n`);
  console.log(`[CoWork Listener] Connected and listening. Waiting for tasks...\n`);

  let acknowledgements: string[] = [];
  let isPolling = false;
  let isExecuting = false;

  async function poll() {
    if (isPolling) return;
    isPolling = true;

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Cowork-Client-Token': token,
      };
      if (inviteKey) {
        headers['X-Cowork-Invite-Key'] = inviteKey;
      }

      const res = await fetch(`${relayUrl}/api/presence`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          action: 'inbox',
          roomCode,
          clientId: agentId,
          role: 'agent',
          status: isExecuting ? 'Executing task' : 'Active / Listening for tasks',
          harness,
          ack: acknowledgements,
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.error(`[CoWork Listener] Heartbeat status ${res.status}: ${txt}`);
        return;
      }

      const data: any = await res.json();
      acknowledgements = (data.messages || []).map((m: any) => m.messageId);

      if (data.messages && data.messages.length > 0) {
        for (const msg of data.messages) {
          const isDirect = msg.targetId === agentId;
          const isMention = (msg.mentions && msg.mentions.includes(agentId)) ||
                            (msg.text && (msg.text.includes(`@${agentId}`) || msg.text.includes(`@${agentId.toLowerCase()}`)));
          const isBroadcast = msg.targetId === 'all';

          if ((isDirect || isMention || isBroadcast) && msg.senderId !== agentId) {
            const timeStr = new Date().toLocaleTimeString();
            console.log(`\n🔔 [${timeStr}] INCOMING TASK from @${msg.senderId} (Type: ${msg.contentType}):`);
            console.log(`------------------------------------------------------------------`);
            console.log(msg.text);
            console.log(`------------------------------------------------------------------\n`);

            if (args.execCommand || args.harness === 'claude') {
              isExecuting = true;
              const cmd = args.execCommand || `claude -p "${msg.text.replace(/"/g, '\\"')}"`;
              console.log(`🚀 Executing runner: ${cmd}`);

              const child = spawn(cmd, {
                shell: true,
                stdio: 'inherit',
                env: {
                  ...process.env,
                  COWORK_TASK: msg.text,
                  COWORK_SENDER: msg.senderId,
                  COWORK_ROOM: roomCode,
                  COWORK_AGENT: agentId,
                },
              });

              child.on('close', (code) => {
                isExecuting = false;
                console.log(`\n✔ Task execution completed with code ${code}.\n`);
                if (args.once) {
                  process.exit(code ?? 0);
                }
              });
            } else if (args.once) {
              process.exit(0);
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'TimeoutError' && !err.message?.includes('aborted')) {
        console.error(`[CoWork Listener] Polling error: ${err.message}`);
      }
    } finally {
      isPolling = false;
    }
  }

  // Initial poll immediately
  await poll();
  setInterval(poll, 2000);
}
