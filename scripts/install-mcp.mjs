#!/usr/bin/env node
/**
 * Install the CoWork MCP server as ONE file - no repo clone, no build, no npm install.
 *
 *   node scripts/install-mcp.mjs                                  # download from GitHub, verify, install
 *   node scripts/install-mcp.mjs --check /path/to/cowork.cjs       # verify a file you already have
 *   node scripts/install-mcp.mjs --ref main                         # pin a different ref
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
const DEFAULT_REF = 'arena/efda0128-sednium-cowork'; // merge into main, then drop --ref
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
  return { names, hasInviteKey: 'inviteKey' in props };
}

function configSnippet() {
  const room = flag('room-code', '');
  const invite = flag('invite-key', '');
  const agent = flag('agent-id', 'android-lab-ai');
  const env = { COWORK_RELAY_URL: relayUrl, COWORK_AGENT_ID: agent };
  if (room) env.COWORK_ROOM_CODE = room;
  if (invite) env.COWORK_INVITE_KEY = invite;
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
  const { names, hasInviteKey } = assess(tools);
  ok(`handshake answered, ${names.length} tools: ${names.join(', ')}`);
  if (!hasInviteKey) {
    console.warn('  ! this build has no inviteKey parameter on cowork_connect - it predates room');
    console.warn('    invite keys and will be refused (401) by protected rooms. Re-download it.');
  }
  process.exit(0);
}

const ref = flag('ref', DEFAULT_REF);
const url = flag('url', `https://raw.githubusercontent.com/${REPO}/${ref}/bin/cowork.cjs`);

if (major() < 20) die(`Node >= 20 required (found ${process.version}); install nodejs-lts first`);

console.log(`\n  CoWork MCP - single-file install\n  source: ${url}\n`);
const res = await fetch(url, { redirect: 'follow' });
if (!res.ok) die(`download failed: HTTP ${res.status} from ${url}`);
const body = Buffer.from(await res.arrayBuffer());
if (body.length < 100_000) die(`implausibly small payload (${body.length} bytes) - wrong URL or an HTML error page?`);

const tmp = `${out}.part`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(tmp, body);
const tools = await probe(tmp); // verify before it lands on disk as "the" install
const { names, hasInviteKey } = assess(tools);
writeFileSync(out, body);
chmodSync(out, 0o755);
rmSync(tmp, { force: true }); // the verified bytes are already at `out`

const digest = createHash('sha256').update(body).digest('hex');
ok(`handshake answered, ${names.length} tools`);
ok(`server: ${out} (${body.length} bytes)`);
ok(`sha256: ${digest}`);
if (!hasInviteKey) die('downloaded build predates invite keys - pass --ref <branch> that has them');
ok('cowork_connect advertises inviteKey (current security model)');

console.log(`\n  Paste into your harness config (Claude Code ~/.claude.json, Cursor ~/.cursor/mcp.json,`);
console.log(`  Gemini CLI ~/.gemini/settings.json), or run it once by hand:\n`);
console.log(configSnippet().split('\n').map((l) => `    ${l}`).join('\n'));
console.log(`\n  No room yet? Start the harness, call cowork_connect with just an agentId - it mints a`);
console.log(`  room, prints the invite key and a QR/link for the phone dashboard. Put that #k= value in`);
console.log(`  COWORK_INVITE_KEY on every other machine that must join, or pass inviteKey per session.\n`);
console.log(`  Update later: re-run this installer (it overwrites only after verifying). Check any copy:`);

function major() { return Number(process.versions.node.split('.')[0]); }
