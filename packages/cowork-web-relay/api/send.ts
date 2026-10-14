import { randomUUID } from 'node:crypto';
import { mutateRoom, enqueue } from './_store.js';
import { ApiError, id, text as validateText, files as validateFiles, authorize, authorizeInvite, errorResponse } from './_validation.js';
import type { CoWorkMessage, SendMessageResponse, ContentType } from './_types.js';

export interface SendPayload {
  roomCode: string;
  /** Only consulted for rooms created without an invite key; the header is authoritative. */
  inviteKey?: string;
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
export async function handleSend(payload: SendPayload, token?: unknown, inviteKey?: unknown): Promise<{ status: number; body: SendMessageResponse }> {
  if (!payload || typeof payload !== 'object') throw new ApiError(400, 'Invalid payload');
  const roomCode = id(payload.roomCode, 'roomCode').toUpperCase();
  const senderId = id(payload.senderId, 'senderId');
  let targetId = id(payload.targetId ?? 'all', 'targetId');
  let contentType: ContentType = payload.contentType ?? 'CHAT';
  if (!['CHAT','CROSS_PROMPT','AGENT_SYNC','FILE_LOCK','FILE_UNLOCK','GIT_PUSH','STATUS'].includes(contentType)) throw new ApiError(400, 'Invalid contentType');
  const text = payload.text === undefined || payload.text === '' ? '' : validateText(payload.text, 'text', 16000);
  const files = validateFiles(payload.files);
  if (contentType === 'FILE_LOCK' && !files.length) throw new ApiError(400, 'At least one file is required');
  const commitHash = payload.commitHash === undefined ? undefined : validateText(payload.commitHash, 'commitHash', 64);
  if (commitHash && !/^[a-fA-F0-9]{7,64}$/.test(commitHash)) throw new ApiError(400, 'Invalid commitHash');
  const senderModel = payload.senderModel === undefined ? undefined : validateText(payload.senderModel, 'model');
  const senderHarness = payload.senderHarness === undefined ? undefined : validateText(payload.senderHarness, 'harness');

  // 1. Multiple Mentions Parsing & High Priority Tagging: e.g., "@antigravity-ai @peer-ai fix the tests"
  const allMentions = [...new Set([...text.matchAll(/@([a-zA-Z0-9_-]+)/g)].map(m => m[1]))];
  const isPriority = allMentions.length > 0 || (targetId && targetId !== 'all') || contentType === 'CROSS_PROMPT';
  if (allMentions.length > 0 && contentType === 'CHAT') {
    contentType = 'CROSS_PROMPT';
    // If target was default 'all' and exactly one mention, set targetId to that mention
    if (targetId === 'all') {
      targetId = allMentions.length === 1 ? id(allMentions[0], 'mention') : 'all';
    }
  }

  return mutateRoom(roomCode, room => {
    authorizeInvite(room, inviteKey ?? payload.inviteKey);
    authorize(room, senderId, token);
    if (!room.participants[senderId] && Object.keys(room.participants).length >= 100) throw new ApiError(429, 'Room participant limit reached');

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
    const messageId = `msg_${randomUUID()}`;
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
      mentions: allMentions.length > 0 ? allMentions : undefined,
      priority: isPriority ? 'HIGH' : 'NORMAL',
    };

    // Add to room history (capped at 100)
    room.history.push(message);
    if (room.history.length > 100) {
      room.history.shift();
    }

    // 6. Multicast Queueing into inboxes (Guaranteed Multiple Tagging Delivery)
    const targetSet = new Set<string>();
    if (targetId === 'all') {
      for (const participantId of Object.keys(room.participants)) {
        if (participantId !== senderId) {
          targetSet.add(participantId);
        }
      }
    } else {
      // Specific target
      targetSet.add(targetId);

      // Also mirror to human dashboard participants so phone/web UI observes cross-agent interactions
      for (const [pId, p] of Object.entries(room.participants)) {
        if (p.role === 'human' && pId !== senderId && pId !== targetId) {
          targetSet.add(pId);
        }
      }
    }

    // High-Priority Multiple Tagging: Guarantee EVERY tagged handle receives the message directly in their inbox
    for (const mention of allMentions) {
      if (mention !== senderId && mention !== 'all') {
        targetSet.add(mention);
      }
    }

    for (const recipient of targetSet) {
      enqueue(room, recipient, message);
    }

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
  });
}

/**
 * Standard Vercel Serverless Function Handler
 */
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cowork-Client-Token, X-Cowork-Invite-Key');

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
    const result = await handleSend(payload, req.headers?.['x-cowork-client-token'], req.headers?.['x-cowork-invite-key']);
    res.statusCode = result.status;
    return res.json(result.body);
  } catch (err: any) {
    if (!(err instanceof ApiError)) console.error('[API Send]', err?.message || String(err));
    const failure = errorResponse(err);
    res.statusCode = failure.status;
    return res.json(failure.body);
  }
}
