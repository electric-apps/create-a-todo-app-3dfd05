/**
 * Client-side URL helpers.
 *
 * Most Electric / Durable Streams / Yjs client libraries construct
 * `new URL(url)` internally to parse their configuration. Passing a
 * relative path like `/api/shape/documents` throws
 * `TypeError: Failed to construct 'URL': Invalid URL` — `new URL` needs
 * an absolute URL or an explicit base.
 *
 * This helper handles both:
 *   - In the browser: `window.location.origin` + the path → absolute URL
 *   - On the server (SSR loaders, `createServerFn`, etc.): an absolute
 *     URL pointing at an internal origin so server-rendered code that
 *     accidentally touches a client-only library doesn't crash
 *
 * ALWAYS use this when passing URLs to:
 *   - `ShapeStream({ url: ... })` (from `@electric-sql/client`)
 *   - `YjsProvider({ baseUrl: ... })` (from `@durable-streams/y-durable-streams`)
 *   - `DurableStream({ url: ... })` (from `@durable-streams/client`)
 *
 * DO NOT use it for same-origin `fetch()` calls — `fetch("/api/x")`
 * works fine; the issue is only with libraries that pre-parse URLs.
 *
 * @example
 * // In a route component:
 * const collection = createCollection(
 *   electricCollectionOptions({
 *     shapeOptions: {
 *       url: absoluteApiUrl("/api/shape/documents"),
 *       // ...
 *     },
 *   })
 * )
 *
 * @example
 * // In a Yjs provider setup:
 * const provider = new YjsProvider({
 *   doc,
 *   baseUrl: absoluteApiUrl("/api/yjs"),
 *   docId,
 * })
 */
export function absoluteApiUrl(path: string): string {
	// Already absolute — pass through unchanged.
	if (/^https?:\/\//i.test(path)) return path

	const normalized = path.startsWith("/") ? path : `/${path}`

	// Browser: prefix with window.location.origin
	if (typeof window !== "undefined" && typeof window.location !== "undefined") {
		return `${window.location.origin}${normalized}`
	}

	// Server-side: use an internal base. The env var is set by the
	// orchestrator when PREVIEW_PORT is known; falls back to the Vite
	// default for local `pnpm dev` outside the sandbox.
	const origin = process.env.APP_ORIGIN ?? "http://localhost:5174"
	return `${origin}${normalized}`
}
