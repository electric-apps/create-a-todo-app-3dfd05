# Validate Generated App

Systematic validation of agent-generated apps using Playwright MCP. Run after the coder finishes building to verify the app works end-to-end.

## Prerequisites

- Playwright MCP server connected (`mcp__playwright__*` tools available)
- App preview URL (from coder's review_request broadcast or container port mapping)
- Coder branch name (from git or orchestrator logs)

## Validation Phases

### Phase 1: App loads without crash

1. Navigate to the preview URL
2. Take a screenshot
3. Check console for errors — ignore `ERR_CONNECTION_REFUSED` (stale tabs) and `__tsd` (dev tooling)
4. If the page shows an error boundary ("Something went wrong"), the app has a critical crash

**Common crashes:**
- `ReferenceError: require is not defined` — CommonJS in ESM, fix: replace with `import`
- `useLiveQuery` related — check destructuring (`{ data }`) and `ssr: false`
- `children is not a function` — `<ClientOnly>` needs render function: `{() => <Foo />}`
- `InvalidWhereExpressionError` — `===` in `.where()`, fix: use `eq()`

### Phase 2: Core UI renders

1. Take a snapshot (accessibility tree)
2. Verify expected elements exist:
   - Navigation / sidebar
   - Main content area
   - Input fields / buttons
   - Settings (if app has user-configurable API keys)

### Phase 3: Settings / Configuration

If the app requires an API key or other configuration:

1. Find and click the settings button/gear icon
2. Enter the API key in the input field
3. Save settings
4. Verify settings dialog closes and the key is stored

**How to type in React-controlled inputs:**
- Use Playwright's native `browser_type` with the element ref
- If that doesn't trigger React state, use `browser_evaluate` with the native setter trick:
```javascript
const ta = document.querySelector('input[type="password"], input[placeholder*="api"], input[placeholder*="key"]');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(ta, 'your-api-key');
ta.dispatchEvent(new Event('input', { bubbles: true }));
```

### Phase 4: Primary user flow

Test the main feature (e.g., create a chat, add a todo, etc.):

1. Trigger the primary action (click "New Chat", "Add Todo", etc.)
2. Wait for navigation / UI update
3. Enter test data
4. Submit
5. Check for errors in console
6. Take a screenshot of the result

**For AI chat apps specifically:**
- Set API key first (Phase 3)
- Create a new conversation
- Send a test message
- Expect either: streaming response (success) or 401 from Anthropic (API key issue — this is a good sign, means the transport works)

### Phase 5: Network health

Check for polling loops or failed requests:

1. Use `browser_network_requests` or `browser_evaluate` with fetch interceptor
2. Look for: repeated requests to the same URL with the same offset (polling loop)
3. Check for 404s on stream endpoints (missing DS service or stream not created yet)
4. Verify SSE connections use `text/event-stream` content type

**Fetch interceptor:**
```javascript
window.__apiLog = [];
const origFetch = window.fetch;
window.fetch = function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
  if (url.includes('/api/')) {
    window.__apiLog.push({ url: url.slice(0, 120), time: Date.now() });
    if (window.__apiLog.length > 100) window.__apiLog.shift();
  }
  return origFetch.apply(this, args);
};
```

Then check for loops:
```javascript
const log = window.__apiLog || [];
const counts = {};
log.forEach(e => { const base = e.url.split('?')[0]; counts[base] = (counts[base] || 0) + 1; });
Object.entries(counts).filter(([,c]) => c > 5).map(([url, count]) => `${count}x ${url}`);
```

## Iteration Protocol

After each validation run:

1. **Document findings** — list each failure with:
   - What failed (screenshot, console error, network issue)
   - Root cause (if identifiable from the error)
   - Which skill should have prevented this

2. **Fix the skill** — update the relevant skill file with:
   - The correct pattern (inline code, not "see examples/")
   - A Common Mistakes entry if the pattern is non-obvious

3. **Clear scaffold cache** — `rm -r scaffold-cache`

4. **Run a new session** — start headless with the same prompt

5. **Verify fixes** — re-run Phases 1-5 on the new app

Repeat up to 5 times. If the same error persists after 3 iterations, the issue is likely in the library code (not the skill) — file a bug.

## Report Template

```markdown
## Validation Report — Iteration N

### App: <description>
### Preview: <url>
### Branch: <branch>

| Phase | Status | Details |
|-------|--------|---------|
| 1. Load | PASS/FAIL | <error if any> |
| 2. UI | PASS/FAIL | <missing elements> |
| 3. Settings | PASS/FAIL | <issue> |
| 4. User flow | PASS/FAIL | <issue> |
| 5. Network | PASS/FAIL | <polling loops, 404s> |

### Fixes Applied
- <skill file>: <what was changed>

### Remaining Issues
- <issue that needs next iteration>
```
