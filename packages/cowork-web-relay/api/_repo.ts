/**
 * One canonical git remote per room - the rules for reading one, and for deciding whether two
 * strings name the same repository.
 *
 * Pure and dependency-free on purpose: the relay validates a claimed remote with this, the web UI
 * formats it, and the MCP client keeps a mirrored copy (`packages/cowork-mcp/src/repo.ts`) so the
 * agent refuses a push to the wrong repo *before* it commits. Both copies must agree, so the golden
 * vectors in `test/repo-normalize.test.ts` and `packages/cowork-mcp/test/repo.test.ts` are identical.
 *
 * Rules worth knowing:
 * - `owner/repo`, `https://host/owner/repo.git`, `git@host:owner/repo.git`, `ssh://…` and
 *   `git://…` are the same repository. Bare `owner/repo` means github.com.
 * - A credential in a remote URL is a secret, and a room's state is readable by every participant
 *   in it. So userinfo is stripped before anything is stored or echoed - `https://user:tok@…`
 *   becomes `https://…`, and the only user kept is `git@`, which is part of the ssh protocol and
 *   not a secret.
 * - Local paths are refused outright: a room cannot point a collaborator at someone's filesystem.
 */

export const REPO_MAX_LENGTH = 512;
export const DEFAULT_REPO_HOST = 'github.com';

export interface RepoRef {
  /** Canonical remote to clone from or push to, with any credential already removed. */
  url: string;
  /** host[:port] in lower case - what the UI shows as the server. */
  host: string;
  /** Repository path without a leading slash, e.g. `acme/app` or a GitLab subgroup `grp/sub/app`. */
  slug: string;
  /** Comparison key: host + path, case-folded. Two spellings of one repo share it. */
  key: string;
}

type Scheme = 'https' | 'ssh' | 'git';

const SEGMENT = /^[A-Za-z0-9._~-]+$/;
const BAD_SEGMENTS = new Set(['.', '..', '.git']);
const BANNED = /[\s"'`\\<>|\u0000-\u001F\u007F]/;

/**
 * Parse any accepted spelling of a repository remote. Returns null when the value is not a
 * repository at all - callers decide whether that is a 400 or a "not configured".
 */
export function parseRepoUrl(value: unknown): RepoRef | null {
  if (typeof value !== 'string') return null;
  let raw = value.trim();
  if (!raw || raw.length > REPO_MAX_LENGTH) return null;
  if (BANNED.test(raw)) return null;

  // A mirror URL sometimes carries a query or fragment; neither identifies the repository.
  raw = raw.replace(/[#?].*$/, '');

  let scheme: Scheme = 'https';
  let authority = '';
  let path = '';

  if (/^file:\/\//i.test(raw)) return null;
  const schemeMatch = /^(https?|ssh|git):\/\//i.exec(raw);
  if (schemeMatch) {
    const kind = schemeMatch[1].toLowerCase();
    scheme = kind === 'http' ? 'https' : (kind as Scheme);
    const rest = raw.slice(schemeMatch[0].length);
    const slash = rest.indexOf('/');
    authority = slash === -1 ? rest : rest.slice(0, slash);
    path = slash === -1 ? '' : rest.slice(slash + 1);
  } else if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
    return null; // a local checkout is not a room's repo
  } else if (/^[^/@\s]+@[^/@\s:]+:/.test(raw)) {
    // scp-like `git@github.com:acme/app.git` - the colon separates host from path, no slash.
    const at = raw.indexOf('@');
    const colon = raw.indexOf(':', at);
    scheme = 'ssh';
    authority = raw.slice(0, colon);
    path = raw.slice(colon + 1);
  } else if (/^[^/@\s]+@[^/@\s]+\/.*$/.test(raw)) {
    // `git@host/path` - a user with a real path; the user is dropped below either way.
    const at = raw.indexOf('@');
    const slash = raw.indexOf('/', at);
    scheme = 'ssh';
    authority = raw.slice(0, slash);
    path = raw.slice(slash + 1);
  } else if (/^[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)+$/.test(raw)) {
    // Two shapes share this syntax and only one dot tells them apart: `acme/app` is shorthand for
    // github.com, while `gitlab.com/acme/app` is a host and a path. `localhost` has no dot but is
    // obviously a server, so it joins the host side rather than becoming someone's owner name.
    const first = raw.slice(0, raw.indexOf('/'));
    const looksLikeHost = first.includes('.') || first === 'localhost';
    if (looksLikeHost) {
      authority = first;
      path = raw.slice(first.length + 1);
    } else {
      authority = DEFAULT_REPO_HOST;
      path = raw;
    }
  } else {
    return null;
  }

  // Strip userinfo unconditionally: who logs in is the client's business, and a token that rode in
  // here must never reach room state. ssh remotes get `git@` back below, which is protocol, not secret.
  const at = authority.lastIndexOf('@');
  const hostPort = (at === -1 ? authority : authority.slice(at + 1)).trim().toLowerCase();
  if (!hostPort) return null;
  const colon = hostPort.lastIndexOf(':');
  let hostName = hostPort;
  let port = '';
  if (colon !== -1 && /^[0-9]{1,5}$/.test(hostPort.slice(colon + 1))) {
    hostName = hostPort.slice(0, colon);
    port = hostPort.slice(colon + 1);
    // A scheme's own default port carries no information, and dropping it is what makes two
    // spellings of one server compare equal.
    if (port === (scheme === 'ssh' ? '22' : scheme === 'git' ? '9418' : '443')) port = '';
  } else if (colon !== -1) {
    return null; // `http://user:pass@host/x` leaves a non-numeric remnant only if userinfo survived
  }
  if (/^www\./.test(hostName)) hostName = hostName.replace(/^www\./, '');
  if (!/^[a-z0-9.-]+$/.test(hostName) || hostName.startsWith('.') || hostName.endsWith('.')) return null;
  // github.com over https is the same repository as over ssh - the host decides the canonical form.
  const host = port ? `${hostName}:${port}` : hostName;

  path = path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return null; // `github.com/` or `acme` alone is not a repository
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || BAD_SEGMENTS.has(segment)) return null;
  }
  const slug = segments.join('/');
  const url = scheme === 'ssh' ? `ssh://git@${host}/${slug}` : `${scheme}://${host}/${slug}`;
  return { url, host, slug, key: `${host}/${slug.toLowerCase()}` };
}

/**
 * Does either spelling name the same repository? Accepts a raw string, a parsed ref, or a stored
 * room binding (which carries the canonical url but not the key), because every caller has one of the
 * three in hand - a client that compared `binding.key` against `undefined` would call every push a
 * mismatch.
 */
export function sameRepo(a: unknown, b: unknown): boolean {
  const keyOf = (value: unknown): string | null => {
    if (typeof value === 'string') return parseRepoUrl(value)?.key ?? null;
    if (value && typeof value === 'object') {
      const raw = value as { key?: unknown; url?: unknown };
      if (typeof raw.key === 'string') return raw.key.toLowerCase();
      if (typeof raw.url === 'string') return parseRepoUrl(raw.url)?.key ?? null;
    }
    return null;
  };
  const left = keyOf(a);
  const right = keyOf(b);
  return left !== null && right !== null && left === right;
}

/**
 * For UI copy: the exact command that gives an agent this room's working copy. Takes the *shape* it
 * needs rather than RepoRef, so a stored room binding (no `key` field) works too.
 */
export const cloneCommand = (ref: { url: string } | null | undefined): string =>
  ref ? `git clone ${ref.url}` : '';

/** Display form: `github.com/acme/app`, kept short so it fits a header chip. */
export const repoLabel = (ref: { host: string; slug: string } | null | undefined): string =>
  ref ? `${ref.host}/${ref.slug}` : '';
