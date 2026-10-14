import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRoom, saveRoom } from './_store.js';
import type { CoWorkMessage, SendMessageResponse, ContentType } from './_types.js';

export interface SendPayload {
  roomCode: string;
  senderId: string;
  targetId?: string;
  contentType?: ContentType;
  text?: string;
  files?: string[];
  commitHash?: string;
  senderModel?: string;
  senderHarness?: string;
}

/**
 * Pure business logic for POST /api/send
 */
export async function handleSend(payload: SendPayload): Promise<{ status: number; body: SendMessageResponse }> {
  const roomCode = (payload.roomCode || 'DEFAULT').trim().toUpperCase();
  const senderId = (payload.senderId || 'anonymous').trim();
  let targetId = (payload.targetId || 'all').trim();
  let contentType: ContentType = payload.contentType || 'CHAT';
  const text = payload.text || '';
  const files = payload.files || [];
  const commitHash = payload.commitHash;
  const senderModel = payload.senderModel;
  const senderHarness = payload.senderHarness;

  // 1. Mentions Parsing: e.g., "@peer-ai build navbar"
  const mentionMatch = text.match(/@([a-zA-Z0-9_-]+)/);
  if (mentionMatch) {
    const mentionedId = mentionMatch[1];
    // If target was default 'all', route specifically to the mentioned entity
    if (targetId === 'all') {
      targetId = mentionedId;
      if (contentType === 'CHAT') {
        contentType = 'CROSS_PROMPT';
      }
    }
  }

  const room = await getRoom(roomCode);

  // Update sender presence timestamp & model recognition
  if (!room.participants[senderId]) {
    room.participants[senderId] = {
      clientId: senderId,
      role: senderId.includes('ai') ? 'agent' : 'human',
      status: contentType === 'FILE_LOCK' ? 'Locked files' : 'Active',
      lastSeen: Date.now(),
      model: senderModel,
      harness: senderHarness,
    };
  } else {
    room.participants[senderId].lastSeen = Date.now();
    if (contentType === 'FILE_LOCK') {
      room.participants[senderId].status = 'Working on files';
    }
    if (senderModel) room.participants[senderId].model = senderModel;
    if (senderHarness) room.participants[senderId].harness = senderHarness;
  }

  // 2. Handle FILE_LOCK
  if (contentType === 'FILE_LOCK') {
    const conflictingFiles: string[] = [];
    let lockedByAgent = '';

    for (const file of files) {
      const existing = room.fileLocks[file];
      if (existing && existing.lockedBy !== senderId) {
        conflictingFiles.push(file);
        lockedByAgent = existing.lockedBy;
      }
    }

    if (conflictingFiles.length > 0) {
      return {
        status: 409,
        body: {
          ok: false,
          error: 'FILE_LOCKED',
          lockedBy: lockedByAgent,
          conflictingFiles,
          roomStateSummary: {
            roomCode: room.roomCode,
            activeFileLocks: Object.keys(room.fileLocks).length,
            participantCount: Object.keys(room.participants).length,
            latestCommit: room.latestCommit,
          }
        }
      };
    }

    // Acquire locks
    const now = Date.now();
    for (const file of files) {
      room.fileLocks[file] = {
        lockedBy: senderId,
        task: text || 'Locked for editing',
        timestamp: now,
      };
    }
  }

  // 3. Handle FILE_UNLOCK
  if (contentType === 'FILE_UNLOCK') {
    if (files.length > 0) {
      for (const file of files) {
        if (room.fileLocks[file]?.lockedBy === senderId) {
          delete room.fileLocks[file];
        }
      }
    } else {
      for (const [file, lock] of Object.entries(room.fileLocks)) {
        if (lock.lockedBy === senderId) {
          delete room.fileLocks[file];
        }
      }
    }
  }

  // 4. Handle GIT_PUSH: automatically unlock files held by sender & record commit
  if (contentType === 'GIT_PUSH') {
    for (const [file, lock] of Object.entries(room.fileLocks)) {
      if (lock.lockedBy === senderId) {
        delete room.fileLocks[file];
      }
    }
    if (commitHash) {
      room.latestCommit = {
        hash: commitHash,
        message: text || 'Git commit pushed to main',
        author: senderId,
        timestamp: Date.now(),
      };
    }
  }

  // 5. Construct CoWorkMessage
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const message: CoWorkMessage = {
    messageId,
    timestamp: Date.now(),
    roomCode: room.roomCode,
    senderId,
    targetId,
    contentType,
    text,
    files: files.length > 0 ? files : undefined,
    commitHash,
    senderModel,
    senderHarness,
  };

  // Add to Room History (capped at 100)
  room.history.push(message);
  if (room.history.length > 100) {
    room.history.shift();
  }

  // 6. Multicast Queueing into inboxes
  if (targetId === 'all') {
    for (const participantId of Object.keys(room.participants)) {
      if (participantId !== senderId) {
        if (!room.inboxes[participantId]) room.inboxes[participantId] = [];
        room.inboxes[participantId].push(message);
      }
    }
  } else {
    // Specific target
    if (!room.inboxes[targetId]) room.inboxes[targetId] = [];
    room.inboxes[targetId].push(message);

    // Also mirror to human dashboard participants so phone/web UI observes cross-agent interactions
    for (const [pId, p] of Object.entries(room.participants)) {
      if (p.role === 'human' && pId !== senderId && pId !== targetId) {
        if (!room.inboxes[pId]) room.inboxes[pId] = [];
        room.inboxes[pId].push(message);
      }
    }
  }

  await saveRoom(room);

  return {
    status: 200,
    body: {
      ok: true,
      messageId,
      roomStateSummary: {
        roomCode: room.roomCode,
        activeFileLocks: Object.keys(room.fileLocks).length,
        participantCount: Object.keys(room.participants).length,
        latestCommit: room.latestCommit,
      }
    }
  };
}

/**
 * Standard Vercel Serverless Function Handler
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body || {};
    const result = await handleSend(payload);
    res.statusCode = result.status;
    return res.json(result.body);
  } catch (err: any) {
    console.error('[API Send Error]', err);
    res.statusCode = 500;
    return res.json({ ok: false, error: err.message || 'Internal Server Error' });
  }
}
