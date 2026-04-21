# Electric Cloud proxy — TanStack Start wiring

**Read this when your app uses Yjs, Durable Streams, or StreamDB with Electric Cloud.**

For the proxy logic itself (block-list headers, `content-encoding` fix, `duplex: "half"`, common mistakes), read the authoritative intent skill shipped with the package:

```bash
cat node_modules/@durable-streams/y-durable-streams/skills/yjs-server/SKILL.md
```

This file only covers the **TanStack Start route wiring** — how to expose the proxy as a `createFileRoute` + `server.handlers` endpoint in this scaffold.

## TanStack Start route: `/api/yjs/$`

Use the `$` splat route to capture all Yjs sub-paths (`/docs/<id>`, `/docs/<id>/awareness`, etc.):

```typescript
// src/routes/api/yjs/$.ts
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/api/yjs/$")({
  server: {
    handlers: {
      GET: proxyYjs,
      POST: proxyYjs,
      PUT: proxyYjs,
      PATCH: proxyYjs,
      DELETE: proxyYjs,
      OPTIONS: proxyYjs,
    },
  },
})
```

The `proxyYjs` function reads `YJS_URL` and `YJS_SECRET` from `process.env`, injects the `Authorization: Bearer` header, and forwards using the block-list pattern from the `yjs-server` skill. Use `params._splat` for the sub-path and preserve the query string.

## Client-side: use `absoluteApiUrl`

The `baseUrl` passed to `YjsProvider` must be an absolute URL — relative paths crash inside `new URL(baseUrl)`. Use the scaffold's `absoluteApiUrl` helper:

```typescript
import { absoluteApiUrl } from "@/lib/client-url"

const provider = new YjsProvider({
  doc: ydoc,
  baseUrl: absoluteApiUrl("/api/yjs"),
  docId,
  awareness,
})
```

The route must have `ssr: false` — see `references/ssr-handling.md`.

## Durable Streams proxy

For `@durable-streams/client` or StreamDB, create `src/routes/api/streams.$streamId.ts`. This proxy MUST ensure the stream exists before forwarding read requests — Durable Streams return 404 if the stream path hasn't been created yet, and clients subscribe on page load before any data has been written.

### Stream initialization pattern (CRITICAL)

Streams must be created with a PUT before they can be read with a GET. The proxy handles this automatically using `ensureStream()`:

```typescript
// src/lib/ds-proxy.ts
import { DurableStream } from "@durable-streams/client"

const streamHandles = new Map<string, DurableStream>()

/**
 * Get or create a DurableStream handle for a given stream URL.
 * Uses DurableStream.create() which is idempotent — safe to call
 * on every request. Returns a handle with the correct contentType
 * so append() sends the right Content-Type header.
 *
 * IMPORTANT: NEVER use `new DurableStream({ url, headers })` directly.
 * That constructor defaults to text/plain. If the stream was created
 * with contentType: "application/json", every append() will fail with
 * 409 CONTENT_TYPE_MISMATCH.
 */
export async function getStreamHandle(streamUrl: string, headers: Record<string, string>): Promise<DurableStream> {
  const cached = streamHandles.get(streamUrl)
  if (cached) return cached
  const handle = await DurableStream.create({
    url: streamUrl,
    contentType: "application/json",
    headers,
  })
  streamHandles.set(streamUrl, handle)
  return handle
}

/**
 * Ensure a stream exists before reading from it (convenience wrapper).
 */
export async function ensureStream(streamUrl: string, headers: Record<string, string>): Promise<void> {
  await getStreamHandle(streamUrl, headers)
}

export function buildStreamUrl(streamPath: string): string {
  const dsUrl = process.env.DS_URL
  if (dsUrl && dsUrl.includes("/v1/stream/")) {
    return `${dsUrl.replace(/\/+$/, "")}/${streamPath}`
  }
  const serviceId = process.env.DS_SERVICE_ID || process.env.ELECTRIC_DS_SERVICE_ID
  const electricUrl = (process.env.ELECTRIC_URL || "https://api.electric-sql.cloud").replace(/\/+$/, "")
  if (serviceId) {
    return `${electricUrl}/v1/stream/${serviceId}/${streamPath}`
  }
  throw new Error("Cannot resolve DS base URL: set DS_SERVICE_ID or DS_URL")
}

export function dsAuthHeaders(): Record<string, string> {
  const secret = process.env.DS_SECRET || process.env.ELECTRIC_DS_SECRET
  return secret ? { Authorization: `Bearer ${secret}` } : {}
}
```

### Writing to a stream

Always use `getStreamHandle()` to get a handle for appending — never `new DurableStream()`:

```typescript
const handle = await getStreamHandle(streamUrl, headers)
await handle.append(JSON.stringify({ role: "user", content: message }))
```

### Proxy route

```typescript
// src/routes/api/streams.$streamId.ts
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start/server"
import { ensureStream, buildDsUrl, dsAuthHeaders } from "@/lib/ds-proxy"

export const Route = createFileRoute("/api/streams/$streamId")({
  // Forward all methods (GET for subscribe, PUT for create, POST for append)
  ...["GET", "PUT", "POST"].reduce((acc, method) => ({
    ...acc,
    [method.toLowerCase()]: createServerFn({ method })
      .handler(async ({ request }) => {
        const streamId = /* extract from URL */;
        const url = buildDsUrl(streamId)
        const headers = dsAuthHeaders()

        // Ensure the stream exists before forwarding reads
        if (method === "GET") {
          await ensureStream(url, headers)
        }

        // Forward the request to DS
        const resp = await fetch(url, {
          method,
          headers: { ...headers, "content-type": request.headers.get("content-type") ?? "application/json" },
          body: method !== "GET" ? await request.text() : undefined,
        })

        // Strip hop-by-hop headers (same pattern as electric-proxy.ts)
        const fwdHeaders = new Headers(resp.headers)
        fwdHeaders.delete("content-length")
        fwdHeaders.delete("content-encoding")
        fwdHeaders.delete("transfer-encoding")

        return new Response(resp.body, { status: resp.status, headers: fwdHeaders })
      }),
  }), {}),
})
```

### Why this matters

Without `ensureStream()`, the first client to load the page subscribes to a stream that doesn't exist yet → 404 → the app appears broken. `DurableStream.create()` is idempotent, so calling it on every first-read is safe — subsequent reads skip it via the in-memory cache.

## Env var naming

One env var per service, read only from server code:

| Service | Env vars |
|---|---|
| Electric shapes (auto-provisioned) | `ELECTRIC_URL`, `ELECTRIC_SOURCE_ID`, `ELECTRIC_SECRET` |
| Durable Streams (events / StreamDB) | `ELECTRIC_DS_SERVICE_ID`, `ELECTRIC_DS_SECRET` |
| Yjs | `ELECTRIC_YJS_SERVICE_ID`, `ELECTRIC_YJS_SECRET` |

### content-length MUST be dropped unconditionally on streaming proxies

When proxying streaming responses (SSE, chunked), ALWAYS delete `content-length` from forwarded headers — do NOT make the drop conditional on `transfer-encoding` also being present:

```typescript
// WRONG — conditional is a no-op when transfer-encoding was already stripped
if (headers.has("transfer-encoding") && headers.has("content-length")) {
  headers.delete("content-length")
}

// RIGHT — always drop content-length on streaming proxies
headers.delete("content-length")
headers.delete("content-encoding")
headers.delete("transfer-encoding")
```

## Anti-patterns

- ❌ Client code importing `process.env.ELECTRIC_SECRET` — leaks into the Vite bundle
- ❌ `YjsProvider({ baseUrl: "https://api.electric-sql.cloud/..." })` — 401 `MISSING_SECRET`
- ❌ Passing the secret in client-side `headers.Authorization` — leaks into the bundle
- ❌ Hardcoding secrets in committed files (`.env` must be gitignored)
