#!/usr/bin/env node
/**
 * Live relay verifier for Sednium CoWork.
 *
 *   node scripts/verify-relay.mjs https://cowork.sednium.com
 *   node scripts/verify-relay.mjs http://localhost:3000 --slow
 *
 * Exercises the guarantees over real HTTP against a running relay: atomic claims, path
 * aliases, at-least-once delivery with acknowledgements, participant-token binding, input
 * validation, broadcast routing and lock release. --slow additionally verifies lease renewal
 * across the 90s TTL (takes ~4 minutes). It creates a throwaway room and leaves it empty;
 * the room row stays in the database like any other room.
 */
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const slow = args.includes('--slow');
const base = (args.find(a => !a.startsWith('--')) || process.env.COWORK_RELAY_URL || 'http://localhost:3000').replace(/\/+$/, '');
const token = () => randomBytes(32).toString('hex');
const id = () => Math.random().toString(36).slice(2, 8);

let inviteKey = ''; // set from the minted room; sent as a header, never in a query string
async function api(pathname, init) {
  const headers = { ...(init?.headers || {}) };
  if (inviteKey) headers['X-Cowork-Invite-Key'] = inviteKey;
  const res = await fetch(base + pathname, { ...init, headers, signal: AbortSignal.timeout(15_000) });
  let body = null;
  try { body = await res.json(); } catch { /* non-JSON: proxy or html error page */ }
  return { status: res.status, body };
}
const send = (payload, auth) => api('/api/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(auth ? { 'X-Cowork-Client-Token': auth } : {}) },
  body: JSON.stringify(payload),
});
const presence = (payload, auth) => api('/api/presence', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': auth },
  body: JSON.stringify({ action: 'inbox', ...payload }),
});

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || 'ok' });
    console.log(`  PASS  ${name}${detail ? ` - ${detail}` : ''}`);
  } catch (err) {
    results.push({ name, ok: false, detail: err.message });
    console.log(`  FAIL  ${name} - ${err.message}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

console.log(`\nSednium CoWork relay verification\ntarget: ${base}\n${'-'.repeat(56)}`);

const created = await api('/api/presence?action=new-room');
expect(created.status === 200 && created.body?.ok, `cannot create room: ${created.status} ${JSON.stringify(created.body)}`);
const room = created.body.roomCode;
inviteKey = typeof created.body.inviteKey === 'string' ? created.body.inviteKey : '';
console.log(`room: ${room}`);
console.log(`invite key: ${inviteKey ? `${inviteKey.slice(0, 6)}*** (${inviteKey.length} chars, shown once by design)` : 'none - this relay build mints open rooms'}\n`);

const a = { handle: `vfy-a-${id()}`, token: token() };
const b = { handle: `vfy-b-${id()}`, token: token() };
const intruder = { handle: a.handle, token: token() };
const file = `src/verify-${id()}.ts`;

await check('a freshly minted room carries its own invite key', async () => {
  if (!inviteKey) return 'skipped: relay predates invite keys';
  expect(/^[a-f0-9]{48}$/.test(inviteKey), `unexpected key shape: ${inviteKey.length} chars`);
  expect(!JSON.stringify(created.body).includes('inviteHash'), 'the stored hash must never be returned');
  return '48 hex chars, only the digest is stored';
});

await check('the room code alone cannot read or write a protected room', async () => {
  if (!inviteKey) return 'skipped: room is not key-protected';
  const noKeyPresence = await fetch(`${base}/api/presence`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': token() },
    body: JSON.stringify({ action: 'inbox', roomCode: room, clientId: 'noskey' }), signal: AbortSignal.timeout(15_000),
  });
  expect(noKeyPresence.status === 401, `code-only presence returned ${noKeyPresence.status}`);
  const noKeySend = await fetch(`${base}/api/send`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': token() },
    body: JSON.stringify({ roomCode: room, senderId: 'noskey', text: 'x' }), signal: AbortSignal.timeout(15_000),
  });
  expect(noKeySend.status === 401, `code-only send returned ${noKeySend.status}`);
  const wrongKey = await fetch(`${base}/api/presence`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cowork-Client-Token': token(), 'X-Cowork-Invite-Key': 'f'.repeat(48) },
    body: JSON.stringify({ action: 'inbox', roomCode: room, clientId: 'wrongkey' }), signal: AbortSignal.timeout(15_000),
  });
  expect(wrongKey.status === 403, `wrong invite key returned ${wrongKey.status}`);
  const body = await noKeyPresence.json();
  expect(/invite key/i.test(body.error || ''), `unhelpful error text: ${JSON.stringify(body)}`);
  return '401 without key, 403 with the wrong key, actionable message';
});

await check('two agents can register presence', async () => {
  const [ra, rb] = await Promise.all([presence({ roomCode: room, clientId: a.handle, role: 'agent' }, a.token), presence({ roomCode: room, clientId: b.handle, role: 'agent' }, b.token)]);
  expect(ra.status === 200 && rb.status === 200, `statuses ${ra.status}/${rb.status}`);
  expect(ra.body.participants[a.handle] && rb.body.participants[b.handle], 'both handles missing from roster');
  return `${a.handle} + ${b.handle}`;
});

await check('harness/model metadata survives a plain heartbeat', async () => {
  await presence({ roomCode: room, clientId: a.handle, harness: 'Verifier', model: 'Verify Model 1.0' }, a.token);
  const after = await presence({ roomCode: room, clientId: a.handle }, a.token);
  const p = after.body.participants[a.handle];
  expect(p?.harness === 'Verifier' && p?.model === 'Verify Model 1.0', `got harness=${p?.harness} model=${p?.model}`);
  return 'harness + model preserved';
});

await check('concurrent claims on one path: exactly one wins', async () => {
  const [r1, r2] = await Promise.all([
    send({ roomCode: room, senderId: a.handle, targetId: 'all', contentType: 'FILE_LOCK', files: [file] }, a.token),
    send({ roomCode: room, senderId: b.handle, targetId: 'all', contentType: 'FILE_LOCK', files: [file] }, b.token),
  ]);
  const codes = [r1.status, r2.status].sort();
  expect(codes[0] === 200 && codes[1] === 409, `statuses ${codes.join('/')}`);
  return '200 + 409';
});

await check('path aliases cannot dodge a lock (./x vs x vs src//x)', async () => {
  for (const alias of [`./${file}`, file.replace('src/', 'src//'), `src/./${file.split('/').pop()}`]) {
    const r = await send({ roomCode: room, senderId: b.handle, targetId: 'all', contentType: 'FILE_LOCK', files: [alias] }, b.token);
    expect(r.status === 409, `alias "${alias}" returned ${r.status}, expected 409`);
    expect(r.body?.lockedBy === a.handle, `alias "${alias}" reported lockedBy=${r.body?.lockedBy}`);
  }
  return 'all three aliases conflict with the held lock';
});

await check('a foreign token cannot impersonate a held handle (403)', async () => {
  const r = await presence({ roomCode: room, clientId: intruder.handle }, intruder.token);
  expect(r.status === 403, `got ${r.status} ${JSON.stringify(r.body)}`);
  return 'rejected before any state changed';
});

await check('a foreign token cannot drain the inbox or release locks (403)', async () => {
  const inbox = await send({ roomCode: room, senderId: b.handle, targetId: a.handle, contentType: 'CROSS_PROMPT', text: `payload-${id()}` }, b.token);
  expect(inbox.status === 200, `seed send failed (${inbox.status})`);
  const drained = await presence({ roomCode: room, clientId: a.handle }, intruder.token);
  expect(drained.status === 403, `inbox drain returned ${drained.status}`);
  const unlocked = await send({ roomCode: room, senderId: a.handle, contentType: 'FILE_UNLOCK', files: [file] }, intruder.token);
  expect(unlocked.status === 403, `unlock returned ${unlocked.status}`);
  const stillHeld = await presence({ roomCode: room, clientId: b.handle }, b.token);
  expect(stillHeld.body.fileLocks[file]?.lockedBy === a.handle, 'lock was released by the wrong session');
  return 'inbox intact, lock intact';
});

await check('unacknowledged messages are redelivered, acknowledged ones are not', async () => {
  const first = await presence({ roomCode: room, clientId: a.handle }, a.token);
  const ids = (first.body.messages || []).map(m => m.messageId);
  expect(ids.length > 0, 'expected at least one pending message');
  const again = await presence({ roomCode: room, clientId: a.handle }, a.token);
  expect((again.body.messages || []).map(m => m.messageId).sort().join() === ids.sort().join(), 'a lost response dropped messages instead of redelivering');
  const acked = await presence({ roomCode: room, clientId: a.handle, ack: ids }, a.token);
  expect((acked.body.messages || []).length === 0, `${acked.body.messages.length} messages remained after acknowledgement`);
  return `${ids.length} redelivered, then cleared on ack`;
});

await check('GIT_PUSH with an @mention still reaches every peer', async () => {
  const note = await send({ roomCode: room, senderId: a.handle, contentType: 'FILE_UNLOCK', files: [file] }, a.token);
  expect(note.status === 200, `unlock failed (${note.status})`);
  const push = await send({ roomCode: room, senderId: a.handle, targetId: 'all', contentType: 'GIT_PUSH', text: `feat: pair work, thanks @${b.handle}-not-real`, commitHash: 'a1b2c3d' }, a.token);
  expect(push.status === 200, `push notify returned ${push.status}`);
  const seen = await presence({ roomCode: room, clientId: b.handle, ack: [] }, b.token);
  const got = (seen.body.messages || []).filter(m => m.contentType === 'GIT_PUSH' && m.targetId === 'all');
  expect(got.length === 1, `peer received ${got.length} broadcast GIT_PUSH events`);
  expect(Object.keys(seen.body.fileLocks).length === 0, `${Object.keys(seen.body.fileLocks).length} lock(s) still held after push`);
  return 'broadcast kept, sender locks released';
});

await check('malformed payloads are rejected (400), never a crash', async () => {
  const cases = [
    { text: 123 }, { targetId: 'constructor' }, { senderId: '__proto__' },
    { contentType: 'NOT_A_TYPE' }, { files: 'src/a.ts' }, { commitHash: 42 },
    { contentType: 'FILE_LOCK', files: ['../../etc/passwd'] }, { contentType: 'FILE_LOCK', files: [] },
  ];
  for (const payload of cases) {
    const r = await send({ roomCode: room, senderId: a.handle, ...payload }, a.token);
    expect(r.status === 400, `payload ${JSON.stringify(payload)} returned ${r.status}`);
  }
  const noToken = await send({ roomCode: room, senderId: `vfy-x-${id()}`, text: 'hi' });
  expect(noToken.status === 401, `missing token returned ${noToken.status}`);
  return `${cases.length + 1} rejected`;
});

await check('no storage internals or credentials leak from failures', async () => {
  const r = await api('/api/presence?action=inbox');
  const text = JSON.stringify(r.body ?? {});
  expect(r.status >= 400, `expected a rejection, got ${r.status}`);
  expect(!/DATABASE_URL|postgres|password|sslmode|pooler|[Ee]rror:/.test(text), `leaked internals: ${text.slice(0, 160)}`);
  return 'generic, safe error body';
});

if (slow) {
  await check('lease survives 90s TTL while heartbeating, then expires', async () => {
    const held = `src/lease-${id()}.ts`;
    const claim = await send({ roomCode: room, senderId: a.handle, contentType: 'FILE_LOCK', files: [held] }, a.token);
    expect(claim.status === 200, `claim returned ${claim.status}`);
    for (let elapsed = 0; elapsed < 110_000; elapsed += 20_000) {
      await sleep(20_000);
      const beat = await presence({ roomCode: room, clientId: a.handle }, a.token);
      expect(beat.body.fileLocks[held], `lease lost after ${elapsed + 20}s of active heartbeats`);
    }
    const intruderClaim = await send({ roomCode: room, senderId: b.handle, contentType: 'FILE_LOCK', files: [held] }, b.token);
    expect(intruderClaim.status === 409, 'peer could steal a live lease');
    a.token = token(); // simulate a dropped/disconnected agent
    for (let wait = 0; wait < 12; wait++) {
      await sleep(10_000);
      const peek = await presence({ roomCode: room, clientId: b.handle }, b.token);
      if (!peek.body.fileLocks[held]) return `released after ~${(wait + 1) * 10}s of silence`;
    }
    throw new Error('lease never expired after the owner went silent');
  });
}

await check('cleanup leaves the room empty', async () => {
  await send({ roomCode: room, senderId: b.handle, contentType: 'FILE_UNLOCK' }, b.token);
  const peek = await presence({ roomCode: room, clientId: b.handle, ack: [] }, b.token);
  expect(Object.keys(peek.body.fileLocks).length === 0, `${Object.keys(peek.body.fileLocks).length} lock(s) left behind`);
  return 'no locks; handles stay private to this run';
});

const failed = results.filter(r => !r.ok);
console.log(`${'-'.repeat(56)}\n${results.length - failed.length}/${results.length} checks passed against ${base}`);
if (failed.length) { console.log('failed: ' + failed.map(f => f.name).join('; ')); process.exit(1); }
console.log(slow ? 'all guarantees verified' : 'rerun with --slow to also verify lease renewal/expiry');
