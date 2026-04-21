---
name: electric-stack
description: |
  High-level conceptual overview of the Electric SQL + TanStack DB + Durable
  Streams stack. Read this BEFORE any planning or coding — it's the map every
  agent uses to pick the right product for each data-flow problem in the app.
  Contains concepts only — no class names, no imports, no code. For API
  details, see the per-product intent skills referenced in each section.
---

# The Electric Stack — Product Overview

This skill is the **single source of truth** for what each product in the
stack does and when to use it. Every agent — planner, advanced planner,
coder, reviewer, QA — reads this file early so they share the same mental
model of the stack.

It deliberately contains **no code, no class names, no import statements,
and no configuration object shapes**. Those are details that change between
library versions. This file covers *what* each product is for and *when* to
use it; the detailed per-product skills (listed under "Further reading" in
each section) cover *how*.

## Problem → Product map

When you're about to write a plan or a component, start here. Read the left
column, pick the row that matches, use the product in the middle column.

| The problem you're solving | Product | Package |
|---|---|---|
| "What's the current state of entity X, live-synced to the client?" | **Electric SQL shapes** + **TanStack DB** | `@electric-sql/client` + `@tanstack/db` + `@tanstack/react-db` |
| "How do I define my Postgres schema and run migrations?" | **Drizzle ORM** | `drizzle-orm` + `drizzle-zod` + `drizzle-kit` |
| "How did we get to this state? Append-only log, activity feed, audit trail, game moves." | **Durable Streams client** (requires a Durable Streams service — `services create streams` via Electric CLI) | `@durable-streams/client` |
| "AI chat with persistent, resumable, multi-client-synced conversations." | **Durable Transport for AI SDKs** (requires a Durable Streams service — `services create streams` via Electric CLI) | `@durable-streams/tanstack-ai-transport` (TanStack AI) or `@durable-streams/aisdk-transport` (Vercel AI SDK) |
| "Ephemeral reactive shared state — presence, cursors, typing indicators, 'who's online'." | **StreamDB** (requires a Durable Streams service — `services create streams` via Electric CLI) | `@durable-streams/state` |
| "Multiple users editing the same rich-text document / whiteboard / code simultaneously, with automatic conflict resolution." | **Y-Durable-Streams (Yjs over Durable Streams)** | `@durable-streams/y-durable-streams` |
| "I need to provision an Electric Cloud database or service on demand." | **Electric CLI** | `@electric-sql/cli` (via `npx`) |
| "I need a full-stack React framework with file-based routes and server handlers." | **TanStack Start** | `@tanstack/react-start` + `@tanstack/start-client-core` |
| "I need pre-built accessible UI components styled with the Electric design system." | **shadcn/ui** + **Tailwind CSS** | `@/components/ui/*` + `tailwindcss` |

If no row matches your problem, you probably don't need Electric at all for
that piece — use plain React state, localStorage, or a regular HTTP request.

## The products

### Electric SQL — `@electric-sql/client`

**What it is:** A real-time sync engine that streams Postgres data to
clients as "shapes". A shape is a filtered SQL query (a table + optional
`WHERE` clause + columns) that the client subscribes to; the server
keeps the client in sync incrementally via long-polling or SSE.

**Use for:**
- Any entity users read that multiple clients should see at the same time
- Entities where multiple users CRUD the same records (todos, documents,
  messages, kanban cards, etc.)
- Anything where you'd otherwise poll the server for "give me the latest X"

**Don't use for:**
- Append-only event logs (use Durable Streams instead)
- Ephemeral state that doesn't need to outlive a session (use StreamDB)
- Concurrent rich-text / whiteboard editing (use Y-Durable-Streams)
- Large blobs (images, video, files)

**Mental model:** Your database is the source of truth. Clients subscribe
to "shapes" (filtered views) and receive live updates as rows change.
It's a one-way pipe from server to client — writes go through your own
API routes (see TanStack Start below), not directly to Electric.

**Composition:** Electric shapes are low-level. In practice you wrap them
in **TanStack DB collections** (see next section) for the client-side
reactive query interface.

**Further reading (API details, when you need them):**
- `node_modules/@electric-sql/client/skills/electric-new-feature/SKILL.md`
- `node_modules/@electric-sql/client/skills/electric-shapes/SKILL.md`
- `node_modules/@electric-sql/client/skills/electric-schema-shapes/SKILL.md`
- `node_modules/@electric-sql/client/skills/electric-proxy-auth/SKILL.md`
- `node_modules/@electric-sql/client/skills/electric-orm/SKILL.md`

---

### TanStack DB — `@tanstack/db` + `@tanstack/react-db`

**What it is:** The client-side reactive database that sits on top of
Electric shapes (or other data sources). It materializes a shape into a
local collection, lets you run typed queries against it with live-query
hooks, and supports optimistic mutations with server-side reconciliation.

**Use for:**
- Every entity in your app that comes from an Electric shape
- Client-side filtering, joining, and live queries on synced data
- Optimistic UI updates (insert/update/delete on the client, reconciled
  when the server confirms)

**Don't use for:**
- Server-side data access (use Drizzle directly in server routes)
- Data that doesn't come from Electric (use regular React state or a
  different data source)
- Queries that need to run on the server (use TanStack Start server
  functions for those)

**Mental model:** A client-side reactive database. You define a
"collection" (which points at an Electric shape via a proxy route), and
then use a live-query hook in your React components to read from it.
When the shape updates, your queries automatically re-run and your
components re-render. Mutations work optimistically: you call insert /
update / delete locally, the framework queues a transaction, and the
server reconciles the result back via the shape sync.

**⚠️ Important**: the live-query hook **cannot run server-side during
SSR** — it needs a live subscription that only exists on the client.
Any route that calls it needs `ssr: false` on the route options OR
needs to be wrapped in `<ClientOnly>`. See the execution-model detail
skill and the create-app SSR handling section.

**⚠️ Dates are a dual-path problem (common bug):** Data enters a
TanStack DB + Electric collection through two independent paths that
apply different transforms:

- **Sync path** (Electric → collection): uses `shapeOptions.parser`.
  The collection's `schema` is **NOT** applied here.
- **Mutation path** (`collection.insert/update`): uses the collection's
  `schema`. The parser is **NOT** involved.

For `timestamptz` / `timestamp` columns you need BOTH: `z.coerce.date()`
(or equivalent) in the schema, AND `parser: { timestamptz: (v) => new
Date(v) }` in `shapeOptions`. Without the parser, sync-delivered
timestamps arrive as ISO strings and any `.getTime()` /
`toLocaleDateString()` / `formatDistanceToNow()` call in the UI
crashes with `date.getTime is not a function`. This is listed as a
HIGH-severity common mistake in the `electric-new-feature` intent
skill — see it for the canonical fix.

**Further reading:**
- `node_modules/@tanstack/db/skills/db-core/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/collection-setup/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/live-queries/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/mutations-optimistic/SKILL.md`

---

### Drizzle ORM — `drizzle-orm` + `drizzle-zod` + `drizzle-kit`

**What it is:** A TypeScript-first ORM for Postgres. You define schemas
with strongly-typed column definitions; `drizzle-kit` generates
migrations from schema diffs; `drizzle-zod` derives Zod validators
from the schema so server-side code can validate inserts/updates.

**Use for:**
- Defining the Postgres schema for your app
- Generating and running migrations
- Deriving validation schemas that stay in sync with the table columns
- Server-side queries and mutations (in TanStack Start server routes)

**Don't use for:**
- Client-side queries — use TanStack DB for those
- Runtime-only data that doesn't need persistence

**Mental model:** Schema-first. You define pgTables in one file, the
Zod schemas derive from them automatically, and migrations generate
from the schema diff. Everything else in the stack (Electric shapes,
TanStack DB collections, server routes) takes its type information
from the Drizzle schema.

**Further reading:** There's no bundled intent skill — see the project's
own PLAN.md data model conventions + the Drizzle docs website.

---

### Durable Streams client — `@durable-streams/client`

**What it is:** An append-only event stream hosted in the cloud. Every
event has a monotonically increasing offset; clients can subscribe
from any offset and receive events in order. Durable (persistent
across server restarts), scalable (horizontally shardable), and works
over plain HTTP (long-polling or SSE — no WebSocket infrastructure).

**Use for:**
- Activity feeds: "what happened in this channel/document/project"
- Chat message history (ordered, append-only)
- Audit logs: server emits an event for every state change
- Game move histories (turn-based games especially)
- Analytics / telemetry events

**Don't use for:**
- "Current state of entity X" — that's Electric shapes
- Data that needs to be queried (filter, join) — events are read in
  order, not queried
- Things you want to mutate/delete — streams are append-only

**Mental model:** A Kafka-like event log. Events are immutable, ordered
by offset, and stored durably. Clients tail the stream from an offset
and process events in order. Good fit for "history of X" or "log of Y".

**CRITICAL — stream creation order:** A stream path MUST be created
(via `DurableStream.create()`) before any client can subscribe to it
with `stream()`. If the path doesn't exist, the server returns **404**.
Clients typically subscribe on page load, so the proxy route that
forwards reads MUST call `ensureStream()` to auto-create the stream
before forwarding the GET. `DurableStream.create()` is idempotent —
safe to call on every request. See `create-app/references/electric-cloud-proxy.md`
for the concrete `ensureStream()` pattern.

**Credential note:** Durable Streams are NOT auto-provisioned by the
orchestrator. Before the first stream operation, the coder must run
the Electric CLI flow to either provision a stream or accept
user-supplied credentials. See `skills/room-messaging/SKILL.md`
"Electric CLI — Provisioning External Services".

**Further reading:**
- `node_modules/@durable-streams/client/README.md`

---

### Durable Transport for AI SDKs — `@durable-streams/tanstack-ai-transport` / `@durable-streams/aisdk-transport`

**What it is:** Drop-in connection adapters that plug into TanStack AI
(`useChat()` from `@tanstack/ai-react`) or the Vercel AI SDK
(`useChat()` from `@ai-sdk/react`). They write AI responses into a
durable stream, making chat sessions persistent, resumable mid-generation,
and synced across multiple browser tabs/clients.

**Use for:**
- AI chat apps where conversations must survive page refreshes
- Multi-client chat: two tabs see the same conversation live
- SSR hydration of chat history (server-side loader materializes messages)
- Resumable generation: if the user refreshes mid-stream, the client
  reconnects and picks up where it left off

**Don't use for:**
- Non-AI chat (user-to-user messaging) — use Durable Streams client directly
- AI that doesn't use TanStack AI or the Vercel AI SDK
- One-shot completions that don't need persistence

**Mental model:** The transport wraps every AI response as a durable
stream. The client subscribes to the stream for live updates; the server
appends user messages and model chunks. The stream is the source of truth —
reload the page and the full transcript materializes from it.

**Which package?**
- `@durable-streams/tanstack-ai-transport` — for `@tanstack/ai-react`
  (`durableStreamConnection()`, `toDurableChatSessionResponse()`)
- `@durable-streams/aisdk-transport` — for `@ai-sdk/react`
  (`createDurableChatTransport()`, `toDurableStreamResponse()`)

**Credential note:** Same as Durable Streams client — needs the Electric
CLI provisioning flow before first use. The server-side handler writes
to the stream and must never expose write credentials to the client.

**Further reading:**
- `node_modules/@durable-streams/tanstack-ai-transport/skills/tanstack-ai/SKILL.md`
- `node_modules/@durable-streams/aisdk-transport/skills/vercel-ai-sdk/SKILL.md`

---

### StreamDB — `@durable-streams/state`

**What it is:** A reactive key-value store materialized on top of a
Durable Stream. You define a state schema (a set of collections, each
keyed by a primary key), the server persists the stream of changes,
and clients materialize the current state into a local in-memory map
that stays in sync.

**Use for:**
- Presence: "who's online in this document right now"
- Cursors: "where is each user's text cursor"
- Typing indicators: "who's typing, in which field"
- Ephemeral shared state that multiple clients read + write
- Any state where you want CRUD-like operations but don't need Postgres

**Don't use for:**
- Primary domain entities users care about long-term (use Electric + TanStack DB)
- Append-only logs (use the raw Durable Streams client)
- Large state (thousands+ of entries) — StreamDB replays the full stream
  to materialize, so it's best for small reactive state

**Mental model:** Think of it as a small reactive in-memory database
backed by an event stream. Every write appends an event; every client
subscribes and materializes the current state. You get last-write-wins
semantics for free. We actually use StreamDB ourselves inside the
orchestrator (for `AgentStore` and `SecretStore`) — that's the canonical
example of the pattern.

**Credential note:** Same as Durable Streams client — needs the Electric
CLI provisioning flow before first use.

**Further reading:**
- `node_modules/@durable-streams/state/skills/state-schema/SKILL.md`
- `node_modules/@durable-streams/state/skills/stream-db/SKILL.md`

---

### Y-Durable-Streams — `@durable-streams/y-durable-streams`

**What it is:** A Yjs CRDT provider that syncs a Y.Doc over a Durable
Stream. Yjs is an industry-standard CRDT library for concurrent
editing; this package connects it to the Durable Streams transport so
you don't need to run a separate WebSocket server for Yjs.

**Use for:**
- Collaborative rich-text editing (TipTap, ProseMirror, Lexical editors
  + the Yjs collaboration extension)
- Shared whiteboards / drawing surfaces with concurrent cursors
- Concurrent code editing (Monaco + y-monaco)
- Any CRDT-based concurrent document problem

**Don't use for:**
- CRUD apps where users edit different records (use Electric + TanStack DB)
- Append-only event streams (use Durable Streams client directly)
- Single-user apps (no conflict resolution needed)

**Mental model:** The provider is a bridge between a local Y.Doc and a
Durable Stream. Local changes are sent upstream; remote changes are
applied locally. Conflict resolution happens inside Yjs using CRDT
algorithms — you don't need to write any merge logic yourself. Add
Yjs awareness for presence (cursors, user names, selections).

**DO NOT use `@electric-sql/y-electric` or plain `y-electric`** — those
are different packages that don't fit our stack.

For API details, TipTap integration patterns, and common pitfalls,
read the intent skills bundled with the package — they're listed in
`AGENTS.md` and discoverable via `npx @tanstack/intent list`. Key
skills: `yjs-editors` (TipTap/editor setup), `yjs-sync` (provider
API), `yjs-getting-started` (quick start), `yjs-server` (proxy).

**Proxy note:** The client should NOT connect directly to Electric
Cloud — that would leak the service secret. Use a server-side proxy
route that injects the `Authorization: Bearer <secret>` header. See
the canonical Yjs proxy template in `skills/create-app/SKILL.md`
"Pattern: Yjs service proxy" — pay attention to the block-list header
forwarding rule (don't strip `stream-next-offset`; do strip
`content-encoding`).

**Further reading:**
- `node_modules/@durable-streams/y-durable-streams/skills/yjs-sync/SKILL.md`

---

### Electric CLI — `@electric-sql/cli`

**What it is:** A command-line tool for provisioning Electric Cloud
resources — databases, sources, Yjs services, Durable Streams services.
Used dynamically during a session when the app needs a cloud resource
the orchestrator didn't auto-provision at session start.

**Use for:**
- Creating a new free claimable database mid-session (for BYO cloud mode)
- Creating a Yjs service on demand
- Creating a Durable Streams service on demand
- Listing existing services in your workspace

**Don't use for:**
- Auto-provisioning at session start — the orchestrator's infra gate
  handles that (for local docker-compose or the free-trial auto-claim)
- Storing long-lived credentials — store them in the SecretStore via
  `set_secret`, not in the shell environment

**Mental model:** An escape hatch for when you need cloud resources that
weren't set up automatically. The coder (not the planner) runs the CLI
during implementation, stores the returned credentials via `set_secret`,
and the orchestrator projects them into every container's `.env`.

**Full flow is documented in `skills/room-messaging/SKILL.md`** —
"Electric CLI — Provisioning External Services". That section covers:
- When to trigger the flow
- The two paths (paste existing credentials vs provision new)
- How to keep the Claude Code turn alive while the user runs `npx` in
  their own terminal
- Which secret keys to use
- Anti-patterns to avoid

---

### TanStack Start — `@tanstack/react-start` + `@tanstack/start-client-core`

**What it is:** A full-stack React framework built on TanStack Router.
File-based routes with co-located server handlers. Similar to Next.js
in shape but more router-first and with a simpler SSR model.

**Use for:**
- Page routes (file-based under `src/routes/`)
- API endpoints (as `server.handlers` inside route files)
- Electric shape proxy routes
- Mutation routes
- Server-side data fetching in route loaders

**Mental model:** Every `src/routes/<path>.tsx` file defines a route.
Routes render on the server by default and hydrate on the client.
API routes are just regular file routes that export a
`server.handlers` object. Server functions (via `createServerFn`) let
you call server-only code from client components safely.

**⚠️ SSR is isomorphic by default.** Any code in a route component runs
on BOTH server and client unless you explicitly opt out. Hooks that
depend on browser APIs (`useLiveQuery`, `window`, `localStorage`,
`EventSource`, WebSocket, Yjs providers) must be gated with:
1. `ssr: false` on the route options (preferred for leaf routes), OR
2. `<ClientOnly>` wrapper around the consumer (required in `__root.tsx`)

Forgetting this is the single most common bug class in TanStack Start
apps. The create-app skill has a dedicated SSR Handling section in
Phase 4 — follow it.

**Further reading:**
- `node_modules/@tanstack/start-client-core/skills/start-core/SKILL.md`
- `node_modules/@tanstack/start-client-core/skills/start-core/execution-model/SKILL.md`
- `node_modules/@tanstack/start-client-core/skills/start-core/server-routes/SKILL.md`
- `node_modules/@tanstack/start-client-core/skills/start-core/server-functions/SKILL.md`

---

### shadcn/ui + Tailwind CSS

**What it is:** A pre-installed set of accessible, unstyled-by-default
React components (~21 in the scaffold) + Tailwind CSS utility classes.
Components live in `src/components/ui/` and are directly editable (not
imported from a library — they're vendored into the project).

**Use for:**
- Every UI component the coder writes (buttons, inputs, dialogs, toasts)
- The Electric brand design system (applied via a CSS variable override
  in `src/styles.css`)
- Icons via `lucide-react`

**Don't use:** `@radix-ui/themes`, Material UI, Chakra, or any other UI
library. The scaffold is shadcn/ui-only.

**Mental model:** Copy-paste components that you own. No dependency
upgrades break them, because they're vendored. Style with Tailwind
classes. Use `cn()` from `@/lib/utils` for conditional classes.

**Further reading:** `.claude/skills/design-styles/electric/DESIGN.md`
(brand colors, typography, spacing) + `.claude/skills/ui-design/`
(shadcn patterns).

---

## Stack composition patterns

How the products actually combine for common app types.

### Pattern: Standard CRUD app (todos, notes, kanban, CRM)

- **Schema**: Drizzle
- **Sync**: Electric shapes for every domain entity
- **Client**: TanStack DB collections + live queries
- **Mutations**: Optimistic client-side + server-side reconciliation
  via TanStack Start API routes
- **No** Durable Streams. No Yjs. No StreamDB.

### Pattern: Real-time collaboration — multiplayer games, shared lists

- **Schema**: Drizzle
- **Sync**: Electric shapes for the shared game state
- **Events**: Durable Streams for the move history / activity log
- **Presence**: StreamDB for "who's in the game right now"
- **No** Yjs (not a CRDT problem)

### Pattern: Collaborative document editing — rich text, whiteboards, code

- **Metadata** (document list, titles, ownership): Electric shapes +
  TanStack DB
- **Document content** (concurrent edits): Y-Durable-Streams (`YjsProvider`)
- **Presence** (cursors, selections, who's viewing): Yjs `Awareness`
  (passed into `YjsProvider`), NOT StreamDB
- **Activity log** (revision history, comments timeline): Durable
  Streams client (if the app tracks revisions)

### Pattern: Event-heavy app — analytics dashboard, audit log, activity feed

- **Events**: Durable Streams client as the primary data source
- **Projection**: Optionally materialize events into Postgres via a
  server-side worker, then serve via Electric shapes for filtered views
- **UI**: Read directly from stream subscriptions or materialize with
  StreamDB

### Pattern: Content/read-heavy app — blog, docs, wiki

- **Schema**: Drizzle
- **Sync**: Electric shapes for the published content (reader side)
- **Writes**: Standard mutation routes — writers don't need real-time
  sync because they're the only ones editing at a time
- **Storage**: Postgres via Drizzle

### Pattern: Chat / messaging

- **Messages**: Durable Streams client (append-only, ordered, durable)
- **Rooms / channels** (current state of each): Electric shape
- **Presence**: StreamDB (who's typing, online status)
- **Attachments**: Drizzle/Postgres + object storage (not in this stack)

### Pattern: Offline-first PWA

- **Sync**: Electric shapes (TanStack DB persists locally)
- **Conflict resolution**: Optimistic mutations with server-side
  reconciliation; falls back gracefully when online
- **Storage**: IndexedDB via TanStack DB persistence

---

## What this skill does NOT cover

Intentional omissions. For each, see the referenced file.

- **Specific class names, imports, method signatures, option shapes** →
  per-product intent skills at `node_modules/<pkg>/skills/*/SKILL.md`
- **Electric Cloud authentication flow** (how to provision resources
  via CLI and get credentials into the session) →
  `skills/room-messaging/SKILL.md` "Electric CLI" section
- **Server-side proxy patterns** (Yjs, shapes, with block-list header
  forwarding rules) → `skills/create-app/SKILL.md` Phase 4 "Pattern:
  Yjs service proxy" + `src/lib/electric-proxy.ts` in the scaffold
- **SSR rules for TanStack Start** (when to use `ssr: false` vs
  `<ClientOnly>`) → `skills/create-app/SKILL.md` Phase 4 "SSR handling"
- **Drizzle schema conventions** (UUID defaults, timestamp columns,
  foreign key cascades) → `skills/create-app/SKILL.md` Phase 2

---

## How to use this skill

**Planner / advanced planner**: Read this file BEFORE writing PLAN.md
or DESIGN.md. It's the map that tells you which product solves each
problem in the app. Then pick products and write package-level tasks
in the plan — do NOT write specific class names or API shapes (the
coder fills those in from the detail skills).

**Coder**: Read this file EARLY in Phase 0. It gives you the
conceptual map before you dive into Phase 1.5 implementation-detail
skills. When you hit Phase 1.5, you'll read only the detail skills
that are relevant to the packages this specific app uses (progressive
disclosure — you don't read Yjs details if the app doesn't have Yjs).

**Reviewer**: Read this file when reviewing a PR so you understand
which product was chosen for each data-flow decision. Flag any plan
or code that uses the wrong product for the problem (e.g. Durable
Streams for CRUD entities, Electric shapes for event logs).

**QA**: This file is optional for QA — your job is to test the
user-facing behavior, not evaluate stack decisions. Read only if you
need to understand why certain data flows the way it does.
