import { randomUUID } from 'node:crypto';
import { mutateRoom, enqueue } from './_store.js';
import { ApiError, id, text as validateText, files as validateFiles, repoRef, authorize, authorizeInvite, errorResponse } from './_validation.js';
import { sameRepo, type RepoRef } from './_repo.js';
import type { CoWorkMessage, GitRepoBinding, RoomState, SendMessageResponse, ContentType } from './_types.js';

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
  /**
   * The remote this client actually pushed to, for GIT_PUSH. Optional because an older client cannot
   * supply it - and its push is then accepted without a claim on the room's binding rather than
   * rejected for a fact it never sent.
   */
  repoUrl?: string;
}

const roomSummary = (room: RoomState) => ({
  roomCode: room.roomCode,
  activeFileLocks: Object.keys(room.fileLocks).length,
  participantCount: Object.keys(room.participants).length,
  latestCommit: room.latestCommit,
  gitRepo: room.gitRepo ?? null,
});

const bind = (repo: RepoRef, by: string, source: GitRepoBinding['source']): GitRepoBinding => ({
  url: repo.url,
  host: repo.host,
  slug: repo.slug,
  by,
  at: Date.now(),
  source,
});

/**
 * Pure business logic for POST /api/send
 */
export async function handleSend(payload: SendPayload, token?: unknown, inviteKey?: unknown): Promise<{ status: number; body: SendMessageResponse }> {
  if (!payload || typeof payload !== 'object') throw new ApiError(400, 'Invalid payload');
  const roomCode = id(payload.roomCode, 'roomCode').toUpperCase();
  const senderId = id(payload.senderId, 'senderId');
  let targetId = id(payload.targetId ?? 'all', 'targetId');
  let contentType: ContentType = payload.contentType ?? 'CHAT';
  if (!['CHAT','CROSS_PROMPT','AGENT_SYNC','FILE_LOCK','FILE_UNLOCK','GIT_PUSH','GIT_REPO','STATUS'].includes(contentType)) throw new ApiError(400, 'Invalid contentType');
  const text = payload.text === undefined || payload.text === '' ? '' : validateText(payload.text, 'text', 16000);
  const files = validateFiles(payload.files);
  if (contentType === 'FILE_LOCK' && !files.length) throw new ApiError(400, 'At least one file is required');
  const commitHash = payload.commitHash === undefined ? undefined : validateText(payload.commitHash, 'commitHash', 64);
  // A repository claim is validated like any other input - before the write - but only applied under
  // the room lock below, because "first one wins" has to mean something with two members racing.
  const claimedRepo = contentType === 'GIT_REPO' ? repoRef(payload.text, 'repo') : undefined;
  const pushedTo = contentType === 'GIT_PUSH' && payload.repoUrl !== undefined ? repoRef(payload.repoUrl, 'repoUrl') : undefined;
  if (commitHash && !/^[a-fA-F0-9]{7,64}$/.test(commitHash)) throw new ApiError(400, 'Invalid commitHash');
  const senderModel = payload.senderModel === undefined ? undefined : validateText(payload.senderModel, 'model');
  const senderHarness = payload.senderHarness === undefined ? undefined : validateText(payload.senderHarness, 'harness');

  // 1. Multiple Mentions Parsing & High Priority Tagging: e.g., "@antigravity-ai @peer-ai fix the tests"
  // A repo claim's text is a URL; `git@github.com` must not be read as a mention of someone named github.
  const allMentions = contentType === 'GIT_REPO' ? [] : [...new Set([...text.matchAll(/@([a-zA-Z0-9_-]+)/g)].map(m => m[1]))];
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

    // 0. The room's repository: linked once, then it is the rule for everyone in the room.
    let boundHere = false;
    if (contentType === 'GIT_REPO' && claimedRepo) {
      if (room.gitRepo) {
        if (sameRepo(room.gitRepo, claimedRepo)) {
          // Same repository, different spelling: a no-op, not a second event in the stream.
          return { status: 200, body: { ok: true, code: 'GIT_REPO_ALREADY_LINKED', note: `This room already works in ${room.gitRepo.host}/${room.gitRepo.slug}; nothing changed.`, gitRepo: room.gitRepo, roomStateSummary: roomSummary(room) } };
        }
        throw new ApiError(
          409,
          `This room is bound to ${room.gitRepo.host}/${room.gitRepo.slug} (linked by @${room.gitRepo.by}), not ${claimedRepo.host}/${claimedRepo.slug}.`,
          'GIT_REPO_TAKEN',
          "Push and clone the room's repository. It is deliberately immutable - a member who could swap it could send every peer's client to their own fork - so to work elsewhere, open a new room.",
        );
      }
      room.gitRepo = bind(claimedRepo, senderId, 'linked');
      boundHere = true;
    }

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
            roomStateSummary: roomSummary(room)
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
      // Enforcement first: a commit that landed in the wrong repository must not become the commit
      // peers pull, and must not quietly release the locks its author still needs.
      if (room.gitRepo && pushedTo && !sameRepo(room.gitRepo, pushedTo)) {
        throw new ApiError(
          409,
          `Refused: this room works in ${room.gitRepo.host}/${room.gitRepo.slug}, but this push went to ${pushedTo.host}/${pushedTo.slug}.`,
          'GIT_REPO_MISMATCH',
          `Re-point this checkout at the room's repository (git remote set-url origin ${room.gitRepo.url}) and push again. File locks are still yours.`,
        );
      }
      if (!room.gitRepo && pushedTo) {
        // Nobody linked a repository, so the first push decides it - for good.
        room.gitRepo = bind(pushedTo, senderId, 'push');
        boundHere = true;
      }
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
      // A repo claim is stored as the canonical remote, so a credential that rode in on the raw
      // value never reaches the room's history.
      text: contentType === 'GIT_REPO' && claimedRepo ? claimedRepo.url : text,
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

    // Helper: resolve mention/target to canonical participant ID case-insensitively
    const resolveCanonicalRecipient = (handle: string): string => {
      const lower = handle.toLowerCase();
      for (const pId of Object.keys(room.participants)) {
        if (pId.toLowerCase() === lower) return pId;
      }
      return handle.toLowerCase();
    };

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
      const canonicalTarget = resolveCanonicalRecipient(targetId);
      targetSet.add(canonicalTarget);

      // Also mirror to human dashboard participants so phone/web UI observes cross-agent interactions
      for (const [pId, p] of Object.entries(room.participants)) {
        if (p.role === 'human' && pId !== senderId && pId !== canonicalTarget) {
          targetSet.add(pId);
        }
      }
    }

    // High-Priority Multiple Tagging: Guarantee EVERY tagged handle receives the message directly in their inbox
    for (const mention of allMentions) {
      if (mention.toLowerCase() !== senderId.toLowerCase() && mention !== 'all') {
        targetSet.add(resolveCanonicalRecipient(mention));
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
        gitRepo: room.gitRepo ?? null,
        // Only say it when this request is what changed the rule.
        note: boundHere && room.gitRepo
          ? contentType === 'GIT_REPO'
            ? `This room now pushes and clones ${room.gitRepo.host}/${room.gitRepo.slug}.`
            : `Linked ${room.gitRepo.host}/${room.gitRepo.slug} as this room's repository - the first push decided it.`
          : undefined,
        roomStateSummary: roomSummary(room)
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
