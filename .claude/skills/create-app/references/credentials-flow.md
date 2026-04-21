# Phase 0 — Database & Source credentials flow

**Read this when `list_secrets()` shows that `DATABASE_URL` is missing.** If `DATABASE_URL` is already set, skip this entire file and proceed to Phase 1.

## Why this matters

If you skip credential provisioning and just start writing schema code, the first `pnpm drizzle-kit migrate` will fail with a connection error because `DATABASE_URL` is undefined. Worse, the server-side Electric shape proxy (`src/lib/electric-proxy.ts`) will return 500 "Yjs/shape service not configured" the first time the browser loads the app — because `process.env.ELECTRIC_SOURCE_ID` is empty. Both issues are easy to diagnose but annoying to chase. Better to ask for credentials upfront.

## Sanity check

```bash
cat .env 2>/dev/null | grep -E "^(DATABASE_URL|ELECTRIC_)" || echo "(no .env or no Electric vars)"
```

If `DATABASE_URL` shows up here, do NOT run the flow below — secrets already exist. Proceed to Phase 1.

## The flow

The user has two paths and you must let them pick.

### Step 1 — open an `AskUserQuestion` gate with two options

```json
{
  "questions": [{
    "header": "Electric Cloud Credentials",
    "question": "This app needs a Postgres database and an Electric Cloud source, but none are provisioned yet in the session. How would you like to set them up?",
    "options": [
      {
        "label": "I have existing credentials — I'll paste them",
        "description": "You already have a Postgres database and an Electric Cloud source configured. You'll paste DATABASE_URL, ELECTRIC_SOURCE_ID, and ELECTRIC_SECRET in the next step."
      },
      {
        "label": "Provision a free claimable database",
        "description": "I'll run `npx @electric-sql/cli` to create a new free 72h claimable source on Electric Cloud. Requires an Electric CLI auth token (I'll use the one already in the session if available, or ask you for one)."
      }
    ]
  }]
}
```

### Step 2a — if the user picks "I have existing credentials"

Open a follow-up `AskUserQuestion` with three freeform fields. This keeps the turn alive while the user looks up their values:

```json
{
  "questions": [
    {
      "header": "DATABASE_URL",
      "question": "Paste your Postgres connection string. Format: postgresql://user:password@host:port/dbname"
    },
    {
      "header": "ELECTRIC_SOURCE_ID",
      "question": "Paste your Electric Cloud source ID (e.g. src_abc123)"
    },
    {
      "header": "ELECTRIC_SECRET",
      "question": "Paste your Electric Cloud source secret (e.g. eyJ... — the JWT from `npx @electric-sql/cli services get-secret <id>`)"
    }
  ]
}
```

Once the user submits, store each value via `set_secret`:

```
set_secret(key: "DATABASE_URL", value: "<pasted>")
set_secret(key: "ELECTRIC_SOURCE_ID", value: "<pasted>")
set_secret(key: "ELECTRIC_SECRET", value: "<pasted>")
```

These propagate to newly-spawned containers via the SecretStore, but your **current** container's `.env` was written at spawn time and won't auto-update. You MUST write the new secrets to `.env` yourself:

```bash
# Append the new secrets to .env so the dev server can read them
echo "DATABASE_URL=<pasted>" >> .env
echo "ELECTRIC_SOURCE_ID=<pasted>" >> .env
echo "ELECTRIC_SECRET=<pasted>" >> .env
```

If the dev server is already running, restart it so it picks up the new `.env`:
```bash
pnpm dev:restart
```

Then run `pnpm drizzle-kit migrate` to verify the database is reachable. If the migration fails with a connection error, open another gate with the error text and ask the user to verify their credentials.

### Step 2b — if the user picks "Provision a free claimable database"

Follow the full Electric CLI flow documented in the `room-messaging` skill (section "Electric CLI — Provisioning External Services"). In summary:

1. Call `list_secrets()` — if `ELECTRIC_CLI_TOKEN` is already set, skip to step 3
2. Open a freeform `AskUserQuestion` gate asking the user to paste a token (the question body should instruct them to run `npx @electric-sql/cli auth` in their own terminal and paste the resulting token back). Do NOT try to run `npx @electric-sql/cli auth` yourself — it opens a browser and needs interactive login.
3. Store the token: `set_secret(key: "ELECTRIC_CLI_TOKEN", value: "<token>")`
4. Run `npx @electric-sql/cli --help` and `npx @electric-sql/cli services --help` to discover the exact command names — do NOT guess. The command set may evolve between releases.
5. Use the CLI to create a new source (typically `services create` or similar — confirm with `--help`). Parse the output to extract `source_id`, `secret`, and the `connection_uri` (the Postgres DATABASE_URL).
6. Store all three via `set_secret` AND write them to `.env`:
   ```
   set_secret(key: "DATABASE_URL", value: "<connection_uri from CLI>")
   set_secret(key: "ELECTRIC_SOURCE_ID", value: "<source_id from CLI>")
   set_secret(key: "ELECTRIC_SECRET", value: "<secret from CLI>")
   ```
   ```bash
   echo "DATABASE_URL=<connection_uri>" >> .env
   echo "ELECTRIC_SOURCE_ID=<source_id>" >> .env
   echo "ELECTRIC_SECRET=<secret>" >> .env
   ```
7. If the dev server is running, restart it: `pnpm dev:restart`
8. Run `pnpm drizzle-kit migrate` to verify the database is reachable.

### Step 3 — confirm + continue

Once credentials are stored and `pnpm drizzle-kit migrate` succeeds, broadcast a status update:

```
broadcast(body: "DB + source credentials acquired via <existing|CLI-provisioned>. Proceeding to schema and API routes.", metadata: { type: "status_update" })
```

Then return to Phase 1 of `create-app/SKILL.md` and continue normally.

### Using Durable Streams credentials in app code

When building proxy routes that talk to Durable Streams, **always build the stream URL from `ELECTRIC_URL + DS_SERVICE_ID`**. Do NOT use `process.env.DS_URL` directly — in some deployments it's set to the root API URL (`https://api.electric-sql.cloud`) rather than the full per-service stream prefix, and your PUT/POST will 404 against a non-existent route.

```typescript
// src/lib/ds-stream.ts
const dsServiceId = process.env.DS_SERVICE_ID || process.env.ELECTRIC_DS_SERVICE_ID
const dsSecret = process.env.DS_SECRET || process.env.ELECTRIC_DS_SECRET
const electricUrl = process.env.ELECTRIC_URL || "https://api.electric-sql.cloud"

// DS_URL may be set to the ROOT API URL (not a stream URL) depending on
// how the env was populated. Only trust it if it already contains
// `/v1/stream/<id>`; otherwise compose from ELECTRIC_URL + DS_SERVICE_ID.
const dsUrl = process.env.DS_URL
const dsBaseUrl =
  dsUrl && dsUrl.includes("/v1/stream/")
    ? dsUrl.replace(/\/+$/, "")
    : dsServiceId
      ? `${electricUrl.replace(/\/+$/, "")}/v1/stream/${dsServiceId}`
      : undefined

if (!dsBaseUrl) {
  throw new Error("Cannot resolve DS base URL: set DS_SERVICE_ID (or a full DS_URL)")
}

export function buildStreamUrl(streamPath: string): string {
  return new URL(streamPath, `${dsBaseUrl}/`).toString()
}

export function dsAuthHeaders(): Record<string, string> {
  return dsSecret ? { Authorization: `Bearer ${dsSecret}` } : {}
}
```

**Why this matters**: the orchestrator may pass `DS_URL` via `docker run -e` as the root URL (used by the MCP server), and that takes precedence over the `.env` file's `DS_URL` in `process.env` on the server side. Building from `DS_SERVICE_ID` deterministically avoids the conflict.
