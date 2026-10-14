#!/usr/bin/env node
/**
 * Publish the client-side release assets next to the dashboard so a machine can install the MCP
 * server from the relay origin instead of GitHub:
 *
 *   curl -fLO https://your-relay/cowork.cjs        # the whole client, one file
 *   curl -fL  https://your-relay/install.mjs -o /tmp/i.mjs && node /tmp/i.mjs
 *
 * Vite copies `public/` into `dist/` verbatim, and Vercel serves a real file in preference to the
 * SPA rewrite, so these land at the site root. Every copy gets a sibling `.sha256` so a truncated
 * download or an HTML error page cannot masquerade as the bundle.
 *
 * Runs as part of the relay build, after `bundle:mcp` regenerated bin/cowork.cjs.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(repoRoot, 'packages', 'cowork-web-relay', 'public');

const assets = [
  ['bin/cowork.cjs', 'cowork.cjs'], // the MCP server, self-contained
  ['scripts/install-mcp.mjs', 'install.mjs'], // installer that verifies before installing
  ['scripts/verify-relay.mjs', 'verify.mjs'], // live relay checks, zero-dep
];

mkdirSync(publicDir, { recursive: true });
for (const [src, name] of assets) {
  const from = join(repoRoot, src);
  const bytes = readFileSync(from);
  copyFileSync(from, join(publicDir, name));
  writeFileSync(join(publicDir, `${name}.sha256`), `${sha256(bytes)}  ${name}\n`);
  console.log(`  public/${name} (${bytes.length} bytes, sha256 ${sha256(bytes).slice(0, 16)}…)`);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}
