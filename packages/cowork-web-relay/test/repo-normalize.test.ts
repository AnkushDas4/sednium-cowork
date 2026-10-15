import { describe, expect, it } from 'vitest';
import { cloneCommand, parseRepoUrl, repoLabel, sameRepo } from '../api/_repo.js';

const ref = (value: string) => parseRepoUrl(value)!;

/**
 * Golden vectors. `packages/cowork-mcp/src/repo.ts` is a mirror of this module - the agent side has
 * to reach the same verdict about "is this the room's repo?" or enforcement becomes a coin flip, so
 * these cases are duplicated there on purpose. Change one, change both.
 */
describe('parseRepoUrl', () => {
  it('reads the shorthand, the .git suffix and a trailing slash as one repo', () => {
    const expected = { url: 'https://github.com/acme/app', host: 'github.com', slug: 'acme/app' };
    expect(ref('acme/app')).toMatchObject(expected);
    expect(ref('acme/app.git')).toMatchObject(expected);
    expect(ref('https://github.com/acme/app.git')).toMatchObject(expected);
    expect(ref('https://github.com/acme/app.git/')).toMatchObject(expected);
    expect(ref('http://github.com/acme/app')).toMatchObject(expected); // http is upgraded, not refused
  });

  it('normalizes every ssh spelling to one canonical remote', () => {
    const expected = { url: 'ssh://git@github.com/acme/app', host: 'github.com', slug: 'acme/app' };
    expect(ref('git@github.com:acme/app.git')).toMatchObject(expected);
    expect(ref('ssh://git@github.com/acme/app')).toMatchObject(expected);
    expect(ref('ssh://github.com/acme/app')).toMatchObject(expected); // the user is implied
    expect(ref('ssh://git@github.com:22/acme/app')).toMatchObject(expected); // a default port is noise
  });

  it('keeps a non-default port, because that is a different server', () => {
    expect(ref('ssh://git@git.internal:2222/acme/app').host).toBe('git.internal:2222');
    expect(ref('git://build.internal:9418/acme/app').url).toBe('git://build.internal/acme/app'); // git's own port
    expect(ref('https://build.internal:8443/acme/app').host).toBe('build.internal:8443');
    expect(ref('git://build.internal/acme/app').url).toBe('git://build.internal/acme/app');
  });

  it('supports subgroups and case, lower-casing only the host', () => {
    const gitlab = ref('https://gitlab.com/grp/sub/proj.git');
    expect(gitlab.slug).toBe('grp/sub/proj');
    expect(gitlab.url).toBe('https://gitlab.com/grp/sub/proj');
    const cased = ref('GitHub.com/Acme/App');
    expect(cased.slug).toBe('Acme/App');
    expect(cased.host).toBe('github.com');
    expect(ref('www.github.com/acme/app').url).toBe('https://github.com/acme/app');
  });

  it('never keeps a credential, in the userinfo or in the query', () => {
    for (const hostile of [
      'https://user:ghp_SUPERSECRET@github.com/acme/app',
      'https://x-access-token:ghp_SUPERSECRET@github.com/acme/app',
      'https://github.com/acme/app?access_token=ghp_SUPERSECRET',
      'https://github.com/acme/app#ghp_SUPERSECRET',
      'ssh://oauth2:ghp_SUPERSECRET@github.com/acme/app',
    ]) {
      const parsed = parseRepoUrl(hostile);
      expect(parsed, hostile).not.toBeNull();
      expect(parsed!.url, hostile).not.toContain('ghp_SUPERSECRET');
      if (!parsed!.url.startsWith('ssh://')) expect(parsed!.url, hostile).not.toContain('@'); // no user survives
      expect(parsed!.key, hostile).toBe('github.com/acme/app');
    }
    // The ssh form keeps exactly one user, and it is the protocol's own.
    expect(ref('ssh://deploy@github.com/acme/app').url).toBe('ssh://git@github.com/acme/app');
  });

  it('refuses anything that is not a repository remote', () => {
    for (const bad of [
      '',
      '   ',
      '/',
      'acme',
      'github.com',
      'github.com/acme', // a host and an owner is still not a repo
      'a/b/../../c',
      '/home/dev/repo',
      './local-checkout',
      '../sibling',
      'file:///home/dev/repo',
      'C:\\repos\\app',
      'git@github.com',
      'localhost',
      'https://@/a/b',
      'https://:80/a/b',
      'acme app/repo',
      'acme/ap p',
      "acme/app'; rm -rf /",
      'acme/app`id`',
      'acme/\u0000app',
      `acme/${'a'.repeat(600)}`,
    ]) {
      expect(parseRepoUrl(bad), bad).toBeNull();
    }
  });

  it('accepts only strings and ignores a shape it cannot trust', () => {
    expect(parseRepoUrl(undefined)).toBeNull();
    expect(parseRepoUrl(null)).toBeNull();
    expect(parseRepoUrl(42)).toBeNull();
    expect(parseRepoUrl({ url: 'acme/app' })).toBeNull();
  });
});

describe('sameRepo', () => {
  it('says yes across spellings of one repository', () => {
    expect(sameRepo('acme/app', 'https://github.com/acme/app.git')).toBe(true);
    expect(sameRepo('git@github.com:acme/app.git', 'https://github.com/acme/app')).toBe(true);
    expect(sameRepo('https://user:tok@github.com/acme/app', 'acme/app')).toBe(true);
    expect(sameRepo('ACME/App', 'acme/app')).toBe(true);
    // A ref object compares without re-parsing.
    expect(sameRepo(ref('acme/app'), 'git@github.com:acme/app')).toBe(true);
  });

  it('says no to a different repository, however similar', () => {
    expect(sameRepo('acme/app', 'acme/app2')).toBe(false);
    expect(sameRepo('acme/app', 'other/app')).toBe(false);
    expect(sameRepo('acme/app', 'gitlab.com/acme/app')).toBe(false);
    expect(sameRepo('acme/app', 'git.internal:2222/acme/app')).toBe(false);
    expect(sameRepo('acme/app', 'not a repo')).toBe(false);
    expect(sameRepo(null, 'acme/app')).toBe(false);
    expect(sameRepo(undefined, undefined)).toBe(false);
  });
});

describe('display helpers', () => {
  it('produces a command an agent can paste, and a label that fits a chip', () => {
    expect(cloneCommand(ref('acme/app'))).toBe('git clone https://github.com/acme/app');
    expect(repoLabel(ref('git@github.com:acme/app.git'))).toBe('github.com/acme/app');
    expect(cloneCommand(null)).toBe('');
    expect(repoLabel(null)).toBe('');
  });
});
