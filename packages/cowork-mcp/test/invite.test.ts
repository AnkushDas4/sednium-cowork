import { describe, expect, it } from 'vitest';
import { parseInviteLink, redactInvite } from '../src/invite.js';

const KEY = 'a'.repeat(48);

describe('invite link parsing', () => {
  it('takes relay, room and key from the canonical dashboard link', () => {
    expect(parseInviteLink(`https://cowork.sednium.com/?room=SED-1A2B#k=${KEY}`)).toEqual({
      relayUrl: 'https://cowork.sednium.com',
      roomCode: 'SED-1A2B',
      inviteKey: KEY,
    });
  });

  it('accepts #key= and the legacy ?key= form', () => {
    expect(parseInviteLink(`https://r.test/?room=SED-AA#key=${KEY}`).inviteKey).toBe(KEY);
    expect(parseInviteLink(`https://r.test/?room=SED-AA&key=${KEY}`).inviteKey).toBe(KEY);
  });

  it('uppercases the code, lowercases the key, ignores extra params', () => {
    const p = parseInviteLink(`https://r.test/?theme=dark&room=sed-ab12&x=1#k=${KEY.toUpperCase()}`);
    expect(p.roomCode).toBe('SED-AB12');
    expect(p.inviteKey).toBe(KEY);
  });

  it('accepts a bare room code and nothing else', () => {
    expect(parseInviteLink('SED-1A2B3C4D')).toEqual({ roomCode: 'SED-1A2B3C4D' });
  });

  it('never invents a key from junk, and never throws on garbage', () => {
    for (const bad of ['', '   ', 'not a link', 'https://r.test/', `https://r.test/?room=SED-AA#k=short`, 'javascript:alert(1)']) {
      expect(() => parseInviteLink(bad)).not.toThrow();
      expect(parseInviteLink(bad).inviteKey).toBeUndefined();
    }
  });

  it('treats a fragment key as opaque hex only', () => {
    const p = parseInviteLink(`https://r.test/?room=SED-AA#k=deadbeef`);
    expect(p.roomCode).toBe('SED-AA');
    expect(p.inviteKey).toBeUndefined(); // too short to be a real key: do not claim it
  });

  it('redacts the key for logs', () => {
    const line = redactInvite(parseInviteLink(`https://r.test/?room=SED-AA#k=${KEY}`));
    expect(line).toContain('room=SED-AA');
    expect(line).not.toContain(KEY);
    expect(line).toContain('key=aaaaaa…');
  });
});
