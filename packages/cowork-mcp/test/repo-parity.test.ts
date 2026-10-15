import { describe, expect, it } from 'vitest';
import {
  cloneCommand,
  parseRepoUrl as parseAgentSide,
  sameRepo as sameAgentSide,
} from '../src/repo.js';
import {
  cloneCommand as cloneRelaySide,
  parseRepoUrl as parseRelaySide,
  sameRepo as sameRelaySide,
  repoLabel,
} from '../../cowork-web-relay/api/_repo.js';

/**
 * `packages/cowork-mcp/src/repo.ts` is a hand-kept mirror of the relay's `api/_repo.ts`: the agent
 * must refuse a push to the wrong repository for exactly the reason the relay would. This file does
 * not test the rules so much as the *agreement* - if the two ever disagree, an agent commits work the
 * room then rejects, which is the worst possible failure here.
 */
const VECTORS = [
  'acme/app',
  'acme/app.git',
  'https://github.com/acme/app',
  'https://github.com/acme/app.git/',
  'http://github.com/acme/app',
  'git@github.com:acme/app.git',
  'ssh://git@github.com/acme/app',
  'ssh://git@github.com:22/acme/app',
  'ssh://git@git.internal:2222/acme/app',
  'ssh://deploy@github.com/acme/app',
  'git://build.internal:9418/acme/app',
  'https://gitlab.com/grp/sub/proj.git',
  'GitHub.com/Acme/App',
  'www.github.com/acme/app',
  'localhost/acme/app',
  'https://user:ghp_SECRET@github.com/acme/app',
  'https://github.com/acme/app?access_token=ghp_SECRET',
  'https://github.com/acme/app#frag',
  '',
  '   ',
  '/',
  'acme',
  'github.com',
  'github.com/acme',
  'a/b/../../c',
  '/home/dev/repo',
  './local',
  '../sibling',
  'file:///home/dev/repo',
  'C:\\repos\\app',
  'git@github.com',
  'https://@/a/b',
  'acme app/repo',
  "acme/app'; rm -rf /",
  'acme/app`id`',
  `acme/${'a'.repeat(600)}`,
  undefined,
  null,
  42,
  { url: 'acme/app' },
] as unknown[];

describe('repo mirror parity', () => {
  it('reaches the same verdict on every spelling of a remote', () => {
    for (const value of VECTORS) {
      const label = typeof value === 'string' ? value : JSON.stringify(value);
      expect(parseAgentSide(value), label).toEqual(parseRelaySide(value));
    }
  });

  it('agrees on which pairs name the same repository', () => {
    const same = [
      ['acme/app', 'https://github.com/acme/app.git'],
      ['git@github.com:acme/app.git', 'https://github.com/acme/app'],
      ['https://user:tok@github.com/acme/app', 'acme/app'],
      ['ACME/App', 'acme/app'],
      ['localhost/acme/app', 'localhost/acme/app.git'],
    ];
    for (const [a, b] of same) {
      expect(sameAgentSide(a, b), `${a} vs ${b}`).toBe(true);
      expect(sameRelaySide(a, b), `${a} vs ${b} (relay)`).toBe(true);
    }
    const different = [
      ['acme/app', 'acme/app2'],
      ['acme/app', 'gitlab.com/acme/app'],
      ['acme/app', 'ssh://git@git.internal:2222/acme/app'],
      ['acme/app', ''],
    ];
    for (const [a, b] of different) {
      expect(sameAgentSide(a, b), `${a} vs ${b}`).toBe(false);
      expect(sameRelaySide(a, b), `${a} vs ${b} (relay)`).toBe(false);
    }
  });

  it('accepts a stored room binding on both sides', () => {
    // The relay stores {url, host, slug} with no key; comparing against that must not read as a mismatch.
    const binding = { url: 'https://github.com/acme/app', host: 'github.com', slug: 'acme/app', by: 'loid-ai', at: 1, source: 'push' as const };
    expect(sameAgentSide(binding, 'git@github.com:acme/app.git')).toBe(true);
    expect(sameRelaySide(binding, 'acme/app')).toBe(true);
    expect(sameAgentSide(binding, 'acme/other')).toBe(false);
    expect(cloneCommand({ url: binding.url })).toBe(cloneRelaySide({ url: binding.url }));
  });

  it('prints the clone command from the canonical url, never from raw input', () => {
    const ref = parseAgentSide('https://oauth2:ghp_SECRET@github.com/acme/app')!;
    expect(cloneCommand(ref)).toBe('git clone https://github.com/acme/app');
    expect(repoLabel(ref)).toBe('github.com/acme/app');
  });
});
