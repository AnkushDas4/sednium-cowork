import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepoCard } from '../src/components/RepoCard.js';
import type { GitRepoBinding } from '../api/_types.js';

const render = (props: { gitRepo: GitRepoBinding | null; onLink?: (repo: string) => Promise<string | void> }) =>
  renderToStaticMarkup(React.createElement(RepoCard, props));

const linked: GitRepoBinding = {
  url: 'https://github.com/acme/app',
  host: 'github.com',
  slug: 'acme/app',
  by: 'host-ai',
  at: Date.now() - 90_000,
  source: 'linked',
};

describe('RepoCard', () => {
  it('explains the rule while the room is still unbound and read-only', () => {
    const html = render({ gitRepo: null });
    expect(html).toContain('data-id="repo-card"');
    expect(html).toContain('Room Repository');
    expect(html).toContain('first push decides');
    expect(html).toContain('No repository yet');
    expect(html).not.toContain('data-id="repo-input"'); // nothing to type until someone may link
  });

  it('offers one input that says what will be stored, and that it is forever', () => {
    const html = render({ gitRepo: null, onLink: async () => undefined });
    expect(html).toContain('data-id="repo-input"');
    expect(html).toContain('acme/app');
    expect(html).toContain('Leave it empty and the first push decides - permanently');
    // The mobile contracts the rest of the UI keeps: no autocorrect on a path, 16px inputs.
    expect(html).toContain('autoCapitalize="off"');
    expect(html).toContain('autoComplete="off"'); // renderToStaticMarkup keeps React's casing
    expect(html).toContain('class="field w-full font-mono"');
    expect(html).toContain('<label class="sr-only" for="repo-input">'); // labelled, not just a placeholder
  });

  it('shows the bound repository, who decided it, and how to get a copy', () => {
    const html = render({ gitRepo: linked });
    expect(html).toContain('LOCKED');
    expect(html).toContain('github.com/acme/app');
    expect(html).toContain('git clone https://github.com/acme/app');
    expect(html).toContain('Linked by @host-ai');
    expect(html).toContain('a push to any other remote is refused');
    expect(html).toContain('start a new room');
    expect(html).toContain('href="https://github.com/acme/app"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).not.toContain('data-id="repo-input"');
  });

  it('names the first push as the author when that is what decided it', () => {
    const html = render({ gitRepo: { ...linked, source: 'push', by: 'cursor-ai' } });
    // An apostrophe comes back escaped from renderToStaticMarkup, so assert around it.
    expect(html).toContain('Decided by @cursor-ai');
    expect(html).toContain('s first push');
  });

  it('will not offer a web link for a host that is not a website', () => {
    const html = render({ gitRepo: { ...linked, host: 'git.internal:2222', url: 'ssh://git@git.internal:2222/acme/app' } });
    expect(html).not.toContain('<a href');
    expect(html).toContain('git clone ssh://git@git.internal:2222/acme/app');
  });

  it('keeps the Link action inert until something usable is typed', () => {
    const html = render({ gitRepo: null, onLink: async () => undefined });
    expect(html).toContain('>Link<');
    expect(html).toContain('disabled=""'); // a bad or empty draft cannot be submitted
    expect(html).toContain('value=""'); // controlled input, so a submitted draft is always what was parsed
  });
});
