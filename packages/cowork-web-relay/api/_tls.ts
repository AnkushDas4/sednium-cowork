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
const SSL_PARAMS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'sslcrl', 'sslpassword', 'ssl', 'uselibpqcompat', 'sslnegotiation'];

export function buildTls(rawUrl: string, env: NodeJS.ProcessEnv = process.env): TlsDecision {
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
