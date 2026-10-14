import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes } from 'node:crypto';

/** Keep one private installation identity across MCP restarts. Never send it in share URLs. */
export function getParticipantToken(): string {
  if (process.env.COWORK_PARTICIPANT_TOKEN) return process.env.COWORK_PARTICIPANT_TOKEN;
  const dir = path.join(os.homedir(), '.config', 'sednium-cowork');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'participant-token');
  try { fs.writeFileSync(file, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
  catch (e: any) { if (e.code !== 'EEXIST') throw e; }
  const token = fs.readFileSync(file, 'utf8').trim();
  if (!/^[a-zA-Z0-9_-]{32,128}$/.test(token)) throw new Error('Invalid saved participant token');
  return token;
}
