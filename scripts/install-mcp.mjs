#!/usr/bin/env node
/**
 * Install the CoWork MCP server as ONE file - no repo clone, no build, no npm install.
 *
 *   node scripts/install-mcp.mjs                 # fetch from the relay origin, verify, install
 *   node scripts/install-mcp.mjs --check FILE    # verify a file you already have
 *   node scripts/install-mcp.mjs --ref <sha>     # fetch from GitHub instead of the relay
 *
 * Default source is the relay itself (<COWORK_RELAY_URL or https://cowork.sednium.com>/cowork.cjs),
 * because the relay build publishes it - one short host, no 90-char raw.githubusercontent URL.
 *
 * What "verify" means here: the downloaded file is spawned with the same JSON-RPC handshake a
 * harness uses (initialize -> tools/list). We only accept it if the server answers and advertises
 * cowork_connect with an inviteKey parameter. A file that merely exists is not proof it runs.
 *
 * Zero dependencies: node:fs, node:child_process, global fetch. Needs Node >= 20 at runtime.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const REPO = 'AnkushDas4/sednium-cowork';
const DEFAULT_RELAY = 'https://cowork.sednium.com';
// GitHub fallback ref, used only with --ref: main still predates the invite-key work.
const DEFAULT_REF = 'arena/efda0128-sednium-cowork';
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);
const die = (msg) => { console.error(`\n  x ${msg}\n`); process.exit(1); };
const ok = (msg) => console.log(`  ok ${msg}`);

const out = flag('out', join(homedir(), '.local', 'lib', 'sednium-cowork', 'cowork.cjs'));
const relayUrl = flag('relay-url', 'https://cowork.sednium.com');

/** Spawn the server, drive a real handshake, return the tool list. */
function probe(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`handshake timed out after 15s.\nstderr: ${stderr.trim() || '(nothing)'}\nstdout: ${stdout.trim() || '(nothing)'}`));
    }, 15000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      for (const line of stdout.split('\n')) {
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2) {
          clearTimeout(timer);
          child.kill();
          return resolve(msg.result?.tools || []);
        }
      }
    });
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout.includes('"result"')) {
        reject(new Error(`server exited with code ${code}. stderr: ${stderr.trim() || '(nothing)'}`));
      }
    });

    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'cowork-installer', version: '0' } } }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n');
  });
}

function assess(tools) {
  const names = tools.map((t) => t.name);
  const connect = tools.find((t) => t.name === 'cowork_connect');
  const props = connect?.inputSchema?.properties || {};
  return { names, hasInviteKey: 'inviteKey' in props, hasRepo: 'repoUrl' in props };
}

function configSnippet() {
  const room = flag('room-code', link.roomCode || '');
  const invite = flag('invite-key', link.inviteKey || '');
  const agent = flag('agent-id', process.env.COWORK_AGENT_ID || 'android-lab-ai');
  const env = { COWORK_RELAY_URL: relayUrl, COWORK_AGENT_ID: agent };
  if (room) env.COWORK_ROOM_CODE = room;
  if (invite) env.COWORK_INVITE_KEY = invite;
  // A configured repo is a *request*: if the room already bound another one, the room wins and the
  // agent is told. Writing it here is what lets a whole team start pointed at the same place.
  const repo = flag('repo', process.env.COWORK_GIT_REPO || link.repo || '');
  if (repo) env.COWORK_GIT_REPO = repo;
  const autoPull = flag('auto-pull', 'false');
  if (autoPull !== 'false') env.COWORK_AUTO_PULL = autoPull;
  return JSON.stringify({
    mcpServers: { cowork: { command: process.execPath, args: [out], env } },
  }, null, 2);
}

if (has('check')) {
  const target = flag('check', out);
  if (!existsSync(target)) die(`no file at ${target}`);
  const digest = createHash('sha256').update(readFileSync(target)).digest('hex');
  ok(`${target} sha256 ${digest.slice(0, 16)}…`);
  const tools = await probe(target);
  const { names, hasInviteKey, hasRepo } = assess(tools);
  ok(`handshake answered, ${names.length} tools: ${names.join(', ')}`);
  if (!hasInviteKey) {
    console.warn('  ! this build has no inviteKey parameter on cowork_connect - it predates room');
    console.warn('    invite keys and will be refused (401) by protected rooms. Re-download it.');
  }
  if (!hasRepo) console.warn('  ! no repoUrl on cowork_connect: this build cannot link or honour a room repository');
  process.exit(0);
}

// A pasted invite link can be the only argument: it carries relay, room and key together.
const link = parseInvite(flag('link', process.env.COWORK_INVITE_LINK || ''));
const relay = (flag('relay-url', link.relayUrl || process.env.COWORK_RELAY_URL || DEFAULT_RELAY)).replace(/\/+$/, '');
const ref = flag('ref', '');
const url = flag('url', link.relayUrl && !ref ? `${relay}/cowork.cjs` : (ref
    ? `https://raw.githubusercontent.com/${REPO}/${ref}/bin/cowork.cjs`
    : `${relay}/cowork.cjs`));

if (major() < 20) die(`Node >= 20 required (found ${process.version}); install nodejs-lts first`);

console.log(`\n  CoWork MCP - single-file install\n  source: ${url}\n`);
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) die(`download failed: HTTP ${res.status} from ${url}`);
const body = Buffer.from(await res.arrayBuffer());
if (body.length < 100_000) die(`implausibly small payload (${body.length} bytes) - wrong URL, truncated transfer?`);
const head = body.subarray(0, 800).toString('utf8').toLowerCase();
if (head.startsWith('<!doctype html') || head.startsWith('<html')) {
  die('that URL served an HTML page, not the bundle. The SPA catch-all answers unknown paths with '
    + 'index.html, so deploy a relay build that publishes public/cowork.cjs - or pass --ref <sha> '
    + 'to pull bin/cowork.cjs from GitHub instead.');
}

const digest = createHash('sha256').update(body).digest('hex');
// The relay publishes "<asset>.sha256" beside the file: catches a truncated or substituted download.
const sidecar = await fetch(`${url}.sha256`, { redirect: 'follow' }).catch(() => null);
if (sidecar?.ok) {
  const expected = (await sidecar.text()).trim().split(/\s+/)[0].toLowerCase();
  if (expected && expected !== digest) {
    die(`digest mismatch - got ${digest}, expected ${expected}. Do not install this copy; the `
      + 'transfer was truncated, cached mid-deploy, or tampered with. Retry, then compare against git.');
  }
  ok(`sha256 matches the published digest (${digest.slice(0, 16)}…)`);
} else {
  console.warn('  ! no .sha256 published beside that URL; comparing digests was skipped. Check it');
  console.warn('    against `git show <ref>:bin/cowork.cjs | sha256sum` if the origin is not yours.');
}

const tmp = `${out}.part`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(tmp, body);
const tools = await probe(tmp); // verify before it lands on disk as "the" install
const { names, hasInviteKey, hasRepo } = assess(tools);
writeFileSync(out, body);
chmodSync(out, 0o755);
rmSync(tmp, { force: true }); // the verified bytes are already at `out`

ok(`handshake answered, ${names.length} tools`);
ok(`server: ${out} (${body.length} bytes)`);
if (!hasInviteKey) die('downloaded build predates invite keys - pass --ref <branch> that has them');
ok('cowork_connect advertises inviteKey (current security model)');
if (!hasRepo) {
  console.warn('  ! this build predates room repositories: cowork_connect has no repoUrl, so it can');
  console.warn('    neither claim a room repo nor honour one on your behalf. Update it after the relay deploy.');
}

console.log(`\n  Paste into your harness config (Claude Code ~/.claude.json, Cursor ~/.cursor/mcp.json,`);
console.log(`  Gemini CLI ~/.gemini/settings.json), or run it once by hand:\n`);
console.log(configSnippet().split('\n').map((l) => `    ${l}`).join('\n'));
console.log(`\n  No room yet? Start the harness, call cowork_connect with just an agentId - it mints a`);
console.log(`  room, prints the invite key and a QR/link for the phone dashboard. Put that #k= value in`);
console.log(`  COWORK_INVITE_KEY on every other machine that must join, or pass inviteKey per session.\n`);
console.log(`  Update later: re-run this installer (it overwrites only after verifying). Check any copy:`);

function major() { return Number(process.versions.node.split('.')[0]); }

/** Same rules the MCP server applies: #k= first, then #key=, then a legacy ?key=. */
function parseInvite(raw) {
  const text = String(raw || '').trim();
  if (!text) return {};
  if (/^SED-[0-9a-f]{8,64}$/i.test(text)) return { roomCode: text.toUpperCase() };
  let url;
  try { url = new URL(text); } catch { return {}; }
  const out = {};
  if (url.protocol === 'http:' || url.protocol === 'https:') out.relayUrl = url.origin;
  const room = (url.searchParams.get('room') || url.searchParams.get('roomCode') || '').trim();
  if (room) out.roomCode = room.toUpperCase();
  const keyed = /(?:^|[&;])k(?:ey)?=([^&;]+)/i.exec(url.hash.replace(/^#/, ''));
  const cand = (keyed?.[1] || url.searchParams.get('key') || '').trim();
  if (/^[0-9a-f]{48,64}$/i.test(cand)) out.inviteKey = cand.toLowerCase();
  const repo = (url.searchParams.get('repo') || '').trim();
  if (repo) out.repo = repo; // not a secret: it is a repository name, and it rides in the query
  return out;
}
