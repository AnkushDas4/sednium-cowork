import { mutateRoom } from './_store.js';
import { ApiError, id, text, authorize, errorResponse } from './_validation.js';
import type { ClientRole } from './_types.js';

export interface PresenceParams {
  action?: string;
  roomCode?: string;
  clientId?: string;
  role?: ClientRole;
  status?: string;
  harness?: string;
  model?: string;
  ack?: string[];
}

/**
 * Presence with explicit acknowledgement, metadata and lease renewal
 */
export async function handlePresence(params: PresenceParams, token?: unknown): Promise<{ status: number; body: any }> {
  // 0. Support unique room code generation with guaranteed non-collision
  if (params.action === 'new-room' || params.action === 'generate-room') {
    const { generateUniqueRoomCode } = await import('./_store.js');
    const newCode = await generateUniqueRoomCode();
    return {
      status: 200,
      body: {
        ok: true,
        roomCode: newCode,
      }
    };
  }

  const roomCode = id(params.roomCode, 'roomCode').toUpperCase();
  const clientId = id(params.clientId, 'clientId');
  if (params.role !== undefined && !['human', 'agent'].includes(params.role)) throw new ApiError(400, 'Invalid role');
  const requestedRole: ClientRole | undefined = params.role;
  const status = params.status === undefined ? undefined : text(params.status, 'status', 2048);
  const harness = params.harness === undefined ? undefined : text(params.harness, 'harness');
  const model = params.model === undefined ? undefined : text(params.model, 'model');
  const ack = params.ack ?? [];
  if (!Array.isArray(ack) || ack.length > 100 || ack.some(v => typeof v !== 'string' || v.length > 100)) throw new ApiError(400, 'Invalid acknowledgement');

  return mutateRoom(roomCode, room => {
    authorize(room, clientId, token);
    if (!room.participants[clientId] && Object.keys(room.participants).length >= 100) throw new ApiError(429, 'Room participant limit reached');
    // 1. Heartbeat. Omitted metadata is PRESERVED: a plain poll must not erase the
    //    harness/model a peer reported earlier through a message or richer presence update.
    const previous = room.participants[clientId];
    const role: ClientRole = requestedRole ?? previous?.role ?? 'agent';
    room.participants[clientId] = {
      clientId,
      role,
      status: status ?? previous?.status ?? 'Active',
      lastSeen: Date.now(),
      harness: harness ?? previous?.harness ?? (role === 'human' ? 'Web Dashboard' : 'AI Agent'),
      model: model ?? previous?.model,
    };

    // Expired leases have already been removed under the row lock. Renew only live leases.
    for (const lock of Object.values(room.fileLocks)) {
      if (lock.lockedBy === clientId) lock.timestamp = Date.now();
    }
    const acknowledged = new Set(ack);
    if (!room.inboxes[clientId] && Object.keys(room.inboxes).length >= 100) throw new ApiError(429, 'Room inbox limit reached');
    room.inboxes[clientId] = (room.inboxes[clientId] ?? []).filter(m => !acknowledged.has(m.messageId));
    const pendingMessages = room.inboxes[clientId].slice(0, 100);

    return {
      status: 200,
      body: {
        ok: true,
        roomCode: room.roomCode,
        messages: pendingMessages,
        fileLocks: room.fileLocks,
        participants: room.participants,
        latestCommit: room.latestCommit,
        recentHistory: room.history.slice(-50),
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cowork-Client-Token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) {
    res.statusCode = 405;
    return res.json({ ok: false, error: 'Method Not Allowed' });
  }
  try {
    const query = req.method === 'POST' ? req.body || {} : req.query || {};
    const result = await handlePresence({
      action: query.action,
      roomCode: query.roomCode,
      clientId: query.clientId,
      role: query.role,
      status: query.status,
      harness: query.harness,
      model: query.model,
      ack: query.ack,
    }, req.headers?.['x-cowork-client-token']);

    res.statusCode = result.status;
    return res.json(result.body);
  } catch (err: any) {
    if (!(err instanceof ApiError)) console.error('[API Presence]', err?.message || String(err));
    const failure = errorResponse(err);
    res.statusCode = failure.status;
    return res.json(failure.body);
  }
}
