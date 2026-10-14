import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTls, describeConnection } from '../api/_tls.js';
import { errorResponse } from '../api/_validation.js';

const URL = 'postgresql://postgres.x:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

describe('Database TLS policy', () => {
  it('verifies by default and strips driver-overriding ssl params', () => {
    const d = buildTls(`${URL}?sslmode=require&channel_binding=require`, {});
    expect(d.mode).toBe('verify-full');
    expect(d.ssl).toEqual({ rejectUnauthorized: true });
    expect(d.connectionString).not.toContain('sslmode');
    expect(d.connectionString).toContain('channel_binding=require');
  });
  it('honours an explicit no-verify in the URL, with a warning', () => {
    const d = buildTls(`${URL}?sslmode=no-verify`, {});
    expect(d).toMatchObject({ mode: 'no-verify', ssl: { rejectUnauthorized: false } });
    expect(d.warning).toContain('encrypts traffic without verifying');
  });
  it('pins an inline CA and keeps hostname verification', () => {
    const d = buildTls(URL, { COWORK_DB_CA_CERT: PEM });
    expect(d.mode).toBe('verify-pinned-ca');
    const ca = String((d.ssl as { ca?: string }).ca);
    expect(d.ssl).toMatchObject({ rejectUnauthorized: true, servername: 'aws-0-ap-south-1.pooler.supabase.com' });
    expect(ca.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true);
    expect(ca).toContain('MIIB');
    expect(ca.trimEnd().endsWith('-----END CERTIFICATE-----')).toBe(true);
  });
  it('repairs PEM flattened by a secret store', () => {
    const flattened = PEM.replace(/\n/g, ' ').trim();
    for (const value of [flattened, PEM.replace(/\n/g, '\\n')]) {
      const ca = String((buildTls(URL, { COWORK_DB_CA_CERT: value }).ssl as { ca?: string }).ca);
      expect(ca.startsWith('-----BEGIN CERTIFICATE-----\n')).toBe(true);
      expect(ca).toContain('\nMIIB\n');
      expect(ca.trimEnd().endsWith('-----END CERTIFICATE-----')).toBe(true);
    }
  });
  it('reads a CA file path', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ca-')), 'root.pem');
    fs.writeFileSync(file, PEM);
    expect(String((buildTls(URL, { COWORK_DB_CA_CERT: file }).ssl as { ca?: string }).ca).trim()).toBe(PEM.trim());
    expect(() => buildTls(URL, { COWORK_DB_CA_CERT: '/nope/missing.pem' })).toThrow('not readable PEM');
  });
  it('skips TLS for localhost but refuses to disable it remotely', () => {
    expect(buildTls('postgresql://u@localhost:5432/db', {}).mode).toBe('disabled');
    expect(() => buildTls(URL, { COWORK_DB_TLS: 'disable' })).toThrow('refuses remote databases');
  });
  it('rejects connection strings a URL parser would silently truncate', () => {
    for (const url of [
      'postgresql://postgres.x:pa#ss@h:6543/postgres',
      'postgresql://postgres.x:pa ss@h:6543/postgres',
      'postgresql://postgres.x:pa/ss@h:6543/postgres',
      'postgresql://postgres.x:100%zz@h:6543/postgres',
    ]) expect(() => buildTls(url, {})).toThrow('unencoded character');
    expect(() => buildTls('postgresql://post gres:pw@h:6543/postgres', {})).toThrow('username is invalid');
    // Properly encoded or plain ASCII passwords pass through untouched.
    expect(buildTls('postgresql://postgres.x:pa%23ss@h:6543/postgres', {}).mode).toBe('verify-full');
    expect(buildTls('postgresql://postgres.x:Simple1Password@h:6543/postgres', {}).connectionString).toContain('Simple1Password');
  });
  it('catches an unreplaced password placeholder without echoing secrets', () => {
    expect(() => buildTls('postgresql://postgres.abc:[YOUR-PASSWORD]@h:6543/postgres', {})).toThrow('placeholder');
    expect(() => buildTls('postgresql://postgres.abc:@h:6543/postgres', {})).toThrow('placeholder');
    expect(buildTls('postgresql://postgres@localhost:5432/db', {}).mode).toBe('disabled'); // local passwordless dev stays allowed
    const summary = describeConnection('postgresql://postgres.abc:Sup3rSecretPw@h.pooler.supabase.com:6543/postgres');
    expect(summary).toContain('password length=13');
    expect(summary).toContain('host=h.pooler.supabase.com');
    expect(summary).not.toContain('Sup3rSecretPw');
    expect(summary).not.toContain('postgres.abc');
  });
  it('explains Supabase certificate failures to the operator', () => {
    let configError: Error | undefined;
    try { buildTls('postgresql://postgres.x:pa#ss@h:6543/postgres', {}); } catch (e) { configError = e as Error; }
    const bad = errorResponse(configError);
    expect(bad.body.code).toBe('DATABASE_URL_INVALID');
    expect(String(bad.body.hint)).toContain('percent-encode');
    expect(JSON.stringify(bad.body)).not.toContain('pa#ss');
    for (const code of ['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_FAILED']) {
      const r = errorResponse(Object.assign(new Error('hidden'), { code }));
      expect(String(r.body.hint)).toMatch(/CA|hostname/);
      expect(JSON.stringify(r.body)).not.toContain('hidden');
    }
  });
});
