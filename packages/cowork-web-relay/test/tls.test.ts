import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildTls } from '../api/_tls.js';
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
  it('explains Supabase certificate failures to the operator', () => {
    for (const code of ['SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_FAILED']) {
      const r = errorResponse(Object.assign(new Error('hidden'), { code }));
      expect(String(r.body.hint)).toMatch(/CA|hostname/);
      expect(JSON.stringify(r.body)).not.toContain('hidden');
    }
  });
});
