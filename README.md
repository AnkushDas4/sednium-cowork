# Sednium CoWork

A React dashboard, HTTP collaboration relay, and local stdio MCP server for small trusted teams.

## Storage: one Supabase PostgreSQL database

Use **one Supabase project/database**. No Redis, Neon, or additional database is required.
Local, preview, and production instances using the same `DATABASE_URL` share room data.

1. In Supabase **Connect**, choose **URI → Transaction pooler** (port `6543`).
2. Replace the password placeholder privately. Percent-encode special characters in the password.
3. Set the complete URI as the server-side **`DATABASE_URL`** environment variable in Vercel.
   Never put it in a `VITE_*` variable, frontend code, screenshots, or Git.
4. Use the database owner connection from Supabase. On first use, the relay creates
   `public.cowork_rooms` if missing, enables RLS, and revokes direct access from
   `PUBLIC`, `anon`, and `authenticated`. Other application tables are not changed.
5. Redeploy after environment changes. Test a newly generated room with two clients.

### Supabase TLS

Verification against the system trust store is the default for non-local hosts. Supabase signs
its database and poolers with a **private root CA**, so the first connection can fail with
`self-signed certificate in certificate chain`. That is a trust problem, not a bug - the old
relay hid it by disabling verification for every non-localhost URL. Pick one:

1. **Preferred - pin the CA.** Download the root certificate from Supabase
   (Project Settings → Database → SSL connection), then set either
   `COWORK_DB_CA_CERT=/absolute/path/to/root.crt` or paste the whole PEM
   (`-----BEGIN CERTIFICATE-----` … ) into `COWORK_DB_CA_CERT`. Chain **and** hostname are
   verified (`verify-pinned-ca`).
2. **Stopgap - `COWORK_DB_TLS=no-verify`** (equivalently `?sslmode=no-verify` in the URL).
   Traffic is encrypted but the certificate is not verified, so an active network attacker
   could impersonate the database. The relay logs a warning while this is set.

`COWORK_DB_TLS=disable` is refused for remote hosts. Any `ssl*` params in `DATABASE_URL` are
stripped so the URL can never silently override the driver's TLS settings; `sslmode=require`
means *verify* with current `pg`, so it does not work against Supabase without a pinned CA.

### Local development

Node.js 20+ and Git are required.

```bash
npm ci
cp .env.example .env
# Edit .env privately with the SAME Supabase connection string, if desired.
npm run dev:relay
```

Open `http://localhost:3000`. The Express runner explicitly loads the root `.env`.
Without `DATABASE_URL`, local development uses temporary process memory (lost on restart).
Production/Vercel **requires PostgreSQL** and fails with 503 on database errors. It never
silently switches to memory or `/tmp` files.

### Transaction and delivery guarantees

- Every room mutation uses one checked-out connection, `BEGIN`, a room row lock
  (`SELECT ... FOR UPDATE`), update, and `COMMIT`. Failures roll back.
- Generated room codes contain 128 bits of cryptographic randomness and are inserted
  with a unique primary key before being returned.
- File paths are normalized. Live file leases are renewed by owner heartbeats and expire
  after 90 seconds without renewal. Expired leases are not resurrected by a late heartbeat.
- Presence returns up to 100 pending messages. The next successful client poll acknowledges
  received message IDs. Lost responses are redelivered; clients deduplicate by message ID.
- Acknowledgement means **received by the client**, not that an AI completed the task.
  A client that retries a send after a timeout may create a duplicate message; recipients deduplicate
  by content and message ID where possible, so keep sends idempotent.
  MCP's pending local queue is not durable across a process crash after acknowledgement.
- Room history retains 100 events; the dashboard fetches 50 and displays at most 500 locally.
- Rooms allow up to 100 participants/inboxes and 1,000 pending messages per recipient.
  Full recipient inboxes reject sends rather than silently dropping user messages.

## Room and participant security

Use **New Room** or connect without a room code, then share the generated invite privately.
The room code is a **bearer invitation**: anyone with it can join with a new handle, read
room history, and send messages. Short/custom room codes remain supported for compatibility
but are guessable; do not use them for private work. There is no account/login system.

Each participant reserves their handle with a private token. A different token cannot
impersonate that existing handle, unlock its files, or drain its inbox.

- Browser tokens are generated with Web Crypto and retained in localStorage.
- MCP tokens are saved at `~/.config/sednium-cowork/participant-token` with mode `0600`.
  `COWORK_PARTICIPANT_TOKEN` or `cowork_connect.participantToken` can override this.
- Use different handles on different devices unless intentionally sharing the token.
- Clearing browser storage or losing the MCP token requires a new handle (or restoring
  the original token). There is no automatic identity takeover or token recovery.
- Existing legacy handles become bound to the first authenticated participant after upgrade.
  **Start fresh generated rooms when upgrading.**
- These controls do not make messages from invited teammates trustworthy instructions.
  Review agent instructions and leave automatic Git operations off unless the room is trusted.

Internet-facing deployments still need deployment-level rate limiting/abuse protection.
Room creation is public, and old rooms are not automatically deleted. Monitor database usage
and remove retired rooms deliberately. File locks are advisory, not filesystem permissions;
symlinks and filesystem-specific case aliases are not resolved by the relay.

## MCP configuration

The standalone bundle is `bin/cowork.cjs`; rebuild it whenever MCP source changes.
Example harness config using a locally installed checkout:

```json
{
  "mcpServers": {
    "cowork": {
      "command": "node",
      "args": ["/absolute/path/to/sednium-cowork/bin/cowork.cjs"],
      "env": {
        "COWORK_RELAY_URL": "https://your-relay-domain.example"
      }
    }
  }
}
```

The relay URL is configurable; the legacy default is `https://cowork.sednium.com`.
Set it explicitly when testing a branch deployment. The database URL belongs only on the
relay server; **do not give it to MCP clients**.

| Tool | Parameters |
|---|---|
| `cowork_connect` | `agentId`, optional `roomCode`, `repoPath`, `relayUrl`, `model`, `harness`, `participantToken`, `branch`, `remote`, `autoPull` |
| `cowork_claim_files` | `files`, `taskDescription` |
| `cowork_message_peer` | `targetId`, `message`, optional `contentType` |
| `cowork_sync_main` | **`files`**, `commitMessage` |
| `cowork_check_inbox` | optional `waitForSeconds` |
| `cowork_watch_loop` | optional `durationSeconds` |

Model labels come from explicit arguments/environment variables; missing model information
is not guessed from a hardcoded product/version name. Relay failures are reported as errors,
not as successful connections or deliveries.

### Git safety / behavior changes

- Automatic pulls are **off by default**; opt in with `autoPull: true` when connecting.
- `branch` and `remote` default to `main` and `origin` but are configurable. Set `branch`
  to the branch you actually intend to use. Operations refuse a different checkout.
- Pulls require a clean worktree. Busy/dirty-tree pulls are deferred and retried while polling;
  other pull failures are logged and require intervention. No automatic autostash.
- Sync requires an explicit list of individual files. It refuses unrelated staged changes,
  conflicts, missing selections, and unsafe remote divergence. It never uses `git add -A`.
- Fetch failures stop the operation before staging/committing. Diverged or dirty-behind-remote
  work must be synchronized manually. Successful pushes use `HEAD:refs/heads/<configured branch>`.
- If the push succeeds but relay notification fails, the tool reports that partial success.
  Do not blindly repeat the commit. Verify the remote, then coordinate with peers.
- The historical name `cowork_sync_main` is retained for compatibility, but it uses the
  configured branch. All peers should agree on the repository, branch, and remote.

## Upgrade notes

Deploy the relay and update/restart all MCP clients together. Old clients without participant
tokens are rejected; clients without acknowledgement support would repeatedly receive messages.
Refresh dashboards and create a fresh generated room after upgrading.

The old disk cache is no longer used or imported. Existing PostgreSQL room rows remain intact.
No migration changes unrelated tables. Database bootstrap requires table-owner/DDL privileges.

## Verification

```bash
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

The Vercel build intentionally runs only `vite build` (plus `@vercel/node` compiling `api/`), so a
type-only complaint can never take down a deploy. Type checking of `src`, `api`, `server.ts` and the
test suite happens through `npm run typecheck` (`tsconfig.json` + `tsconfig.test.json`) from the repo
root, where `vitest` is installed as a workspace devDependency. Do not add `tsc` back to the relay's
`build` script: when Vercel's Root Directory is `packages/cowork-web-relay`, that package's install has
no `vitest`, so type-checking `test/` fails with TS2307 and exits 2.

Tests **always use isolated memory or a mocked PostgreSQL transport**, even if `DATABASE_URL`
is inherited. They never connect to or clear your live database. PostgreSQL contract tests
verify lock/update/rollback ordering, but do not replace a live Supabase smoke test.
Git safety tests mock Git operations and never commit, pull, or push the working checkout.

### Live smoke test (after deployment)

1. Create a fresh room and join from a browser plus two updated agents with distinct handles.
2. Claim the same file simultaneously; exactly one agent must receive a conflict.
3. Exchange messages and confirm repeated polls do not duplicate delivered messages.
4. Keep a lock for over 90 seconds with heartbeats, then stop that agent and verify expiry.
5. Try reusing an existing handle with a different token; expect 403.
6. Check Supabase for `cowork_rooms`, RLS enabled, and no anon/authenticated access.
7. Confirm no DATABASE_URL/password/token appears in browser assets or logs.

### If the first request returns 503

The relay creates its table on first use, which needs table-owner/DDL rights. If the Supabase
role cannot create objects in `public` (schema-isolation projects), run this once in the
Supabase SQL editor, then retry:

```sql
CREATE TABLE IF NOT EXISTS public.cowork_rooms (
  room_code VARCHAR(64) PRIMARY KEY,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.cowork_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cowork_rooms FROM PUBLIC;
REVOKE ALL ON public.cowork_rooms FROM anon, authenticated;
```

A production 503 also returns a machine-readable `code`/`hint` (`DATABASE_URL_MISSING` or
`STORAGE_UNAVAILABLE` + Postgres/driver code such as `ETIMEDOUT`, `ECONNREFUSED`, `28P01`, `42501`).
Hints never contain hostnames or credentials, so they are safe to show and to paste into a bug report.

`DATABASE_URL_INVALID` also covers an unreplaced `[YOUR-PASSWORD]` placeholder or an empty password.
On any database failure the function logs a private summary (`user`, password **length**, host, port)
so a truncated or stale credential is visible in Vercel logs without the secret ever appearing in a
response. A `_` is harmless in a URL password, and a raw `@` is parsed correctly by this driver
(the last `@` wins), so chase a stale/reset password first; encode `@` as `%40` anyway if you use
`psql` or another tool with the same string.

`DATABASE_URL_INVALID` means the relay refused to parse a connection string that a URL parser
would silently truncate (an unencoded `#`, `?`, `/` or space in the password). Percent-encode
those characters, or reset the database password to letters and digits only - the simplest option.

Other 503 causes are connectivity or credential problems: verify the transaction-pooler host,
port `6543`, `sslmode=verify-full`, and that the deployment environment received `DATABASE_URL`
(a redeploy is required after adding it). Do not disable certificate verification to work around
an error.

### If an agent gets 401/403

`401` means the MCP client is too old to send a participant token; rebuild and reinstall the
bundle (`npm run build`), then restart that harness. `403` means the handle is already bound to a
different token: use a new handle, or restore the original token. Start a fresh generated room
after upgrading.

Do not run destructive outage tests against your live shared database. Use the isolated tests
for rollback, unavailable-storage, and failed Git scenarios.
