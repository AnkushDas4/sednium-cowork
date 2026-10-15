const TOKEN_KEY = 'cowork-participant-token';
const INVITES_KEY = 'cowork-invite-keys';
const LAST_HANDLE_KEY = 'cowork-last-handle';

/** Convenience only - no identity is implied by it, and nothing is pre-filled from a preset. */
export function lastHandle(): string {
  return (localStorage.getItem(LAST_HANDLE_KEY) || '').trim().toLowerCase();
}
export function rememberHandle(handle: string): void {
  if (handle) localStorage.setItem(LAST_HANDLE_KEY, handle.trim().toLowerCase());
}

export function participantToken(): string {
  let token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(TOKEN_KEY, token);
  }
  return token;
}

type Invites = Record<string, string>;
const readInvites = (): Invites => {
  try { return JSON.parse(localStorage.getItem(INVITES_KEY) || '{}') as Invites; } catch { return {}; }
};

/** Invite keys are per-room so switching rooms can never send the wrong secret. */
export function inviteKeyFor(roomCode: string): string {
  if (!roomCode) return '';
  return readInvites()[roomCode.trim().toUpperCase()] || '';
}

export function rememberInvite(roomCode: string, inviteKey: string): void {
  const room = roomCode.trim().toUpperCase();
  if (!room || !/^[a-fA-F0-9]{48,64}$/.test(inviteKey || '')) return;
  const invites = readInvites();
  if (invites[room] === inviteKey.toLowerCase()) return;
  invites[room] = inviteKey.toLowerCase();
  localStorage.setItem(INVITES_KEY, JSON.stringify(invites));
}

/**
 * Reads the room and its invite key from an invite link.
 * The key lives in the URL fragment (`#k=`) so it is never sent to the server, never appears
 * in access logs and never reaches a Referer header.
 */
export function captureInviteFromUrl(): { roomCode: string; inviteKey: string; hadInvite: boolean } {
  const params = new URLSearchParams(window.location.search);
  const roomCode = (params.get('room') || '').trim().toUpperCase();
  const fragment = new URLSearchParams(window.location.hash.replace(/^[#?]/, ''));
  const inviteKey = (fragment.get('k') || fragment.get('key') || params.get('key') || '').trim();
  if (roomCode && inviteKey) rememberInvite(roomCode, inviteKey);
  return { roomCode, inviteKey: inviteKey || inviteKeyFor(roomCode), hadInvite: Boolean(inviteKey) };
}

/**
 * Invite link for sharing: code as a query param (identifies the room), key as a fragment (authorises
 * it). A linked repository rides along as `&repo=` so an agent told only "join this link" is configured
 * for the right repository before its first push - the room still wins if the binding says otherwise.
 */
export function inviteLink(roomCode: string, repoUrl?: string): string {
  const key = inviteKeyFor(roomCode);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cowork.sednium.com';
  const repo = repoUrl ? `&repo=${encodeURIComponent(repoUrl)}` : '';
  return `${origin}/?room=${encodeURIComponent(roomCode)}${repo}${key ? `#k=${key}` : ''}`;
}

export class RelayError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}

/** Typed at the call site: the relay's JSON shape differs per endpoint, so the generic defaults to `any`. */
export async function relayRequest<T = any>(url: string, body: unknown, roomCode = ''): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Cowork-Client-Token': participantToken(),
  };
  const invite = inviteKeyFor(roomCode);
  if (invite) headers['X-Cowork-Invite-Key'] = invite;

  const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000), headers, body: JSON.stringify(body) });
  let data: any = null;
  try { data = await response.json(); } catch { /* proxy or html error page */ }
  if (!response.ok || !data?.ok) {
    const status = response.status || 0;
    const needsKey = status === 401 && /invite key/i.test(data?.error || '');
    const message = needsKey
      ? 'This room needs its invite key. Re-open the invite link (or scan the QR) that contains #k=..., or ask a member to share it.'
      : data?.error || `Relay error ${status}`;
    throw new RelayError(message, status, data?.code);
  }
  return data as T;
}
