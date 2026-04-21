#!/usr/bin/env node
// preflight.mjs — static checks for recurring bug classes in Electric/TanStack Start apps.
//
// Runs as `prebuild` so every `pnpm build` invocation validates the codebase
// against the patterns the coder skill warns about. Exits non-zero on any
// failure; the build then aborts. The goal is to make the fail-loud path
// automatic instead of relying on the agent to remember to run grep checks.
//
// Checks performed:
//   1. SSR safety — leaf routes with `useLiveQuery` must set `ssr: false`
//      (or wrap the consumer in <ClientOnly>)
//   2. "use client" directive — a Next.js idiom that does nothing in TanStack
//      Start, but looks like it works. Reject it everywhere.
//   3. TipTap v3 cursor/caret trap — reject the broken v3 stub of
//      `@tiptap/extension-collaboration-cursor` (agents must use
//      `@tiptap/extension-collaboration-caret`)
//   4. Electric timestamp parser — collections with timestamp columns must
//      configure `shapeOptions.parser.timestamptz` or rows arrive as strings
//      and `.getTime()` crashes at runtime

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

const ROOT = process.cwd()
const errors = []

// ── helpers ────────────────────────────────────────────────────────────────

function walk(dir, filter) {
  const results = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue
      results.push(...walk(full, filter))
    } else if (filter(entry, full)) {
      results.push(full)
    }
  }
  return results
}

function readSafe(path) {
  try {
    return readFileSync(path, "utf-8")
  } catch {
    return ""
  }
}

function fail(category, message, files = []) {
  errors.push({ category, message, files })
}

// ── 1. SSR safety check ────────────────────────────────────────────────────

{
  const routeFiles = walk(join(ROOT, "src/routes"), (name) => name.endsWith(".tsx"))
  const bad = []
  for (const file of routeFiles) {
    if (file.endsWith("/__root.tsx")) continue
    const content = readSafe(file)
    if (!/\buseLiveQuery\b/.test(content)) continue
    if (/\bClientOnly\b/.test(content)) continue
    if (/ssr:\s*false/.test(content)) continue
    bad.push(relative(ROOT, file))
  }
  if (bad.length) {
    fail(
      "SSR safety",
      "The following routes call useLiveQuery but do NOT set `ssr: false` and do NOT wrap the consumer in <ClientOnly>. At runtime they crash with `Missing getServerSnapshot` during SSR. Add `ssr: false` to the route's createFileRoute options, or wrap the consumer subtree in <ClientOnly>.",
      bad,
    )
  }
}

// ── 1b. JavaScript comparison operators in .where() ───────────────────────
// TanStack DB .where() requires expression functions (eq, gt, etc.), not JS
// comparison operators (===, !==, <, >). Using JS operators returns a boolean
// which throws InvalidWhereExpressionError at runtime.

{
  const sourceFiles = walk(join(ROOT, "src"), (name) => /\.tsx?$/.test(name))
  const bad = []
  for (const file of sourceFiles) {
    const content = readSafe(file)
    if (!/\.where\s*\(/.test(content)) continue
    // Match .where(({ x }) => x.field === / !== / < / > / <= / >= value)
    const matches = content.matchAll(/\.where\s*\(\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*[^)]*?(===|!==|[^=!<>]<[^=]|[^=!<>]>[^=]|<=|>=)/g)
    for (const match of matches) {
      const lineNum = content.slice(0, match.index).split("\n").length
      bad.push(`${relative(ROOT, file)}:${lineNum}: uses '${match[1]}' in .where() — must use eq(), gt(), etc.`)
    }
  }
  if (bad.length) {
    fail(
      "where() comparison operators",
      "TanStack DB .where() requires query expression functions, NOT JavaScript comparison operators. Using === or !== throws InvalidWhereExpressionError at runtime.\n\n  ❌ .where(({ todo }) => todo.completed === true)\n  ✅ .where(({ todo }) => eq(todo.completed, true))\n\nImport operators: import { eq, gt, and, or, not } from \"@tanstack/db\"",
      bad,
    )
  }
}

// ── 2. `"use client"` directive ────────────────────────────────────────────
// Scan agent-authored source only. Skip `src/components/ui/` — those are
// shadcn-pre-installed components that ship with `"use client"` at the top;
// TanStack Start ignores the directive and the components work fine there.
// The check exists to catch AGENT confusion about Next.js semantics, not to
// police third-party scaffolding.

{
  const sourceFiles = walk(join(ROOT, "src"), (name) => /\.(tsx?|jsx?)$/.test(name))
  const bad = []
  for (const file of sourceFiles) {
    const rel = relative(ROOT, file)
    if (rel.startsWith("src/components/ui/") || rel.startsWith("src\\components\\ui\\")) continue
    const content = readSafe(file)
    if (/^\s*['"]use client['"]/m.test(content)) {
      bad.push(rel)
    }
  }
  if (bad.length) {
    fail(
      '"use client" directive',
      '`"use client"` is a Next.js / React Server Components idiom. TanStack Start silently ignores it — your route still renders server-side and still crashes. Delete the directive and use `ssr: false` on the route options instead.',
      bad,
    )
  }
}

// ── 3. TipTap v3 cursor/caret trap ─────────────────────────────────────────

{
  const pkgPath = join(ROOT, "package.json")
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readSafe(pkgPath) || "{}")
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies }
    const bad = []
    if (allDeps["@tiptap/extension-collaboration-cursor"]) {
      bad.push("package.json: @tiptap/extension-collaboration-cursor (broken in v3 — use @tiptap/extension-collaboration-caret instead)")
    }
    if (allDeps["y-prosemirror"]) {
      bad.push("package.json: y-prosemirror (TipTap v3 uses @tiptap/y-tiptap internally — remove this dep)")
    }
    // Also scan source files for imports of the old package
    const sourceFiles = walk(join(ROOT, "src"), (name) => /\.(tsx?|jsx?|mts|cts)$/.test(name))
    for (const file of sourceFiles) {
      const content = readSafe(file)
      if (/@tiptap\/extension-collaboration-cursor/.test(content)) {
        bad.push(`${relative(ROOT, file)}: imports @tiptap/extension-collaboration-cursor`)
      }
      if (/from\s+["']y-prosemirror["']/.test(content)) {
        bad.push(`${relative(ROOT, file)}: imports from y-prosemirror directly`)
      }
    }
    if (bad.length) {
      fail(
        "TipTap v3 cursor/caret trap",
        "TipTap v3 renamed `extension-collaboration-cursor` → `extension-collaboration-caret` and moved the Yjs integration from `y-prosemirror` into `@tiptap/y-tiptap`. Installing `@tiptap/extension-collaboration-cursor@3.x` produces a hard crash in `Plugin.init` (`TypeError: Cannot read properties of undefined (reading 'doc')` at cursor-plugin.js:76). Replace with `@tiptap/extension-collaboration-caret` and never pin `y-prosemirror` directly.",
        bad,
      )
    }
  }
}

// ── 3b. CommonJS require() in ESM source ──────────────────────────────────
// TanStack Start is ESM. Using require() in browser code crashes with
// "ReferenceError: require is not defined". Must use import instead.

{
  const sourceFiles = walk(join(ROOT, "src"), (name) => /\.(tsx?|jsx?)$/.test(name))
  const bad = []
  for (const file of sourceFiles) {
    const rel = relative(ROOT, file)
    if (rel.startsWith("src/components/ui/")) continue
    const content = readSafe(file)
    // Match require("...") but not inside comments
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith("//") || line.startsWith("*")) continue
      if (/\brequire\s*\(/.test(line)) {
        bad.push(`${rel}:${i + 1}`)
      }
    }
  }
  if (bad.length) {
    fail(
      "CommonJS require() in ESM",
      "This project uses ESM (`\"type\": \"module\"`). `require()` is not available in browser code and crashes with `ReferenceError: require is not defined`. Replace with `import` statements.",
      bad,
    )
  }
}

// ── 4. Electric timestamp parser ───────────────────────────────────────────

{
  const schemaPath = join(ROOT, "src/db/schema.ts")
  const hasTimestampColumns = existsSync(schemaPath) && /\btimestamp\s*\(/.test(readSafe(schemaPath))
  if (hasTimestampColumns) {
    const collectionFiles = walk(join(ROOT, "src/db/collections"), (name) => name.endsWith(".ts"))
    const bad = []
    for (const file of collectionFiles) {
      const content = readSafe(file)
      // Only check files that use electricCollectionOptions
      if (!/electricCollectionOptions/.test(content)) continue
      if (!/timestamptz\s*:/.test(content)) {
        bad.push(relative(ROOT, file))
      }
    }
    if (bad.length) {
      fail(
        "Electric timestamp parser",
        "These collection files use electricCollectionOptions but do NOT configure `shapeOptions.parser.timestamptz`. Electric's sync path bypasses the TanStack DB schema, so timestamptz columns arrive as ISO strings and `.getTime()` / `.toLocaleDateString()` crash at runtime. Add:\n\n  shapeOptions: {\n    url: absoluteApiUrl('/api/<entity>'),\n    parser: {\n      timestamptz: (v) => new Date(v),\n      timestamp:   (v) => new Date(v),\n    },\n  }\n\nSee node_modules/@electric-sql/client/skills/electric-new-feature/SKILL.md → \"Removing parsers because the TanStack DB schema handles types\" for the full reasoning.",
        bad,
      )
    }
  }
}

// ── 5. useLiveQuery destructuring check ────────────────────────────────────
// useLiveQuery returns { data }, not the array directly. Writing
// `const items = useLiveQuery(...)` then `items.map(...)` crashes with
// "map is not a function". Must be `const { data: items = [] } = useLiveQuery(...)`.

{
  const sourceFiles = walk(join(ROOT, "src"), (name) => /\.tsx?$/.test(name))
  const bad = []
  for (const file of sourceFiles) {
    const content = readSafe(file)
    if (!/useLiveQuery/.test(content)) continue
    // Match `const foo = useLiveQuery(` — missing { data } destructuring
    const matches = content.matchAll(/const\s+(\w+)\s*=\s*useLiveQuery\s*\(/g)
    for (const match of matches) {
      bad.push(`${relative(ROOT, file)}: \`const ${match[1]} = useLiveQuery(...)\` — must destructure: \`const { data: ${match[1]} = [] } = useLiveQuery(...)\``)
    }
  }
  if (bad.length) {
    fail(
      "useLiveQuery destructuring",
      "`useLiveQuery()` returns `{ data }`, NOT the array directly. Using `const items = useLiveQuery(...)` then `items.map(...)` crashes with \"map is not a function\". Destructure with a default: `const { data: items = [] } = useLiveQuery(...)`.",
      bad,
    )
  }
}

// ── 6. ClientOnly render function check ────────────────────────────────────
// <ClientOnly> takes children as a render function: {() => <Foo />}
// Passing regular JSX children causes "children is not a function" at runtime.

{
  const sourceFiles = walk(join(ROOT, "src"), (name) => /\.tsx$/.test(name))
  const bad = []
  for (const file of sourceFiles) {
    const content = readSafe(file)
    if (!/<ClientOnly/.test(content)) continue
    // Match <ClientOnly ...> followed by JSX that is NOT a function
    // Pattern: <ClientOnly ...>\n  <Foo  (regular JSX child, no arrow function)
    // We look for <ClientOnly[^>]*> NOT followed by {() or {( on the next non-whitespace
    const matches = content.matchAll(/<ClientOnly[^>]*>\s*(?!\{[\s(])/g)
    for (const match of matches) {
      // Exclude cases where children is already a function like {() =>
      const after = content.slice(match.index + match[0].length, match.index + match[0].length + 20)
      if (!after.startsWith("{")) {
        bad.push(relative(ROOT, file))
        break
      }
    }
  }
  if (bad.length) {
    fail(
      "ClientOnly render function",
      '<ClientOnly> requires children as a render function: `<ClientOnly>{() => <MyComponent />}</ClientOnly>`. Passing regular JSX children like `<ClientOnly><MyComponent /></ClientOnly>` causes "children is not a function" TypeError at runtime.',
      bad,
    )
  }
}

// ── 7. TanStack AI UIMessage .text vs .content ────────────────────────────
// TanStack AI's TextPart uses `.content`, not `.text`. Reading `.text`
// renders empty strings silently — chat bubbles show nothing even though
// the server is streaming correctly. This is distinct from the chunk
// format over the wire (which uses `delta`).

{
  const sourceFiles = walk(join(ROOT, "src"), (name) => /\.tsx?$/.test(name))
  const bad = []
  for (const file of sourceFiles) {
    const content = readSafe(file)
    // Only check files that use TanStack AI / useChat
    if (!/@tanstack\/ai|useChat|UIMessage/.test(content)) continue
    // Look for .filter(... type === "text" ...).map(... .text ...)
    // or .parts.filter...text).map(p => p.text)
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Match patterns like p.text or part.text on a line that looks like
      // it's mapping over text parts (has type === "text" nearby)
      if (/\bp\.text\b|\bpart\.text\b/.test(line)) {
        // Check 3 lines of context for type === "text" filter
        const ctx = lines.slice(Math.max(0, i - 3), i + 1).join(" ")
        if (/type\s*===\s*["']text["']/.test(ctx)) {
          bad.push(`${relative(ROOT, file)}:${i + 1}: reads \`.text\` on a UIMessage text part — TextPart uses \`.content\``)
        }
      }
    }
  }
  if (bad.length) {
    fail(
      "UIMessage TextPart field",
      "TanStack AI's `TextPart` (the one inside `UIMessage.parts`) stores text in `.content`, NOT `.text`. Reading `.text` silently returns `undefined` and chat bubbles render as empty — no error, just blank messages. Fix by reading `.content`:\n\n  ❌ parts.filter((p) => p.type === \"text\").map((p) => p.text).join(\"\")\n  ✅ parts.filter((p) => p.type === \"text\").map((p) => p.content).join(\"\")\n\nReference: `@tanstack/ai` types — `TextPart { type: \"text\"; content: string }`.",
      bad,
    )
  }
}

// ── 8. DurableStream constructor misuse ───────────────────────────────────
// `new DurableStream({ url, headers })` defaults to text/plain. If the
// stream was created with contentType: "application/json" (which is what
// ensureStream/getStreamHandle does), every append() fails with 409
// CONTENT_TYPE_MISMATCH. Must use DurableStream.create() instead.

{
  const sourceFiles = walk(join(ROOT, "src"), (name) => /\.tsx?$/.test(name))
  const bad = []
  for (const file of sourceFiles) {
    const content = readSafe(file)
    if (!/DurableStream/.test(content)) continue
    const lines = content.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (/new\s+DurableStream\s*\(/.test(line)) {
        bad.push(`${relative(ROOT, file)}:${i + 1}`)
      }
    }
  }
  if (bad.length) {
    fail(
      "DurableStream constructor",
      "`new DurableStream({ url, headers })` defaults to contentType `text/plain`. If the stream was created with `application/json` (via `DurableStream.create()` or `ensureStream()`), every `append()` fails with 409 CONTENT_TYPE_MISMATCH. Use `DurableStream.create()` or `getStreamHandle()` from `@/lib/ds-proxy` instead — they return a handle with the correct content type.\n\n  ❌ const handle = new DurableStream({ url, headers })\n  ✅ const handle = await DurableStream.create({ url, contentType: \"application/json\", headers })\n  ✅ const handle = await getStreamHandle(streamUrl, headers)",
      bad,
    )
  }
}

// ── report ─────────────────────────────────────────────────────────────────

if (errors.length === 0) {
  console.log("✓ preflight: all checks passed")
  process.exit(0)
}

console.error("")
console.error("✗ preflight failed — the following issues MUST be fixed before the build can proceed:")
console.error("")
for (const err of errors) {
  console.error(`  [${err.category}]`)
  console.error(`    ${err.message.split("\n").join("\n    ")}`)
  if (err.files.length) {
    console.error("    Affected files:")
    for (const f of err.files) console.error(`      - ${f}`)
  }
  console.error("")
}
process.exit(1)
