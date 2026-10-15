import { mutateRoom } from './_store.js';
import { ApiError, id, text, activityInfo, authorize, authorizeInvite, errorResponse } from './_validation.js';
import type { ActivityInfo, ClientRole } from './_types.js';

export interface PresenceParams {
  action?: string;
  roomCode?: string;
  clientId?: string;
  role?: ClientRole;
  status?: string;
  harness?: string;
  model?: string;
  ack?: string[];
  inviteKey?: string;
  /** Live working state; omit to leave the stored one in place, send null to clear it. */
  activity?: unknown;
}

/**
 * Presence with explicit acknowledgement, metadata and lease renewal
 */
export async function handlePresence(params: PresenceParams, token?: unknown, inviteKey?: unknown): Promise<{ status: number; body: any }> {
  // 0. Support unique room code generation with guaranteed non-collision
  if (params.action === 'new-room' || params.action === 'generate-room') {
    const { generateUniqueRoom } = await import('./_store.js');
    const room = await generateUniqueRoom();
    return {
      status: 200,
      // inviteKey is returned exactly once, at creation, to whoever minted the room.
      body: { ok: true, roomCode: room.roomCode, inviteKey: room.inviteKey },
    };
  }

  const roomCode = id(params.roomCode, 'roomCode').toUpperCase();
  const clientId = id(params.clientId, 'clientId');
  if (params.role !== undefined && !['human', 'agent'].includes(params.role)) throw new ApiError(400, 'Invalid role');
  const requestedRole: ClientRole | undefined = params.role;
  const status = params.status === undefined ? undefined : text(params.status, 'status', 2048);
  const activityPatch = activityInfo(params.activity);
  const harness = params.harness === undefined ? undefined : text(params.harness, 'harness');
  const model = params.model === undefined ? undefined : text(params.model, 'model');
  const ack = params.ack ?? [];
  if (!Array.isArray(ack) || ack.length > 100 || ack.some(v => typeof v !== 'string' || v.length > 100)) throw new ApiError(400, 'Invalid acknowledgement');

  return mutateRoom(roomCode, room => {
    authorizeInvite(room, inviteKey ?? params.inviteKey);
    authorize(room, clientId, token);
    if (!room.participants[clientId] && Object.keys(room.participants).length >= 100) throw new ApiError(429, 'Room participant limit reached');
    // 1. Heartbeat. Omitted metadata is PRESERVED: a plain poll must not erase the
    //    harness/model a peer reported earlier through a message or richer presence update.
    const previous = room.participants[clientId];
    const role: ClientRole = requestedRole ?? previous?.role ?? 'agent';
    const now = Date.now();

    // Activity is last-write-wins per participant, and `since` survives while the state does not
    // change so the dashboard can show "editing for 42s" instead of a timer that resets each beat.
    let activity: ActivityInfo | undefined = previous?.activity;
    if (activityPatch === null) activity = undefined;
    else if (activityPatch) {
      const carried = previous?.activity;
      activity = {
        ...activityPatch,
        since: carried && carried.state === activityPatch.state ? carried.since ?? carried.at : activityPatch.at,
      };
    }

    room.participants[clientId] = {
      clientId,
      role,
      status: status ?? (activity ? `${activity.state}${activity.summary ? `: ${activity.summary}` : ''}` : previous?.status ?? 'Active'),
      lastSeen: now,
      harness: harness ?? previous?.harness ?? (role === 'human' ? 'Web Dashboard' : 'AI Agent'),
      model: model ?? previous?.model,
      activity,
    };

    // Bound the row: a departed participant's thoughts are of no use hours later, and 100 stale
    // activity blobs would ride along on every write forever.
    const ACTIVITY_RETENTION_MS = 30 * 60 * 1000;
    for (const [pid, p] of Object.entries(room.participants)) {
      if (pid !== clientId && p.activity && now - p.activity.at > ACTIVITY_RETENTION_MS) delete p.activity;
    }

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
        // Every client learns the room's repository from the heartbeat it already makes: the binding
        // is a rule to obey, not news to subscribe to.
        gitRepo: room.gitRepo ?? null,
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cowork-Client-Token, X-Cowork-Invite-Key');

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
      inviteKey: query.inviteKey,
      activity: query.activity,
    }, req.headers?.['x-cowork-client-token'], req.headers?.['x-cowork-invite-key']);

    res.statusCode = result.status;
    return res.json(result.body);
  } catch (err: any) {
    if (!(err instanceof ApiError)) console.error('[API Presence]', err?.message || String(err));
    const failure = errorResponse(err);
    res.statusCode = failure.status;
    return res.json(failure.body);
  }
}
