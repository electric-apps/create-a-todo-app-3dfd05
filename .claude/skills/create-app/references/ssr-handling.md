# SSR handling for `useLiveQuery` and client-only state

**Read this before writing any route that uses `useLiveQuery`, Durable Streams subscriptions, Yjs providers, localStorage, or any browser API.**

## The problem

TanStack Start renders every route on the SERVER by default (isomorphic-by-default from `start-core/execution-model`). `useLiveQuery` (from `@tanstack/react-db`) wraps React's `useSyncExternalStore`, which **requires a `getServerSnapshot` callback** when rendered server-side. TanStack DB's live subscriptions don't provide one (they're inherently client-only — they need a live database connection).

If you put `useLiveQuery` in a component that renders during SSR, you get this error at runtime:

```
Missing getServerSnapshot, which is required for server-rendered content.
Will revert to client rendering.
    at useSyncExternalStore
    at useLiveQuery
    at <YourRouteComponent>
```

React catches it and falls back to client-only rendering for that subtree, but the user sees a console error, the initial paint is broken, and any SSR optimizations for the route are defeated.

## Decision tree — pick ONE per route

| Where is `useLiveQuery` called? | What to do |
|---|---|
| Directly in a **leaf route component** (`src/routes/*.tsx` or `src/routes/<path>/*.tsx`) | Add `ssr: false` to the route options: `createFileRoute("/path")({ ssr: false, component: ... })` |
| Inside `src/routes/__root.tsx` | NEVER use `ssr: false` here — it breaks the entire app. Wrap the consumer subtree in `<ClientOnly>` from `src/components/ClientOnly.tsx` instead |
| Inside a shared component rendered from multiple routes | Wrap that component's body in `<ClientOnly>` OR gate the hook call on `useHydrated()` from `@tanstack/start-client-core` |

## `<ClientOnly>` usage — MUST use render function

**CRITICAL**: `<ClientOnly>` takes a **render function** as children, NOT regular JSX children.

```tsx
import { ClientOnly } from "@/components/ClientOnly"

// ✅ CORRECT — children is a function
<ClientOnly fallback={<p>Loading...</p>}>
  {() => <MyClientComponent />}
</ClientOnly>

// ❌ WRONG — causes "children is not a function" TypeError
<ClientOnly fallback={<p>Loading...</p>}>
  <MyClientComponent />
</ClientOnly>
```

This pattern ensures the client-only subtree is never evaluated during SSR — the function is only called when `isClient` is true.

## Canonical pattern for a leaf route

```typescript
// src/routes/doc.$id.tsx
import { createFileRoute } from "@tanstack/react-router"
import { useLiveQuery } from "@tanstack/react-db"
import { eq } from "@tanstack/db"
import { documentsCollection } from "@/db/collections/documents"

export const Route = createFileRoute("/doc/$id")({
  ssr: false,              // ← REQUIRED when the component uses useLiveQuery
  component: DocPage,
})

function DocPage() {
  const { id } = Route.useParams()
  const { data: docs, isLoading } = useLiveQuery(
    (q) => q.from({ docs: documentsCollection }).where(({ docs }) => eq(docs.id, id)),
    [id],
  )
  // ...
}
```

## Anti-patterns — these DO NOT WORK in TanStack Start

- ❌ **`"use client"` directive at the top of the file.** This is a Next.js / React Server Components directive. TanStack Start silently ignores it — your route still renders server-side and still crashes. It's a leaked pattern from Next.js muscle memory. Delete it and use `ssr: false` on the route options instead.
- ❌ **`if (typeof window === "undefined") return null`** inside a component that calls `useLiveQuery` unconditionally. The hook still runs during SSR (hooks must be called before any conditional return) and still throws. Use `<ClientOnly>` around the subtree, not early returns after the hook.
- ❌ **`useEffect(() => { /* query here */ }, [])`** as a replacement. `useEffect` doesn't give you reactive live queries — you lose the whole point of TanStack DB. Use `ssr: false` and call `useLiveQuery` normally.

## Yjs provider note

`YjsProvider` from `@durable-streams/y-durable-streams` touches `fetch` and `EventSource` in its constructor. Any route that instantiates it MUST use `ssr: false` or be wrapped in `<ClientOnly>`. Same rule applies to any direct `DurableStream(...)` client construction, `createStreamDB(...)` initialization, or `new Y.Doc()` that triggers an effect.

## General principle

Every React hook that consumes client-only state (live queries, localStorage, browser APIs, `window`, Durable Streams subscriptions, Yjs providers) must be wrapped in `<ClientOnly>` or gated on `useHydrated()`. Putting them unconditionally in `__root.tsx` or a route component causes `TypeError: Cannot read properties of undefined (reading 'setState')` at `hydrateStart` on first load.
