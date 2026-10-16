#!/usr/bin/env node
import { getParticipantToken } from '../packages/cowork-mcp/dist/identity.js';

const roomCode = process.env.COWORK_ROOM_CODE || 'SED-0D322DF4A63C72EE09D375257A5DAE62';
const inviteKey = process.env.COWORK_INVITE_KEY || '656b76613765310fe115c7beae03e711f66dd77ebd4abbf8';
const relayUrl = (process.env.COWORK_RELAY_URL || 'https://cowork.sednium.com').replace(/\/+$/, '');
const agentId = (process.env.COWORK_AGENT_ID || 'antigravity-ai').toLowerCase();
const token = process.env.COWORK_PARTICIPANT_TOKEN || getParticipantToken();

const command = process.argv[2];

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Cowork-Client-Token': token,
  'X-Cowork-Invite-Key': inviteKey,
});

async function main() {
  if (command === 'reply' || command === 'chat') {
    const text = process.argv.slice(3).join(' ');
    if (!text) {
      console.error('Usage: node scripts/agent-ctl.mjs reply <message>');
      process.exit(1);
    }
    const res = await fetch(`${relayUrl}/api/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        roomCode,
        senderId: agentId,
        targetId: 'all',
        contentType: 'CHAT',
        text,
      }),
    });
    const data = await res.json();
    console.log(`[Reply Sent] ok=${data.ok} id=${data.messageId || ''}`);
  } else if (command === 'report') {
    // node scripts/agent-ctl.mjs report --state editing --summary "..." --files "a,b" --detail "..."
    const getArg = (name) => {
      const idx = process.argv.indexOf(`--${name}`);
      return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1] : undefined;
    };
    const state = getArg('state') || 'thinking';
    const summary = getArg('summary') || 'Working on task';
    const detail = getArg('detail') || '';
    const filesStr = getArg('files') || '';
    const files = filesStr ? filesStr.split(',').map((f) => f.trim()).filter(Boolean) : [];
    const tool = getArg('tool') || '';

    const res = await fetch(`${relayUrl}/api/presence`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        action: 'inbox',
        roomCode,
        clientId: agentId,
        role: 'agent',
        status: `${state.toUpperCase()}: ${summary}`,
        harness: 'Google Antigravity',
        model: 'Antigravity Autonomous AI',
        activity: {
          state,
          summary,
          detail,
          files,
          tool,
          at: Date.now(),
        },
      }),
    });
    const data = await res.json();
    console.log(`[Report Sent] ok=${Boolean(data.participants)} state=${state} summary="${summary}"`);
  } else if (command === 'lock') {
    const filesStr = process.argv[3] || '';
    const task = process.argv[4] || 'Editing files';
    const files = filesStr.split(',').map((f) => f.trim()).filter(Boolean);
    const res = await fetch(`${relayUrl}/api/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        roomCode,
        senderId: agentId,
        targetId: 'all',
        contentType: 'FILE_LOCK',
        text: task,
        files,
      }),
    });
    const data = await res.json();
    console.log(`[Files Locked] ok=${data.ok} files=${files.join(', ')}`);
  } else if (command === 'unlock') {
    const filesStr = process.argv[3] || '';
    const files = filesStr.split(',').map((f) => f.trim()).filter(Boolean);
    const res = await fetch(`${relayUrl}/api/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        roomCode,
        senderId: agentId,
        targetId: 'all',
        contentType: 'FILE_UNLOCK',
        text: 'Releasing locks after completion',
        files,
      }),
    });
    const data = await res.json();
    console.log(`[Files Unlocked] ok=${data.ok} files=${files.join(', ')}`);
  } else if (command === 'git-push') {
    const commitHash = process.argv[3] || '';
    const message = process.argv[4] || 'feat: update';
    const filesStr = process.argv[5] || '';
    const files = filesStr ? filesStr.split(',').map((f) => f.trim()).filter(Boolean) : [];
    const res = await fetch(`${relayUrl}/api/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        roomCode,
        senderId: agentId,
        targetId: 'all',
        contentType: 'GIT_PUSH',
        text: `Pushed commit: ${message}`,
        commitHash,
        files,
      }),
    });
    const data = await res.json();
    console.log(`[Git Push Broadcast] ok=${data.ok} hash=${commitHash}`);
  } else {
    console.log('Commands: reply, report, lock, unlock, git-push');
  }
}

main().catch((err) => {
  console.error('[agent-ctl error]', err);
  process.exit(1);
});
