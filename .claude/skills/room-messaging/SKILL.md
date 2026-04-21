---
name: room-messaging
description: Protocol for multi-agent communication and git operations via MCP session tools
---

# Session Tools Protocol

You communicate with other agents and humans, and manage git operations, via MCP tools provided by the `session` server.

## Getting Started

1. **Join the room** on startup:
   ```
   join(capabilities: ["code", "review"])
   ```

2. **Check who's in the room:**
   ```
   list_participants()
   ```

## Sending Messages

### Broadcast (to everyone)
Use for announcements, status updates, review requests:
```
broadcast(body: "Code is ready for review", metadata: { type: "review_request", repo: "...", branch: "...", summary: "..." })
```

### Direct message (to one participant)
Use for focused 1:1 work:
```
send_message(to: "reviewer", body: "Can you check the schema changes?")
```

## Receiving Messages

**Do NOT poll `read_messages()` in a loop.** The orchestrator delivers messages to you as new conversation turns via stdin. When a relevant event arrives (review_request, review_feedback, approved, plan_ready, etc.), the orchestrator calls `iterate()` on your bridge and you receive it as the next message in your conversation.

`read_messages()` still exists for one-shot checks (e.g., reading history on startup), but it should NEVER be called in a polling loop. If you find yourself calling it repeatedly waiting for a response — stop and let your turn end instead.

## Acknowledging Messages

After you process a message, acknowledge it so the sender knows you received it:
```
ack(message_id: "uuid-from-the-message")
```

## Structured Message Types

Use `metadata.type` to convey message intent:

| Type | When | Example metadata |
|------|------|-----------------|
| `review_request` | Code ready for review | `{ type: "review_request", repo: "...", branch: "...", summary: "...", preview_url: "..." }` |
| `review_feedback` | Review found issues | `{ type: "review_feedback", issues: [{ severity: "critical", file: "src/foo.ts:42", description: "..." }] }` |
| `approved` | Review passed | `{ type: "approved", summary: "All checks pass" }` |
| `status_update` | Progress update | `{ type: "status_update", status: "building", detail: "Running migrations..." }` |

## Git Tools

The session MCP server also provides git operations. **Use these instead of raw git commands** — they handle errors and ensure steps aren't missed.

### commit_and_push
Stages all changes, commits, and pushes in one atomic operation:
```
commit_and_push(message: "feat: add todo schema and migrations")
```
This runs `git add -A && git commit && git push origin HEAD`. Use this instead of running git commands manually.

### get_branch
Returns your current branch name:
```
get_branch()
```

### pull_latest
Fetches and pulls latest changes from origin:
```
pull_latest()
```

### get_repo_url
Returns the GitHub repository URL:
```
get_repo_url()
```

## Signal Types

Some broadcasts trigger system actions:

| Signal | metadata.type | Sender → Target | Purpose |
|--------|--------------|-----------------|---------|
| Plan ready | `plan_ready` | planner → (broadcast) | Spawns the coder agent. Include `branch` in metadata. |
| Plan updated | `plan_updated` | planner → (broadcast) | Nudges the coder to pull and apply new tasks. |
| QA request | `qa_request` | coder → qa (direct) | Asks the qa agent to run UI/behavioral tests. Sent BEFORE `review_request` when qa is in the room. Body should include the branch, a short summary of what was built, and any "focus areas" to pay attention to (free text). |
| QA feedback | `qa_feedback` | qa → coder (direct) | QA reports failing test cases. Coder applies fixes and re-sends `qa_request`. Analogous to `review_feedback` but for behavioral bugs. Reviewer + ui-designer ignore this. |
| QA approved | `qa_approved` | qa → coder (direct) | All QA tests pass. Coder proceeds to send `review_request` for code review. Reviewer + ui-designer ignore this — they only react to `review_request`. |
| Review request | `review_request` | coder → (broadcast) | Asks reviewer + ui-designer to review the code. When qa is in the room, the coder only sends this AFTER `qa_approved`. |
| Review feedback | `review_feedback` | reviewer/ui-designer → coder (direct) | Code-level feedback. Coder applies fixes and re-sends `review_request`. |
| Approved | `approved` | reviewer/ui-designer → (broadcast) | Marks the code review as passed. NOT used by qa (qa uses `qa_approved`). |

**Order of operations when qa is in the room:**
```
coder finishes build
  → qa_request (direct to @qa)
    → qa runs tests
      ├ qa_feedback → coder fixes → qa_request (loop)
      └ qa_approved → coder sends review_request (broadcast)
                        → reviewer + ui-designer respond
                          ├ review_feedback → coder fixes → review_request (loop, qa is NOT re-run)
                          └ approved → cycle complete
```

**Order of operations when qa is NOT in the room:**
```
coder finishes build
  → review_request (broadcast, skip qa gate)
    → reviewer + ui-designer
      ├ review_feedback → coder fixes → review_request (loop)
      └ approved → cycle complete
```

**Detecting whether qa is in the room**: the coder calls `list_participants()` and checks for any participant with `role === "qa"`. The orchestrator's participant_joined events populate the roster live, so qa agents spawned mid-session via the Studio picker are detected on the next call.

## Secrets (Session-Shared)

Some apps need credentials (API tokens, service secrets) that multiple agents need to access. **Never commit secrets to .env or the repo.** Use the session MCP secret tools:

### set_secret
Store a secret that all agents in this session can access:
```
set_secret(key: "DURABLE_STREAMS_TOKEN", value: "ds_live_...")
```

### get_secret
Retrieve a previously stored secret:
```
get_secret(key: "DURABLE_STREAMS_TOKEN")
```

### list_secrets
List available secret keys (not values):
```
list_secrets()
```

**When to use:**
- User provides an API token via AskUserQuestion → call `set_secret` immediately so later agents can access it
- Before using a service that needs a token → call `get_secret` to retrieve it
- Durable Streams / Electric Cloud service credentials → store once, all agents read (see "Electric CLI" section below for the provisioning flow)

**How it works:** Secrets live in a dedicated per-session **SecretStore**, a StreamDB-backed collection on its own stream (`session/<roomId>-secrets`). When you call `set_secret`, the MCP server writes a typed record to that stream; every other consumer — the orchestrator, every other agent's MCP server — materializes the change into its own in-memory view on the next stream tick.

**Key guarantees:**

1. **Secrets are NEVER on the messages stream.** They don't appear in event logs, session transcripts, or the Studio UI's event feed. You can share session transcripts safely — tokens stay out.
2. **New agents inherit every secret on spawn.** When a new agent container starts, the orchestrator reads the SecretStore and writes every secret into the container's `.env`. So if the coder provisions `ELECTRIC_YJS_SECRET` at 01:10 and the reviewer spawns at 01:15, the reviewer's container has that secret in its `.env` automatically — no re-provisioning, no manual copy.
3. **Cross-agent reads are live.** Agents running in parallel see each other's writes within a few seconds (StreamDB materialization cadence). No broadcast needed.

**The SecretStore is the SINGLE source of truth for every credential in the session.** That explicitly includes the infrastructure-level values too — `DATABASE_URL`, `ELECTRIC_URL`, `ELECTRIC_SOURCE_ID`, `ELECTRIC_SECRET`:

- **Local Docker mode** — orchestrator writes `DATABASE_URL` and `ELECTRIC_URL` to SecretStore at session start (pointing at docker-compose services)
- **Electric Cloud (free trial)** — orchestrator writes all four values to SecretStore after calling the claimable-sources API
- **Electric Cloud (BYO)** — orchestrator writes only `ELECTRIC_URL` to SecretStore; the coder writes the other three later after running the Phase 0 credentials gate
- **Coder-provisioned credentials** — Yjs tokens, Durable Streams tokens, LLM API keys, anything from `npx @electric-sql/cli` or pasted by the user — all written via `set_secret`

There are no longer two categories of credential ("orchestrator-provisioned" vs "session-set"). Everything flows through the same SecretStore, the same `.env` projection at container spawn, and the same `get_secret` / `list_secrets` MCP API.

**At app runtime** (inside Vite / drizzle / TanStack Start server routes), read from `process.env.*` as usual — the `.env` file is populated from SecretStore automatically. Don't call MCP tools from app code.

**At agent discovery time** (inside your Claude Code turn), call `list_secrets()` to see what's available or `get_secret(key: "...")` to read a specific value.

Use `set_secret` whenever you provision anything dynamically during the session — the value is immediately available to every other agent via StreamDB, and to every newly-spawned agent container via the `.env` projection.

## Electric CLI — Provisioning External Services

Some apps need services that aren't auto-provisioned by the scaffold (Postgres + Electric shape sync are the only things that come pre-provisioned). The most common case is **Durable Streams**, which is required by `@durable-streams/client`, `@durable-streams/state` (StreamDB), and `@durable-streams/y-durable-streams` (Yjs collaborative editing). Other `@electric-sql/*` products may follow the same flow.

Provisioning is done through the Electric CLI (`npx @electric-sql/cli`). The CLI is **not** bundled in the container — it's downloaded on demand via `npx`. Your job is to orchestrate the credentials flow with the user, then either drive the CLI yourself (with a token the user supplies) or accept pre-existing credentials the user already has.

### Who runs this flow

**The coder runs this flow, not the planner.** If you are the planner (simple or advanced), do NOT ask the user for tokens or URLs during brainstorming. Your job is to decide whether the app needs Durable Streams and note that requirement in DESIGN.md / PLAN.md, with an instruction like: *"Before the first stream operation, the coder must follow the Electric CLI flow in the `room-messaging` skill."* The coder picks this up during implementation.

### When to trigger this flow (coder only)

You (as the coder) go through this flow whenever the planned app uses any of:
- `@durable-streams/client` — append-only event logs, activity feeds, chat history
- `@durable-streams/state` / StreamDB — presence, cursors, ephemeral reactive state
- `@durable-streams/y-durable-streams` — Yjs CRDT sync for collaborative editors, whiteboards
- Any other Electric Cloud product the CLI can provision

**You also trigger this flow** whenever the orchestrator started the session in **"Electric Cloud (my account)"** (BYO) mode — in that mode, even the base Postgres database and Electric shape source are deferred until you confirm whether to use existing credentials or provision a new claimable source. See the "Phase 0 — Prerequisite: Database & Source credentials" section in the `create-app` skill for the exact flow. In short: check for missing `DATABASE_URL` at coder startup and run this flow (with the two-option gate: paste existing / provision new) BEFORE any schema or migration work.

Do NOT run this flow for standard Electric shapes + TanStack DB apps that started in **Local Docker** or **Electric Cloud (free trial)** mode — those are already provisioned at session start (the orchestrator writes `DATABASE_URL` / `ELECTRIC_SOURCE_ID` / `ELECTRIC_SECRET` directly into your container's `.env`).

### How to wait for user input without exiting your turn

**Core rule: a plain message that ends your turn will exit the agent.** If you print instructions like "run `npx @electric-sql/cli auth` and paste the token back" and then let your turn end, Claude Code exits, and the orchestrator has to wake you on the next chat message. That's fragile and confusing for the user.

Instead, whenever you need the user to do external work and come back with a value:
1. Open an `AskUserQuestion` with a **freeform** text field. The question body contains the instructions (commands to run, what to paste).
2. The gate blocks the Claude Code turn inside the tool call. Your agent is paused, not exited.
3. When the user submits the text, the gate resolves and your turn continues in the same call.
4. You can chain multiple gates back to back if you need multiple values — each one keeps the turn alive.

This pattern is mandatory for the Electric CLI flow (below) and applies to any other scenario where you depend on the user performing an action outside the UI.

### Step 1 — Check if credentials are already in the session

The user may have already supplied credentials in a previous agent run. Always check first:
```
list_secrets()
```
Look for keys like `DS_URL`, `DS_SECRET`, `DS_SERVICE_ID`, `DURABLE_STREAMS_TOKEN`, or `ELECTRIC_CLI_TOKEN`. If they already exist, retrieve them with `get_secret(key: "...")` and jump to Step 4.

### Step 2 — Ask the user, offering two paths

Use `AskUserQuestion` to let the user pick how they want to supply credentials. **Always offer both paths** — token-based (agent drives the CLI) and direct (user already has a service):

```json
{
  "questions": [{
    "header": "Durable Streams credentials",
    "question": "This app needs Durable Streams (for <reason: event log / presence / Yjs / ...>). How would you like to set it up?",
    "options": [
      {
        "label": "I'll paste a CLI auth token",
        "description": "You get one via `npx @electric-sql/cli auth` in your own terminal; I'll use it to create the service and extract the URL + secret"
      },
      {
        "label": "I already have a service URL and secret",
        "description": "You'll paste DS_URL and DS_SECRET directly — no CLI work needed"
      },
      {
        "label": "I don't have credentials yet",
        "description": "Tell me how to get them"
      }
    ]
  }]
}
```

**CRITICAL — keep the turn alive via a follow-up gate.** In all three paths below you will need to collect values from the user (a token, or a URL+secret). You MUST collect each value via another `AskUserQuestion` call with a **freeform** text field, **in the same turn** — not via a plain chat message. A gate blocks the Claude Code turn inside the tool call, which means the process stays alive while the user does external work (e.g. running `npx @electric-sql/cli auth` in their own terminal and waiting for the browser). If you instead just print instructions and end your turn, the agent will exit and the user has to restart the flow. Always: instructions → immediately follow up with a freeform `AskUserQuestion` gate.

**If the user picks "I already have a service URL and secret":** skip the CLI entirely. Open a single `AskUserQuestion` with three freeform questions to collect `DS_URL`, `DS_SECRET`, and (optional) `DS_SERVICE_ID`. Once the answers come back, store them immediately:
```
set_secret(key: "DS_URL", value: "<pasted>")
set_secret(key: "DS_SECRET", value: "<pasted>")
set_secret(key: "DS_SERVICE_ID", value: "<pasted if the user has one>")
```
Jump to Step 4.

**If the user picks "I don't have credentials yet":** in the SAME turn, open a new `AskUserQuestion` with a freeform text field whose question explains the CLI command and asks them to paste the token back. Do NOT send a plain markdown message and then return — that ends the turn. Template:

```json
{
  "questions": [{
    "header": "Get and paste a token",
    "question": "In your own terminal (on your host machine, not inside the container), run:\n\n    npx @electric-sql/cli auth\n\nIt will open a browser window to log into your Electric Cloud account and then print an auth token to the terminal. When you have the token, paste it into the text box below and submit. I'll wait here while you do that."
  }]
}
```

Do NOT attempt to run `npx @electric-sql/cli auth` yourself — it opens a browser and requires the user's interactive login. When the user pastes the token, store it via `set_secret(key: "ELECTRIC_CLI_TOKEN", value: "<token>")` and continue at Step 3.

### Step 3 — Use the CLI to discover and create the service

Once you have the user's auth token, store it and explore the CLI. **Do NOT assume command names or flag shapes** — CLIs evolve and guessing leads to broken runs. Discover first, then act.

```
set_secret(key: "ELECTRIC_CLI_TOKEN", value: "<token from user>")
```

Then, in a Bash shell inside the agent container:
```bash
# Export the token so the CLI picks it up. Check --help output for the exact env var the CLI expects
# (common patterns: ELECTRIC_CLI_TOKEN, ELECTRIC_TOKEN, ELECTRIC_AUTH_TOKEN). If unsure, try the most
# likely one first, then re-read --help for authentication guidance.
export ELECTRIC_CLI_TOKEN="<token>"

# 1. Discover top-level commands
npx @electric-sql/cli --help

# 2. For every subcommand that looks relevant to what the app needs, read its help
npx @electric-sql/cli <subcommand> --help
npx @electric-sql/cli <subcommand> <sub-subcommand> --help
```

Read the `--help` output carefully and pick the command that provisions the service you need (for Durable Streams, this is typically a "create" or "streams create" style command that returns a URL, secret, and service ID). Prefer non-destructive commands (`list`, `get`, `--help`) before running any `create` / `delete` / `destroy` command.

Run the create command and capture its stdout:
```bash
npx @electric-sql/cli <create-command> [flags discovered from --help]
```

Parse the output for the URL, secret, and service ID (they are usually printed as labeled lines or as a small JSON blob — the CLI's `--help` will tell you). Immediately store each:
```
set_secret(key: "DS_URL", value: "<parsed from CLI output>")
set_secret(key: "DS_SECRET", value: "<parsed from CLI output>")
set_secret(key: "DS_SERVICE_ID", value: "<parsed from CLI output>")
```

If the CLI errors, the command doesn't exist, or the flags don't match what you expect, **stop and report the failure to the user** via `AskUserQuestion` — paste the CLI's error output and ask whether to retry, change approach, or fall back to the "I already have a service URL and secret" path. Do not loop on broken commands.

### Step 4 — Use the stored credentials in the app code

From this point on, whenever the app needs the credentials, read them from the session secrets — never hardcode them:
```
get_secret(key: "DS_URL")
get_secret(key: "DS_SECRET")
```

In the app itself, load the values from environment variables at runtime (`process.env.DS_SERVICE_ID`, `process.env.DS_SECRET`, `process.env.ELECTRIC_URL`). **Build the stream URL from `ELECTRIC_URL + DS_SERVICE_ID` — do NOT read `process.env.DS_URL` directly** (it may be set to the root API URL in some environments and your PUT/POST will 404). **CRITICAL — SERVER-SIDE ONLY:** every Electric Cloud endpoint (shapes, Yjs, Durable Streams) rejects client calls without a secret with `401 MISSING_SECRET`. You MUST write a server-side proxy route for every cloud service you use (pattern for Electric shapes already in `src/lib/electric-proxy.ts`; for Yjs and Durable Streams, see the "Electric Cloud auth: server-side proxy is MANDATORY" section of the create-app skill). The client code NEVER sees the secret — it always talks to a same-origin `/api/...` proxy route that reads the secret from `process.env` and forwards the call with `Authorization: Bearer <secret>` or `?secret=<value>` as the service requires.

**Do NOT** write the secret values into committed files (`.env` must be gitignored; `src/*.ts` never). They live only in the session via `get_secret` and in the container's `.env` at runtime.

### Safety rules for the CLI flow

- **Never run `npx @electric-sql/cli auth` yourself** — it requires a browser login by the user
- **Never commit** tokens, URLs, or secrets to the repo or to `.env`
- **Never echo** full secret values back to the user after storing them — just confirm "stored" with the key name
- **Never call destructive commands** (`delete`, `destroy`, `rm`, etc.) without explicit user approval via `AskUserQuestion`
- **Never guess** at command names — always run `--help` first

## CRITICAL metadata.type

Use the exact `metadata.type` values in the Signal Types table above. The orchestrator pattern-matches on them to trigger agent spawning. Using the wrong type (e.g., `status_update` instead of `plan_ready`) means the next agent never starts.

## Rules

1. **Always join first** — call `join` before sending any messages
2. **Always ACK** — acknowledge every message you process
3. **Use structured metadata** — don't embed structured data in the body text
4. **Use `commit_and_push`** — never run raw `git add/commit/push` commands manually
5. **Handle duplicates** — you may receive the same message twice (check `message_id`). Skip duplicates.
6. **Broadcast for announcements, direct for work** — status updates and review requests go to everyone; feedback and questions go to specific agents
7. **Stay in the room** — do NOT call `leave` unless the user explicitly tells you to quit. Agents join once and stay joined.
