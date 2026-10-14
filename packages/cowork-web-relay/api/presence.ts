import { getRoom, saveRoom } from './_store.js';
import type { PresenceResponse, ClientRole, CoWorkMessage } from './_types.js';

export interface PresenceParams {
  action?: string;
  roomCode?: string;
  clientId?: string;
  role?: ClientRole;
  status?: string;
}

/**
 * Pure business logic for GET /api/presence
 */
export async function handlePresence(params: PresenceParams): Promise<{ status: number; body: PresenceResponse }> {
  const roomCode = (params.roomCode || 'DEFAULT').trim().toUpperCase();
  const clientId = (params.clientId || 'anonymous').trim();
  const role: ClientRole = (params.role === 'human') ? 'human' : 'agent';
  const status = params.status || 'Active';

  const room = await getRoom(roomCode);

  // 1. Update participant presence & heartbeat
  room.participants[clientId] = {
    clientId,
    role,
    status,
    lastSeen: Date.now(),
  };

  // 2. Atomically drain inbox for this client
  const drainedMessages: CoWorkMessage[] = room.inboxes[clientId] || [];
  room.inboxes[clientId] = []; // Drained!

  await saveRoom(room);

  return {
    status: 200,
    body: {
      ok: true,
      roomCode: room.roomCode,
      messages: drainedMessages,
      fileLocks: room.fileLocks,
      participants: room.participants,
      latestCommit: room.latestCommit,
      recentHistory: room.history.slice(-50),
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

  try {
    const query = req.query || {};
    const result = await handlePresence({
      action: query.action,
      roomCode: query.roomCode,
      clientId: query.clientId,
      role: query.role,
      status: query.status,
    });

    res.statusCode = result.status;
    return res.json(result.body);
  } catch (err: any) {
    console.error('[API Presence Error]', err);
    res.statusCode = 500;
    return res.json({ ok: false, error: err.message || 'Internal Server Error' });
  }
}
