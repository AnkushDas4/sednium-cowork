import fs from 'node:fs';

/**
 * Database TLS policy.
 *
 * Supabase signs its Postgres and poolers with a private root ("Supabase Root 2021 CA")
 * that is not in Node's trust store, so plain verification fails with
 * SELF_SIGNED_CERT_IN_CHAIN. Current pg versions also treat `sslmode=require` as
 * verify-full, and any ssl params in the URL override an explicit `ssl` object - so we
 * strip them and pass exactly one decision to the driver.
 *
 * Precedence (never silently weakens TLS):
 *   COWORK_DB_CA_CERT / COWORK_DB_CA_CERT_FILE  -> verify against that pinned CA
 *   COWORK_DB_TLS=no-verify                     -> encrypt, skip chain verification (stopgap)
 *   COWORK_DB_TLS=disable                       -> no TLS; refused for remote hosts
 *   URL sslmode=no-verify                       -> encrypt, skip verification (with warning)
 *   otherwise                                   -> verify-full using the system trust store
 */
export type TlsMode = 'verify-full' | 'verify-pinned-ca' | 'no-verify' | 'disabled';

export interface TlsDecision {
  /** Connection string with every ssl* param removed (we control TLS ourselves). */
  connectionString: string;
  /** Value for pg's `ssl` option. */
  ssl: false | { rejectUnauthorized: boolean; ca?: string; servername?: string };
  mode: TlsMode;
  warning?: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
/**
 * A URL parser only sees what the connection string lets it see: an unencoded `#`, `?`, `/`
 * or whitespace inside the password silently truncates it, and pg then authenticates with a
 * shorter password (28P01). Fail loudly instead of guessing. Never echoes the value.
 */
const SSL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslcrl', 'sslpassword', 'ssl', 'uselibpqcompat', 'sslnegotiation'];

export function assertUsableUrl(raw: string): void {
  const invalid = 'DATABASE_URL contains an unencoded character in the password - percent-encode it (# -> %23, ? -> %3F, / -> %2F, % -> %25) or reset the database password to letters and digits only';
  const schemeEnd = raw.indexOf('://');
  if (schemeEnd === -1) return;
  const rest = raw.slice(schemeEnd + 3);
  const queryAt = rest.search(/[?]/);
  const authorityRegion = queryAt === -1 ? rest : rest.slice(0, queryAt);
  const firstSlash = authorityRegion.indexOf('/');
  const authority = firstSlash === -1 ? authorityRegion : authorityRegion.slice(0, firstSlash);
  const at = authority.lastIndexOf('@');
  if (at === -1) {
    // An '@' after a '/' means the password held an unencoded '/'.
    if (firstSlash !== -1 && authorityRegion.includes('@')) throw new Error(invalid);
    return;
  }
  const userinfo = authority.slice(0, at);
  const colon = userinfo.lastIndexOf(':');
  const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
  const password = colon === -1 ? '' : userinfo.slice(colon + 1);
  if (user && !/^[\w.$-]+$/.test(user)) {
    throw new Error('DATABASE_URL username is invalid for a URL - percent-encode it, or use an alphanumeric database password');
  }
  if (/[#?/\s]/.test(password) || /%(?![0-9A-Fa-f]{2})/.test(password)) throw new Error(invalid);
  const host = authority.slice(at + 1).toLowerCase().replace(/:\d+$/, '');
  const localHost = LOCAL_HOSTS.has(host) || host.startsWith('127.') || host.startsWith('[::1]');
  // Supabase's SHARED pooler maps tenants from the username suffix: postgres.<PROJECT-REF>.
  // A bare "postgres" there fails as 28P01 even with a perfectly correct password.
  if (/\.pooler\.supabase\.com$/.test(host) && !user.includes('.')) {
    throw new Error('DATABASE_URL username must be postgres.<PROJECT-REF> for the shared Supabase pooler (the bare "postgres" user is only for direct connections and the dedicated pooler)');
  }
  if (/YOUR-PASSWORD|YOUR_PASSWORD/i.test(password) || (password === '' && !localHost)) {
    throw new Error('DATABASE_URL still contains the [YOUR-PASSWORD] placeholder (or an empty password) - paste the real database password');
  }
}

/**
 * Server-log-only summary. Never returns password content: length and host are enough to spot
 * a truncated or stale credential, and this must not reach an API response.
 */
export function describeConnection(raw: string): string {
  try {
    const url = new URL(raw);
    const user = url.username ? decodeURIComponent(url.username) : '';
    const suffix = user.includes('.') ? `+ref suffix (${user.split('.').length - 1})` : 'NO ref suffix';
    return `user=${user.slice(0, 3)}*** ${suffix}, password length=${decodeURIComponent(url.password).length}, host=${url.hostname}, port=${url.port || 'default'}`;
  } catch {
    return 'connection string could not be parsed';
  }
}

export function buildTls(rawUrl: string, env: NodeJS.ProcessEnv = process.env): TlsDecision {
  assertUsableUrl(rawUrl);
  const url = new URL(rawUrl);
  const urlSslMode = url.searchParams.get('sslmode') || '';
  const urlRootCert = url.searchParams.get('sslrootcert') || '';
  for (const key of SSL_PARAMS) url.searchParams.delete(key);

  const isLocal = LOCAL_HOSTS.has(url.hostname);
  const requested = (env.COWORK_DB_TLS || '').trim().toLowerCase();
  const caSource = (env.COWORK_DB_CA_CERT || env.COWORK_DB_CA_CERT_FILE || env.DATABASE_CA_CERT || '').trim() || urlRootCert;
  const stopgap = 'Set COWORK_DB_CA_CERT to the CA certificate Supabase publishes (Project Settings -> Database -> SSL), or COWORK_DB_TLS=no-verify for an encrypted-but-unverified stopgap.';

  if (caSource) {
    const ca = caSource.includes('BEGIN CERTIFICATE') ? normalizePem(caSource) : safeRead(caSource, env);
    if (!ca) throw new Error(`COWORK_DB_CA_CERT/COWORK_DB_CA_CERT_FILE is not readable PEM content or an existing file: ${caSource.slice(0, 40)}`);
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: true, ca, servername: url.hostname },
      mode: 'verify-pinned-ca',
    };
  }

  if (requested === 'disable') {
    if (!isLocal) throw new Error('COWORK_DB_TLS=disable refuses remote databases; keep TLS on for Supabase');
    return { connectionString: url.toString(), ssl: false, mode: 'disabled' };
  }
  if (requested === 'no-verify' || requested === 'insecure') {
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
      mode: 'no-verify',
      warning: 'COWORK_DB_TLS=no-verify encrypts traffic but does not verify the server certificate. Pin the CA instead when convenient. ' + stopgap,
    };
  }
  if (isLocal) return { connectionString: url.toString(), ssl: false, mode: 'disabled' };
  if (urlSslMode === 'no-verify') {
    return {
      connectionString: url.toString(),
      ssl: { rejectUnauthorized: false },
      mode: 'no-verify',
      warning: 'sslmode=no-verify in DATABASE_URL encrypts traffic without verifying the certificate. Pin the CA instead when convenient. ' + stopgap,
    };
  }
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: true }, mode: 'verify-full', warning: undefined };
}

/**
 * Repairs PEM that a secret store flattened or escaped: Node's TLS API needs real line
 * breaks between the armor markers and the base64 body.
 */
export function normalizePem(pem: string): string {
  let out = pem.replace(/\\n/g, '\n');
  if (!out.includes('\n')) {
    out = out
      .replace(/-----BEGIN CERTIFICATE-----/g, '-----BEGIN CERTIFICATE-----\n')
      .replace(/-----END CERTIFICATE-----/g, '\n-----END CERTIFICATE-----');
  }
  out = out.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim();
  return out.endsWith('-----END CERTIFICATE-----') ? out + '\n' : out;
}

function safeRead(path: string, env: NodeJS.ProcessEnv): string {
  void env;
  try { return fs.readFileSync(path, 'utf8'); } catch { return ''; }
}
