/**
 * An invite link is the single string a human shares: https://relay/?room=CODE#k=KEY
 *
 * Everything else (relay URL, room code, invite key) is derived from it, so "join this link" is a
 * complete instruction for an agent. Accepts the variants the dashboard has produced over time
 * (#k=, #key=, legacy ?key=) and a bare room code. Never logs the key.
 */
export interface InviteParts {
  relayUrl?: string;
  roomCode?: string;
  inviteKey?: string;
  /** `&repo=owner/name` - the repository a human wants this room to work in, if any. */
  repo?: string;
}

const ROOM_RE = /^SED-[0-9a-fA-F]{8,64}$/;
const KEY_RE = /^[0-9a-fA-F]{48,64}$/;

export function parseInviteLink(raw: string | undefined | null): InviteParts {
  const text = String(raw || '').trim();
  if (!text) return {};

  // Bare room code, e.g. "SED-1A2B3C4D..."
  if (ROOM_RE.test(text)) return { roomCode: text.toUpperCase() };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // Not a URL and not a bare code: nothing safe to extract.
    return {};
  }

  const parts: InviteParts = {};
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    parts.relayUrl = url.origin;
  }

  const room = url.searchParams.get('room') || url.searchParams.get('roomCode') || '';
  if (room.trim()) parts.roomCode = room.trim().toUpperCase();

  // Fragment first: it is the transport the dashboard uses, and query params can leak into logs.
  // A repo in a query param is not a secret, so unlike the key it lives in the query where any
  // client (including an older one reading the link by hand) can see it.
  const repo = (url.searchParams.get('repo') || '').trim();
  if (repo) parts.repo = repo;

  const hash = url.hash.replace(/^#/, '');
  const keyed = /(?:^|[&;])k(?:ey)?=([^&;]+)/i.exec(hash);
  const candidate = (keyed?.[1] || url.searchParams.get('key') || '').trim();
  if (KEY_RE.test(candidate)) parts.inviteKey = candidate.toLowerCase();

  return parts;
}

/** Redact the key for anything that gets printed or logged. */
export function redactInvite(parts: InviteParts): string {
  const bits: string[] = [];
  if (parts.relayUrl) bits.push(`relay=${parts.relayUrl}`);
  if (parts.roomCode) bits.push(`room=${parts.roomCode}`);
  bits.push(parts.inviteKey ? `key=${parts.inviteKey.slice(0, 6)}…(${parts.inviteKey.length} hex)` : 'key=none');
  if (parts.repo) bits.push(`repo=${parts.repo}`);
  return bits.join(' ');
}
