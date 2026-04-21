/**
 * Electric shape proxy helpers.
 * Used by API routes to forward shape requests to the Electric service.
 *
 * Supports both local Electric (Docker) and Electric Cloud.
 * For Electric Cloud, set these environment variables:
 *   ELECTRIC_URL=https://api.electric-sql.cloud
 *   ELECTRIC_SOURCE_ID=<your-source-id>
 *   ELECTRIC_SECRET=<your-secret>
 *
 * ⚠️ On the CLIENT side (when constructing `ShapeStream({ url: ... })`
 * or similar), the URL passed to the client library MUST be absolute.
 * Use `absoluteApiUrl()` from `src/lib/client-url.ts` to construct it.
 * Passing a relative path like `/api/shape/documents` throws
 * `TypeError: Failed to construct 'URL': Invalid URL` inside the client
 * library's URL parser.
 */

// Headers that must NOT be forwarded from upstream to the browser.
//
// Two categories:
//   1. RFC 9110 hop-by-hop headers — per spec, must not be passed
//      end-to-end by a proxy.
//   2. Content-encoding-related headers — Node's `fetch()` automatically
//      decompresses gzip / br / zstd response bodies, but leaves the
//      `Content-Encoding` header intact on `response.headers`. If we
//      forward that header, the browser will see `Content-Encoding: gzip`
//      + a plaintext body and crash with `ERR_CONTENT_DECODING_FAILED`.
//      Same story for `Content-Length` — after auto-decompression the
//      upstream length no longer matches the body we're forwarding.
//      STRIP BOTH. The runtime will recompute them for the new response.
//
// Everything else passes through so the client sees custom protocol
// headers (Electric-Handle, Electric-Offset, Electric-Schema,
// Electric-Cursor, stream-next-offset, etc. — and any new ones added
// in future library versions).
const HOP_BY_HOP = new Set([
	// RFC 9110 hop-by-hop
	"connection",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	"host",
	// Post-decompression rewrites — see comment above
	"content-encoding",
	"content-length",
])

export function prepareElectricUrl(request: Request, tableName: string): string {
	const electricUrl = process.env.ELECTRIC_URL || "http://localhost:3000"
	const url = new URL(`${electricUrl}/v1/shape`)

	// Forward Electric-specific query parameters
	const requestUrl = new URL(request.url)
	for (const [key, value] of requestUrl.searchParams) {
		url.searchParams.set(key, value)
	}

	// Set the table name
	url.searchParams.set("table", tableName)

	// Add Electric Cloud auth if configured (server-side only, never exposed to browser)
	if (process.env.ELECTRIC_SOURCE_ID && process.env.ELECTRIC_SECRET) {
		url.searchParams.set("source_id", process.env.ELECTRIC_SOURCE_ID)
		url.searchParams.set("secret", process.env.ELECTRIC_SECRET)
	}

	return url.toString()
}

export async function proxyElectricRequest(
	request: Request,
	tableName: string,
): Promise<Response> {
	const url = prepareElectricUrl(request, tableName)

	const response = await fetch(url)

	// Forward every response header EXCEPT hop-by-hop. Don't use an
	// allow-list — Electric and Durable Streams protocols add custom
	// headers (stream-next-offset, Electric-*, etc.) that are critical
	// to the client's state machine. An allow-list will silently strip
	// headers added in future library versions and break sync in ways
	// that are very hard to diagnose.
	const forwardedHeaders = new Headers()
	for (const [key, value] of response.headers) {
		if (HOP_BY_HOP.has(key.toLowerCase())) continue
		forwardedHeaders.set(key, value)
	}
	// Ensure Cache-Control is at least no-cache for SSE-like endpoints
	// that don't set it explicitly.
	if (!forwardedHeaders.has("cache-control")) {
		forwardedHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate")
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: forwardedHeaders,
	})
}
