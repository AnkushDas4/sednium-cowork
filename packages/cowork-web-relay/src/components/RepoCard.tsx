import React, { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, GitBranch, Link2, Loader2, Lock } from 'lucide-react';
import { parseRepoUrl, repoLabel, type RepoRef } from '../../api/_repo.js';
import type { GitRepoBinding } from '../../api/_types.js';
import { timeAgo } from '../notifications.js';

interface RepoCardProps {
  /** The room's canonical repository, or null when nobody has decided yet. */
  gitRepo: GitRepoBinding | null;
  /**
   * Links a repository. Resolves with a message when the relay refused, which the card shows inline:
   * "already bound to something else" is a fact the human should read, not a toast that disappears.
   * Omit to render read-only.
   */
  onLink?: (repo: string) => Promise<string | void>;
}

/** Only offer a web link when the host actually looks like a website, not a port or an internal name. */
const webUrl = (ref: { host: string; slug: string }): string | null => {
  if (ref.host.includes(':') || !/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(ref.host)) return null;
  return `https://${ref.host}/${ref.slug}`;
};

const CopyLine: React.FC<{ value: string; label: string }> = ({ value, label }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the text is selectable, so a long press still works.
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="group flex w-full items-center gap-2 rounded-sm border border-grid bg-canvas px-2 py-1.5 text-left transition-colors hover:border-accent/40"
      title={label}
    >
      <code className="min-w-0 flex-1 truncate font-mono text-2xs text-secondary select-all">{value}</code>
      {copied ? (
        <Check className="w-3.5 h-3.5 shrink-0 text-ok" />
      ) : (
        <Copy className="w-3.5 h-3.5 shrink-0 text-muted group-hover:text-primary" />
      )}
    </button>
  );
};

/**
 * The one repository this room agrees to work in. The rule is decided once - either a human links it
 * here, or the first agent push decides it - and after that every client refuses to push anywhere else,
 * so "which repo is this work for?" can never be an open question mid-session.
 */
export const RepoCard: React.FC<RepoCardProps> = ({ gitRepo, onLink }) => {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<RepoRef | null>(null);

  // Validate as they type, but only against the local rules: no network until Submit.
  useEffect(() => {
    const value = draft.trim();
    if (!value) {
      setPreview(null);
      setError('');
      return;
    }
    const parsed = parseRepoUrl(value);
    setPreview(parsed);
    setError(parsed ? '' : 'Use owner/repo, or a full URL like https://github.com/acme/app');
  }, [draft]);

  const submit = async () => {
    if (!preview || !onLink || busy) return;
    setBusy(true);
    const refusal = await onLink(preview.url);
    setBusy(false);
    if (refusal) {
      setError(refusal);
      return;
    }
    setDraft('');
    setPreview(null);
  };

  return (
    <section className="bg-panel px-4 py-3.5 xs:px-5" data-id="repo-card">
      <div className="flex items-center justify-between gap-2 text-xs font-mono uppercase tracking-wider text-muted">
        <div className="flex min-w-0 items-center gap-2">
          <GitBranch className="w-4 h-4 shrink-0 text-accent" />
          <span className="font-semibold text-primary">Room Repository</span>
        </div>
        {gitRepo ? (
          <span className="chip shrink-0 border border-grid text-2xs">
            <Lock className="mr-1 inline w-3 h-3" strokeWidth={2.2} />
            LOCKED
          </span>
        ) : (
          <span className="shrink-0 text-2xs font-semibold normal-case text-muted">first push decides</span>
        )}
      </div>

      {gitRepo ? (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <code className="min-w-0 break-all font-mono text-xs font-semibold text-primary">{repoLabel(gitRepo)}</code>
            {webUrl(gitRepo) && (
              <a
                href={webUrl(gitRepo)!}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-2xs text-accent hover:underline"
              >
                open
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="text-2xs leading-relaxed text-muted">
            {gitRepo.source === 'push'
              ? `Decided by @${gitRepo.by}'s first push`
              : `Linked by @${gitRepo.by}`}{' '}
            · {timeAgo(Date.now() - gitRepo.at)} ago · every agent in this room pushes and clones here, and a
            push to any other remote is refused
          </p>
          <CopyLine value={`git clone ${gitRepo.url}`} label="Copy the clone command" />
          <p className="text-2xs text-muted">
            To work in a different repository, start a new room - the binding is deliberately immutable.
          </p>
        </div>
      ) : onLink ? (
        <div className="mt-2.5 space-y-2">
          <p className="text-2xs leading-relaxed text-muted">
            Link a GitHub repository (or any git remote) and every agent here pushes and clones only that one.
            Leave it empty and the first push decides - permanently.
          </p>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <label className="sr-only" htmlFor="repo-input">
                Repository
              </label>
              <input
                id="repo-input"
                data-id="repo-input"
                className="field w-full font-mono"
                placeholder="acme/app  or  git@github.com:acme/app.git"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submit();
                }}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="url"
                disabled={busy}
              />
              {preview && (
                <p className="mt-1 text-2xs text-secondary">
                  <Link2 className="mr-1 inline w-3 h-3 text-accent" />
                  will be stored as <code className="font-mono">{preview.url}</code>
                  {draft.includes('@') && !preview.url.includes('@') && ' (credential stripped)'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!preview || busy}
              className="btn-primary min-tap shrink-0 px-3 text-xs disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Link'}
            </button>
          </div>
          {error && (
            <p role="alert" className="rounded-sm border border-danger/30 bg-danger-soft px-2 py-1.5 text-2xs text-danger">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-2xs text-muted">
          No repository yet. The first agent to push decides which one this room works in.
        </p>
      )}
    </section>
  );
};
