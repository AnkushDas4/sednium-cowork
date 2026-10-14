#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import qrcodeTerminal from 'qrcode-terminal';
import path from 'node:path';
import { CoWorkPoller } from './poller.js';
import { safeCommitAndPush, getLatestCommit } from './git.js';
import type { ContentType, CoWorkMessage } from './types.js';

let activePoller: CoWorkPoller | null = null;

/**
 * Smart detection of running AI model and harness environment
 */
export function detectSmartModelAndHarness(
  customModel?: string,
  customHarness?: string
): { harness: string; model: string } {
  let harness = customHarness;
  let model = customModel;

  if (!harness) {
    if (
      process.env.ANTIGRAVITY_APP_DATA_DIR ||
      process.env.ANTIGRAVITY_SOURCE_METADATA ||
      process.env.GEMINI_CLI
    ) {
      harness = 'Antigravity';
    } else if (
      process.env.CLAUDE_CODE ||
      process.env.CLAUDE_PROJECT_DIR ||
      process.env.ANTHROPIC_MODEL ||
      process.env.CLAUDE_SESSION_ID
    ) {
      harness = 'Claude Code';
    } else if (process.env.CURSOR_PROJECT_DIR || process.env.CURSOR_AGENT) {
      harness = 'Cursor';
    } else if (process.env.WINDSURF_API_KEY || process.env.CODEIUM_API_KEY) {
      harness = 'Windsurf';
    } else {
      harness = 'AI Agent';
    }
  }

  if (!model) {
    if (harness === 'Antigravity') {
      model = process.env.MODEL || process.env.ANTIGRAVITY_MODEL || 'Gemini 3.8 Flash';
    } else if (harness === 'Claude Code') {
      model = process.env.ANTHROPIC_MODEL || 'Claude 3.7 Sonnet';
    } else if (harness === 'Cursor') {
      model = process.env.CURSOR_MODEL || 'Claude 3.7 / GPT-4o';
    } else if (harness === 'Windsurf') {
      model = 'Cascade AI';
    } else {
      model = process.env.AI_MODEL || 'Autonomous AI';
    }
  }

  return { harness, model };
}

const server = new Server(
  {
    name: 'sednium-cowork-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register Available Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'cowork_connect',
        description:
          'Connects this agent to a Sednium CoWork room. Starts the 2s background sync loop, prints the ASCII QR code and join URL for human phone/laptop pairing.',
        inputSchema: {
          type: 'object',
          properties: {
            roomCode: {
              type: 'string',
              description: 'Optional 6-char room code (e.g. SED-409). If omitted, a fresh code is generated.',
            },
            agentId: {
              type: 'string',
              description: 'Unique agent identifier, e.g. "loid-ai" or "peer-ai".',
            },
            repoPath: {
              type: 'string',
              description: 'Local filesystem absolute path to the git repository (defaults to current working directory).',
            },
            relayUrl: {
              type: 'string',
              description: 'URL of the CoWork relay (defaults to COWORK_RELAY_URL or https://cowork.sednium.com).',
            },
            model: {
              type: 'string',
              description: 'Optional AI model name (auto-detected if omitted, e.g. "Gemini 3.8 Flash", "Claude 3.7 Sonnet").',
            },
            harness: {
              type: 'string',
              description: 'Optional AI harness name (auto-detected if omitted, e.g. "Antigravity", "Claude Code", "Cursor").',
            },
          },
          required: ['agentId'],
        },
      },
      {
        name: 'cowork_claim_files',
        description:
          'Locks one or more files on the relay to prevent git merge conflicts with the peer AI. Returns 409 Conflict if already locked by the other agent.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'Relative paths of files you intend to modify (e.g. ["src/App.tsx"]).',
            },
            taskDescription: {
              type: 'string',
              description: 'Brief description of the task you are performing on these files.',
            },
          },
          required: ['files', 'taskDescription'],
        },
      },
      {
        name: 'cowork_message_peer',
        description:
          'Sends an instruction, schema, question, or sync status to the peer AI (@peer-ai) or human (@peer). Also drains and returns any pending messages in your inbox.',
        inputSchema: {
          type: 'object',
          properties: {
            targetId: {
              type: 'string',
              description: 'Target recipient (e.g. "peer-ai", "loid-ai", "peer", "loid", or "all").',
            },
            message: {
              type: 'string',
              description: 'The message or task prompt to send.',
            },
            contentType: {
              type: 'string',
              enum: ['AGENT_SYNC', 'CROSS_PROMPT', 'CHAT'],
              description: 'Message type (defaults to "AGENT_SYNC").',
            },
          },
          required: ['targetId', 'message'],
        },
      },
      {
        name: 'cowork_sync_main',
        description:
          'Safely runs git pull --rebase --autostash, commits all changes, pushes to origin main, and notifies the relay to release your file locks and trigger auto-pull on the peer laptop.',
        inputSchema: {
          type: 'object',
          properties: {
            commitMessage: {
              type: 'string',
              description: 'Git commit message describing your completed changes.',
            },
          },
          required: ['commitMessage'],
        },
      },
      {
        name: 'cowork_check_inbox',
        description:
          'Checks and drains all unread @ commands and messages from humans or the peer AI, and returns the current room file lock status.',
        inputSchema: {
          type: 'object',
          properties: {
            waitForSeconds: {
              type: 'number',
              description: 'Optional number of seconds to wait if inbox is currently empty (e.g. 10).',
            },
          },
        },
      },
      {
        name: 'cowork_watch_loop',
        description:
          'Listens continuously for up to durationSeconds (default 30s) and returns immediately when a new @ instruction arrives so the agent can execute it autonomously.',
        inputSchema: {
          type: 'object',
          properties: {
            durationSeconds: {
              type: 'number',
              description: 'Maximum seconds to wait for incoming work (default 30).',
            },
          },
        },
      },
    ],
  };
});

// Helper: generate ASCII QR Code
async function getAsciiQr(url: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      qrcodeTerminal.generate(url, { small: true }, (qrcode: string) => {
        resolve(qrcode);
      });
    } catch {
      resolve('[QR Code display unavailable]');
    }
  });
}

// Tool Execution Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'cowork_connect': {
        const agentId = String(args?.agentId || 'agent-ai');
        const repoPath = path.resolve(String(args?.repoPath || process.cwd()));
        const relayUrl = String(
          args?.relayUrl || process.env.COWORK_RELAY_URL || 'https://cowork.sednium.com'
        );

        let roomCode = args?.roomCode ? String(args.roomCode).toUpperCase() : '';
        if (!roomCode) {
          try {
            const codeRes = await fetch(`${relayUrl.replace(/\/+$/, '')}/api/presence?action=new-room`);
            if (codeRes.ok) {
              const codeData: any = await codeRes.json();
              if (codeData.roomCode) roomCode = codeData.roomCode;
            }
          } catch {
            // fallback
          }
          if (!roomCode) {
            const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
            let suffix = '';
            for (let i = 0; i < 4; i++) {
              suffix += chars[Math.floor(Math.random() * chars.length)];
            }
            roomCode = `SED-${suffix}`;
          }
        }

        const { harness, model } = detectSmartModelAndHarness(
          args?.model ? String(args.model) : undefined,
          args?.harness ? String(args.harness) : undefined
        );

        if (activePoller) {
          activePoller.stop();
        }

        activePoller = new CoWorkPoller({
          roomCode,
          agentId,
          repoPath,
          relayUrl,
          harness,
          model,
        });

        activePoller.start();

        const joinUrl = `${relayUrl.replace(/\/+$/, '')}/?room=${encodeURIComponent(roomCode)}`;
        const asciiQr = await getAsciiQr(joinUrl);

        return {
          content: [
            {
              type: 'text',
              text: `✅ Connected to Sednium CoWork Room: ${roomCode} as @${agentId}\n` +
                    `🤖 Smart Model Recognition: [${model}] via [${harness}]\n\n` +
                    `🔗 Join URL (Web/Phone Dashboard): ${joinUrl}\n\n` +
                    `📱 Scan QR on phone:\n${asciiQr}\n\n` +
                    `📁 Repository Path: ${repoPath}\n` +
                    `🔄 Background Polling: Active (2000ms loop with Auto-Git Pull on peer pushes enabled)`,
            },
          ],
        };
      }

      case 'cowork_claim_files': {
        if (!activePoller) {
          throw new Error('Not connected to a CoWork room. Run cowork_connect first.');
        }

        const files = (args?.files as string[]) || [];
        const taskDescription = String(args?.taskDescription || 'Editing files');

        const res = await fetch(`${activePoller.getRelayUrl()}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode: activePoller.getRoomCode(),
            senderId: activePoller.getAgentId(),
            targetId: 'all',
            contentType: 'FILE_LOCK',
            text: taskDescription,
            files,
          }),
        });

        const data: any = await res.json();

        if (res.status === 409 || !data.ok) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `❌ FILE LOCK CONFLICT: The following file(s) are currently locked by @${data.lockedBy || 'peer agent'}:\n` +
                      `${(data.conflictingFiles || []).map((f: string) => `  - ${f}`).join('\n')}\n\n` +
                      `Recommendation: Please coordinate with @${data.lockedBy} using cowork_message_peer or choose non-overlapping files.`,
              },
            ],
          };
        }

        activePoller.setStatus(`Locked files: ${files.join(', ')}`);

        return {
          content: [
            {
              type: 'text',
              text: `🔒 Successfully claimed file lock on:\n${files.map((f) => `  - ${f}`).join('\n')}\n\n` +
                    `Task: ${taskDescription}\nLocks will automatically expire if idle for 90s.`,
            },
          ],
        };
      }

      case 'cowork_message_peer': {
        if (!activePoller) {
          throw new Error('Not connected to a CoWork room. Run cowork_connect first.');
        }

        const targetId = String(args?.targetId || 'all');
        const message = String(args?.message || '');
        const contentType = (args?.contentType as ContentType) || 'AGENT_SYNC';

        await fetch(`${activePoller.getRelayUrl()}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode: activePoller.getRoomCode(),
            senderId: activePoller.getAgentId(),
            targetId,
            contentType,
            text: message,
            senderModel: activePoller.getModel(),
            senderHarness: activePoller.getHarness(),
          }),
        });

        const pending = activePoller.drainInbox();

        return {
          content: [
            {
              type: 'text',
              text: `✉️ Sent ${contentType} message to @${targetId}: "${message}"\n\n` +
                    (pending.length > 0
                      ? `📬 Unread incoming messages from inbox (${pending.length}):\n` +
                        pending.map((m) => `[@${m.senderId} -> @${m.targetId}][${m.contentType}]: ${m.text}`).join('\n')
                      : `📬 No other pending unread messages in inbox.`),
            },
          ],
        };
      }

      case 'cowork_sync_main': {
        if (!activePoller) {
          throw new Error('Not connected to a CoWork room. Run cowork_connect first.');
        }

        const commitMessage = String(args?.commitMessage || 'feat: cowork sync');
        activePoller.setStatus('Syncing git to main');

        const gitRes = await safeCommitAndPush(activePoller.getRepoPath(), commitMessage);

        if (!gitRes.success) {
          activePoller.setStatus('Git sync failed');
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: `❌ Git push to origin main failed: ${gitRes.output}`,
              },
            ],
          };
        }

        // Notify relay of push -> releases all locks and triggers peer auto-pull
        await fetch(`${activePoller.getRelayUrl()}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomCode: activePoller.getRoomCode(),
            senderId: activePoller.getAgentId(),
            targetId: 'all',
            contentType: 'GIT_PUSH',
            text: commitMessage,
            commitHash: gitRes.hash,
            senderModel: activePoller.getModel(),
            senderHarness: activePoller.getHarness(),
          }),
        });

        activePoller.setStatus('Idle / Synced with main');

        return {
          content: [
            {
              type: 'text',
              text: `🚀 Successfully committed and pushed to main:\n` +
                    `  Hash: ${gitRes.hash || 'HEAD'}\n` +
                    `  Message: "${commitMessage}"\n\n` +
                    `🔓 All file locks held by @${activePoller.getAgentId()} have been liberated.\n` +
                    `📡 Peer laptop MCPs have been notified and are auto-rebasing origin main.`,
            },
          ],
        };
      }

      case 'cowork_check_inbox': {
        if (!activePoller) {
          throw new Error('Not connected to a CoWork room. Run cowork_connect first.');
        }

        const waitSeconds = typeof args?.waitForSeconds === 'number' ? args.waitForSeconds : 0;

        let messages = activePoller.drainInbox();
        if (messages.length === 0 && waitSeconds > 0) {
          const waitedMsg = await activePoller.waitForMessage(waitSeconds);
          if (waitedMsg) {
            messages = [waitedMsg];
          }
        }

        const locks = activePoller.getFileLocks();
        const latestCommit = activePoller.getLatestCommit();

        return {
          content: [
            {
              type: 'text',
              text: `📬 Inbox Status for @${activePoller.getAgentId()} (Room ${activePoller.getRoomCode()}):\n\n` +
                    `Unread Messages (${messages.length}):\n` +
                    (messages.length === 0
                      ? `  (No new unread messages)\n`
                      : messages
                          .map((m) => `  - [@${m.senderId} → @${m.targetId}][${m.contentType}]: ${m.text}`)
                          .join('\n') + '\n') +
                    `\nActive File Locks (${Object.keys(locks).length}):\n` +
                    (Object.keys(locks).length === 0
                      ? `  (No files locked)\n`
                      : Object.entries(locks)
                          .map(([f, l]) => `  - ${f} (locked by @${l.lockedBy}: "${l.task}")`)
                          .join('\n') + '\n') +
                    (latestCommit ? `\nLatest Commit: ${latestCommit.hash.slice(0, 7)} "${latestCommit.message}" by @${latestCommit.author}` : ''),
            },
          ],
        };
      }

      case 'cowork_watch_loop': {
        if (!activePoller) {
          throw new Error('Not connected to a CoWork room. Run cowork_connect first.');
        }

        const duration = typeof args?.durationSeconds === 'number' ? args.durationSeconds : 30;
        activePoller.setStatus(`Listening for instructions (${duration}s window)`);

        const msg = await activePoller.waitForMessage(duration);
        activePoller.setStatus('Idle / Connected');

        if (!msg) {
          return {
            content: [
              {
                type: 'text',
                text: `⏳ Watched for ${duration}s. No new @ instructions arrived. System is idle.`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: `⚡ INSTRUCTION RECEIVED from @${msg.senderId}!\n\n` +
                    `Target: @${msg.targetId}\n` +
                    `Type: ${msg.contentType}\n` +
                    `Content: ${msg.text}\n` +
                    (msg.files ? `Files: ${msg.files.join(', ')}\n` : '') +
                    `\nReady to execute task.`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error executing ${name}: ${err.message || String(err)}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Sednium CoWork MCP] Server running on stdio.');
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((err) => {
    console.error('Fatal MCP error:', err);
    process.exit(1);
  });
}

export { server };
