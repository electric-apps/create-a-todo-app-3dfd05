# README template

Copy this entire file to `README.md` at your repo root and replace every `<angle-bracket placeholder>` with the real value from CLAUDE.md / PLAN.md. Then prune sections that don't apply to THIS app — see the pruning checklist at the end.

---

# <Project Name>

<One-sentence description from the original user prompt>

Generated with [one-shot-electric-app](https://github.com/anthropics/one-shot-electric-app) — an Electric SQL + TanStack DB + shadcn/ui scaffold.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Docker (for local Postgres + Electric)

## Setup

```bash
pnpm install
```

### Environment variables

Copy `.env.example` to `.env` and fill in the values. The scaffold expects:

| Variable | Purpose | How to get it |
|---|---|---|
| `DATABASE_URL` | Postgres connection | Auto-provisioned by `docker compose up` (local) or from your Electric Cloud claim |
| `ELECTRIC_URL` | Electric shape sync endpoint | `http://localhost:3000` (local) or `https://api.electric-sql.cloud` |
| `ELECTRIC_SOURCE_ID` | Electric Cloud source (cloud mode only) | From the Cloud claim URL or `npx @electric-sql/cli` |
| `ELECTRIC_SECRET` | Electric Cloud auth (cloud mode only) | Same source as above |

<!-- Include this section ONLY if the app uses any @durable-streams/* package -->
<!-- Durable Streams section: adds DURABLE_STREAMS_URL / DURABLE_STREAMS_SECRET -->

### Getting Durable Streams credentials (only if the app uses Durable Streams)

If this app depends on `@durable-streams/client`, `@durable-streams/state`, or `@durable-streams/y-durable-streams`, you need to provision a stream service and get a URL + secret:

```bash
# Log in (opens a browser)
npx @electric-sql/cli auth

# Explore the CLI to find the stream-provisioning command
npx @electric-sql/cli --help
```

Add the resulting URL and secret to your `.env` as `DURABLE_STREAMS_URL` and `DURABLE_STREAMS_SECRET` (or whatever names the CLI returns — match them in your app code).

## Running

```bash
# Start local infra (Postgres + Electric)
docker compose up -d

# Run migrations
pnpm drizzle-kit migrate

# Start the dev server
pnpm dev
```

App runs at `http://localhost:5174`.

> **Inside the agent sandbox**, `pnpm dev:start` launches Vite behind a Caddy reverse proxy with HTTP/2 multiplexing (avoids the browser's ~6-connection-per-origin SSE cap). Outside the sandbox, `pnpm dev` runs Vite directly.
>
> **Preview URLs** (from the orchestrator output):
> - **HTTPS** `https://localhost:<preview-port>` — primary, with HTTP/2 multiplexing
> - **HTTP** `http://localhost:<http-port>` — fallback if HTTPS cert isn't trusted yet
>
> **HTTPS setup (one-time):** from the Electric Studio repo root run `pnpm trust-cert` and restart your browser. This installs the Caddy CA into your macOS system keychain — after that every preview link loads with a green lock.

## Architecture

- **Sync**: Electric SQL shapes → TanStack DB collections → `useLiveQuery`
- **Mutations**: Optimistic via `collection.insert/update/delete`, reconciled through API routes
- **Forms / UI**: shadcn/ui + Tailwind CSS + lucide-react
- **Validation**: zod/v4

See [`PLAN.md`](./PLAN.md) for the full implementation plan. For apps built with the advanced planner, see [`DESIGN.md`](./DESIGN.md) for architectural decisions and trade-offs.

## Tests

```bash
pnpm test          # unit + integration tests
pnpm build         # type check + production build
pnpm lint          # ESLint
```

## Deploying

The scaffold is dev-oriented. For production deployment patterns, see the [Electric SQL docs](https://electric-sql.com/docs).

---

## Pruning checklist — do this before committing

The README must describe the app **as built**, not the template. Before committing, do a quick audit and **remove anything that doesn't apply**:

1. **Inspect `package.json`** to see which optional packages are actually installed:
   ```bash
   cat package.json | grep -E '"@durable-streams/'
   ```
2. **Inspect the code** for what env vars are actually read:
   ```bash
   grep -r "process.env\." src/ | grep -oE 'process\.env\.[A-Z_]+' | sort -u
   ```
3. **Prune the env-var table**:
   - If the app runs in local mode only (no Electric Cloud provisioning), drop the `ELECTRIC_SOURCE_ID` and `ELECTRIC_SECRET` rows.
   - If the app uses additional env vars (LLM API keys, auth providers, payment keys, etc.), add rows for them — match the names to what `process.env.*` reads expect.
4. **Prune the Durable Streams section**:
   - If NO `@durable-streams/*` package appears in `package.json`, DELETE the entire "Getting Durable Streams credentials" subsection AND the HTML comments.
   - If Durable Streams IS used, replace the placeholder env var names (`DURABLE_STREAMS_URL`, `DURABLE_STREAMS_SECRET`) with the actual names your code reads (e.g. `ELECTRIC_DS_SERVICE_ID`, `ELECTRIC_DS_SECRET`, `DS_URL`, etc. — whatever you provisioned via `set_secret` and reference in server code).
5. **Prune the Architecture bullet list**:
   - If the app does NOT use Durable Streams, do not mention them.
   - If the app DOES use Yjs (`@durable-streams/y-durable-streams`), add a bullet like `**Collaborative editing**: Yjs CRDTs synced via @durable-streams/y-durable-streams through a server-side proxy`.
   - If the app uses StreamDB for presence, add a bullet for it.
   - If the app integrates an LLM, a payment provider, a file storage service, etc., add a bullet naming the integration.
6. **Prune the DESIGN.md reference**: If `DESIGN.md` does not exist in the repo (plain planner, not advanced planner), drop the sentence that mentions it.
7. **Tests section**: If `pnpm lint` is not actually wired up in `package.json`, remove that line. Only list commands that work.

**Rule of thumb**: If a human reading the README would run into a `process.env.FOO is undefined` error or a "command not found" because the README told them about something that isn't actually in this app, you did it wrong. The README must be honest about what this specific app has.
