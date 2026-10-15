import type {
  ActivityState,
  CoWorkMessage,
  CommitInfo,
  ParticipantInfo,
} from '../api/_types.js';

/**
 * Notification rules, kept free of React and of the DOM so they can be tested as plain functions.
 *
 * Nothing here polls or subscribes: the dashboard already asks the relay for its inbox every 2s, so
 * "a notification" is decided by diffing one poll against the last one. That keeps the relay
 * stateless (no sockets, no push service, no timers) and makes the whole system derivable from state
 * that is already on the wire.
 */
export type NotifyKind =
  | 'mention'
  | 'prompt'
  | 'dm'
  | 'push'
  | 'attention'
  | 'done'
  | 'joined'
  | 'left';

export type Severity = 'high' | 'normal' | 'quiet';

export interface RoomNotification {
  /** Deterministic dedupe key, so a redelivered message can never notify twice. */
  id: string;
  kind: NotifyKind;
  severity: Severity;
  title: string;
  body: string;
  at: number;
  /** Handle that caused it, when there is one. */
  actor?: string;
  /** Set when the event came from a room message, so the UI can point back at it. */
  messageId?: string;
  files?: string[];
  /** When a toast should stop showing itself. Assigned by the hook, not by the rules. */
  expiresAt?: number;
}

export interface KindInfo {
  kind: NotifyKind;
  label: string;
  /** Shown next to the toggles: what exactly counts as this. */
  hint: string;
  severity: Severity;
  /** Defaults only - the user's stored settings win. */
  toast: boolean;
  device: boolean;
}

export const NOTIFY_KINDS: KindInfo[] = [
  {
    kind: 'mention',
    label: '@mentions of you',
    hint: 'Any room message that contains @your-handle, including a peer claiming a file you were named on',
    severity: 'high',
    toast: true,
    device: true,
  },
  {
    kind: 'prompt',
    label: 'Directed prompts',
    hint: 'CROSS_PROMPT or AGENT_SYNC addressed to you - a peer is waiting on your answer',
    severity: 'high',
    toast: true,
    device: true,
  },
  {
    kind: 'dm',
    label: 'Direct messages',
    hint: 'Plain chat sent to your handle instead of the room',
    severity: 'normal',
    toast: true,
    device: false,
  },
  {
    kind: 'attention',
    label: 'An agent needs you',
    hint: "A peer's live activity moved to blocked or error - the fastest way to notice one is stuck",
    severity: 'high',
    toast: true,
    device: true,
  },
  {
    kind: 'done',
    label: 'An agent finished',
    hint: "A peer's live activity moved to done",
    severity: 'normal',
    toast: true,
    device: false,
  },
  {
    kind: 'push',
    label: 'Branch moved',
    hint: 'GIT_PUSH from any agent, or a new latest commit on the room',
    severity: 'normal',
    toast: true,
    device: false,
  },
  {
    kind: 'left',
    label: 'An agent went quiet',
    hint: 'A participant that was heartbeating stopped responding for over 90 seconds',
    severity: 'normal',
    toast: true,
    device: false,
  },
  {
    kind: 'joined',
    label: 'An agent joined',
    hint: 'A new handle appeared in the roster',
    severity: 'quiet',
    toast: false,
    device: false,
  },
];

export const NOTIFIABLE_KINDS: NotifyKind[] = NOTIFY_KINDS.map((k) => k.kind);
const KIND_INFO = new Map(NOTIFY_KINDS.map((k) => [k.kind, k]));

export const kindInfo = (kind: NotifyKind): KindInfo => KIND_INFO.get(kind) ?? NOTIFY_KINDS[0];

export type ChannelFlags = { toast: boolean; device: boolean };
export type NotifyPrefs = Record<NotifyKind, ChannelFlags>;

export const defaultPrefs = (): NotifyPrefs =>
  Object.fromEntries(
    NOTIFY_KINDS.map((k) => [k.kind, { toast: k.toast, device: k.device }]),
  ) as NotifyPrefs;

/** How long an in-room banner stays up, by how urgent the event is. */
export const toastLifetime = (severity: Severity): number =>
  severity === 'high' ? 12_000 : severity === 'quiet' ? 5_000 : 8_000;

/** "now" / "12s ago" / "4m ago" - shared by the rail, the banners and the centre. */
export const timeAgo = (elapsedMs: number): string => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 5_000) return 'now';
  if (elapsedMs < 60_000) return `${Math.floor(elapsedMs / 1000)}s ago`;
  if (elapsedMs < 3_600_000) return `${Math.floor(elapsedMs / 60_000)}m ago`;
  if (elapsedMs < 86_400_000) return `${Math.floor(elapsedMs / 3_600_000)}h ago`;
  return `${Math.floor(elapsedMs / 86_400_000)}d ago`;
};

/** Anything the OS or a banner can show is clipped: bodies are user text, not structured data. */
const clip = (value: string, max: number): string => {
  const flat = (value || '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

const ONLINE_WINDOW_MS = 90_000;

/**
 * The one question every rule asks: is this message about me? Targeted sends count, `mentions`
 * from the relay count, and a bare `@handle` in the text counts too so older rows and hand-written
 * payloads behave the same way.
 */
export function isForMe(message: CoWorkMessage, clientId: string): boolean {
  if (!clientId || message.senderId === clientId) return false;
  if (message.targetId === clientId) return true;
  if (message.mentions?.includes(clientId)) return true;
  return message.text.includes(`@${clientId}`);
}

/** Shared with the mobile tab badge so "mentions waiting" is one definition, not two. */
export function mentionCount(messages: CoWorkMessage[], clientId: string): number {
  return messages.reduce((total, m) => (isForMe(m, clientId) ? total + 1 : total), 0);
}

export type RosterEntry = { state: ActivityState; at: number; online: boolean };

/** Everything carried between two polls. Stored in a ref, never in React state. */
export interface NotifyCursor {
  /** False until the first poll has been recorded, so opening a tab never alerts about the past. */
  primed: boolean;
  seen: string[];
  roster: Record<string, RosterEntry>;
  pushHash: string;
}

export const emptyCursor = (): NotifyCursor => ({ primed: false, seen: [], roster: {}, pushHash: '' });

export interface NotifyInput {
  clientId: string;
  /** Only the messages drained by this beat - history replayed on mount is never notified. */
  incoming: CoWorkMessage[];
  participants: Record<string, ParticipantInfo>;
  latestCommit: CommitInfo | null;
  now: number;
}

const SEEN_MAX = 400;
const CAP = 50;

/**
 * Diff one poll against the previous one and return the notifications it justifies.
 * Pure: the caller keeps the returned cursor and feeds it back next time.
 */
export function evaluate(
  input: NotifyInput,
  cursor: NotifyCursor,
): { events: RoomNotification[]; cursor: NotifyCursor } {
  const events: RoomNotification[] = [];
  const seen = new Set(cursor.seen);
  const push = (event: RoomNotification): void => {
    if (seen.has(event.id)) return;
    seen.add(event.id);
    events.push(event);
  };

  const roster: Record<string, RosterEntry> = {};
  const { participants, clientId, now } = input;

  // 1. Room messages. STATUS is heartbeat noise and is never worth an alert.
  for (const message of input.incoming) {
    if (message.contentType === 'STATUS') continue;

    if (message.contentType === 'GIT_PUSH') {
      push({
        id: `push:${message.commitHash || message.messageId}`,
        kind: 'push',
        severity: 'normal',
        at: message.timestamp || now,
        actor: message.senderId,
        messageId: message.messageId,
        title: message.commitHash
          ? `@${message.senderId} pushed ${message.commitHash.slice(0, 7)}`
          : `@${message.senderId} pushed to the branch`,
        body: clip(message.text, 180) || 'The branch moved.',
      });
      continue;
    }

    if (message.senderId === clientId) continue; // never alert about your own words
    if (!isForMe(message, clientId)) continue; // broadcast chat belongs to the stream, not to you

    const directed = message.targetId === clientId;
    const isPrompt = message.contentType === 'CROSS_PROMPT' || message.contentType === 'AGENT_SYNC';
    const kind: NotifyKind = isPrompt ? 'prompt' : directed ? 'dm' : 'mention';
    const lockLike = message.contentType === 'FILE_LOCK' || message.contentType === 'FILE_UNLOCK';

    push({
      id: `msg:${message.messageId}`,
      kind,
      severity: kindInfo(kind).severity,
      at: message.timestamp || now,
      actor: message.senderId,
      messageId: message.messageId,
      files: message.files,
      title: `${isPrompt ? 'Prompt from' : lockLike ? 'Lock traffic from' : 'Mention by'} @${message.senderId}` +
        (message.senderHarness ? ` (${message.senderHarness})` : ''),
      body: clip(message.text, 220),
    });
  }

  // 2. Roster and live activity transitions.
  for (const [handle, participant] of Object.entries(participants)) {
    if (handle === clientId) continue;
    const state: ActivityState = participant.activity?.state ?? 'idle';
    const online = now - (participant.lastSeen ?? 0) < ONLINE_WINDOW_MS;
    roster[handle] = { state, at: participant.activity?.at ?? participant.lastSeen ?? 0, online };

    const previous = cursor.roster[handle];
    if (!previous) {
      // First sighting. Joining is rarely news, so it is logged quietly - unless the peer arrives
      // already stuck, which is the one case worth interrupting for.
      if (cursor.primed) {
        if (state === 'blocked' || state === 'error') {
          push({
            id: `state:${handle}:${state}:${participant.activity?.since ?? Math.floor(now / 60_000)}`,
            kind: 'attention',
            severity: 'high',
            at: participant.activity?.at ?? now,
            actor: handle,
            title: `@${handle} joined and needs you`,
            body: clip(participant.activity?.summary ?? participant.status, 200) || `State: ${state}`,
            files: participant.activity?.files,
          });
        } else {
          push({
            id: `roster:${handle}:joined:${participant.lastSeen ?? 0}`,
            kind: 'joined',
            severity: 'quiet',
            at: participant.lastSeen ?? now,
            actor: handle,
            title: `@${handle} joined the room`,
            body: [participant.role, participant.harness, participant.model].filter(Boolean).join(' · '),
          });
        }
      }
      continue;
    }

    if (previous.online && !online) {
      push({
        id: `roster:${handle}:left:${Math.floor((participant.lastSeen ?? 0) / ONLINE_WINDOW_MS)}`,
        kind: 'left',
        severity: 'normal',
        at: now,
        actor: handle,
        title: `@${handle} stopped responding`,
        body: `Last heartbeat ${Math.max(0, Math.round((now - (participant.lastSeen ?? now)) / 1000))}s ago. ` +
          'Its file leases expire after 90s of silence.',
      });
    }

    if (previous.state === state) continue;
    const stalled = state === 'blocked' || state === 'error';
    if (!stalled && state !== 'done') continue;
    // `since` survives every beat while a state holds, so it is the stable part of the key; a client
    // without it falls back to a coarse bucket rather than notifying on each 2s heartbeat.
    const stable = participant.activity?.since ?? Math.floor((participant.activity?.at ?? now) / 60_000);
    push({
      id: `state:${handle}:${state}:${stable}`,
      kind: stalled ? 'attention' : 'done',
      severity: stalled ? 'high' : 'normal',
      at: participant.activity?.at ?? now,
      actor: handle,
      title: stalled ? `@${handle} needs you` : `@${handle} finished`,
      body: clip(participant.activity?.summary ?? participant.status, 200) || `State: ${state}`,
      files: participant.activity?.files,
    });
  }

  // 3. The latest commit, for the case where the GIT_PUSH message was delivered elsewhere or lost.
  let pushHash = cursor.pushHash;
  if (input.latestCommit?.hash) {
    if (cursor.primed && input.latestCommit.hash !== cursor.pushHash) {
      push({
        id: `push:${input.latestCommit.hash}`,
        kind: 'push',
        severity: 'normal',
        at: input.latestCommit.timestamp || now,
        actor: input.latestCommit.author,
        // The room only knows a hash and a message, not which branch it came from, so the title
        // never claims a branch name it cannot verify.
        title: input.latestCommit.author
          ? `@${input.latestCommit.author} committed ${input.latestCommit.hash.slice(0, 7)}`
          : `New commit ${input.latestCommit.hash.slice(0, 7)}`,
        body: clip(input.latestCommit.message, 180),
      });
    }
    pushHash = input.latestCommit.hash;
  }

  return {
    events,
    cursor: {
      primed: true,
      seen: [...seen].slice(-SEEN_MAX),
      roster,
      pushHash,
    },
  };
}

/** Newest first, capped: the panel is a glance, not an archive. */
export const mergeNotifications = (
  previous: RoomNotification[],
  incoming: RoomNotification[],
): RoomNotification[] => {
  if (!incoming.length) return previous;
  const known = new Set(previous.map((n) => n.id));
  const fresh = incoming.filter((n) => !known.has(n.id));
  if (!fresh.length) return previous;
  return [...fresh, ...previous].sort((a, b) => b.at - a.at).slice(0, CAP);
};
