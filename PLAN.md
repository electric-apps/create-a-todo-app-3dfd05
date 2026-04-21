# PLAN.md — Todo App

## App Description

A real-time todo app where users can create, manage, and track tasks with live sync across all open tabs/clients. Supports task completion toggling, priority levels, filtering by status, and inline editing.

---

## User Flows

### Flow 1: View Todo List
1. User opens the app at `/`
2. The page loads with a list of all todos synced live from Postgres via Electric
3. Todos are displayed in a card/list layout showing title, priority badge, and completion checkbox
4. User can switch between filter tabs: **All**, **Active**, **Completed**
5. A footer shows the count of remaining active todos

### Flow 2: Create a Todo
1. User types in the "Add a new todo..." input at the top of the list
2. Optionally selects a priority (Low / Medium / High) from a dropdown — defaults to Medium
3. Presses Enter or clicks the "Add" button
4. The new todo appears optimistically at the top of the list immediately

### Flow 3: Complete / Uncomplete a Todo
1. User clicks the checkbox next to a todo
2. The todo is immediately marked complete/incomplete optimistically
3. Completed todos show with strikethrough text and reduced opacity

### Flow 4: Edit a Todo
1. User double-clicks (or clicks a pencil icon) on a todo title
2. The title becomes an inline editable text field
3. User types the new title and presses Enter (or clicks away) to save
4. Changes are saved optimistically and reconciled with the server

### Flow 5: Delete a Todo
1. User hovers over a todo row — a delete (trash) icon appears
2. User clicks the trash icon
3. The todo is removed optimistically from the list

### Flow 6: Clear Completed
1. A "Clear completed" button appears in the footer when there are completed todos
2. Clicking it deletes all completed todos in a single server operation

---

## Data Model

```typescript
// src/db/schema.ts

import { pgTable, uuid, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const priorityEnum = pgEnum("priority", ["low", "medium", "high"]);

export const todos = pgTable("todos", {
  id:          uuid("id").primaryKey().defaultRandom(),
  title:       text("title").notNull(),
  completed:   boolean("completed").notNull().default(false),
  priority:    priorityEnum("priority").notNull().default("medium"),
  created_at:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

---

## Key Technical Decisions

**Pattern: Standard CRUD app** — this is a todo list with no concurrent rich-text editing, no chat, and no event-log requirements.

| Problem | Product | Reason |
|---|---|---|
| Store todos durably | Postgres via Drizzle | Schema-first, typed migrations |
| Sync todos to all clients live | Electric SQL shapes (`@electric-sql/client`) | Real-time push from Postgres to clients |
| Reactive client queries + optimistic mutations | TanStack DB (`@tanstack/db` + `@tanstack/react-db`) | Live-query hooks + optimistic insert/update/delete |
| Server routes + mutations | TanStack Start (`@tanstack/react-start`) | File-based API routes |
| UI components | shadcn/ui + Tailwind CSS + lucide-react | Pre-installed, accessible |

**No Durable Streams, no Yjs, no StreamDB** — this is a simple CRUD app that doesn't need collaborative editing, event logs, or ephemeral presence state.

---

## Infrastructure

Electric shapes only (no Durable Streams service needed):

- `DATABASE_URL` — Postgres connection string
- `ELECTRIC_SOURCE_ID` — Electric shape source ID
- `ELECTRIC_SECRET` — Electric shape secret

These are provisioned automatically by the orchestrator at session start or via `services create postgres` in the Electric CLI.

---

## Required Skills

The coder must read these intent skills (in node_modules) before writing any code:

### Always required
- `node_modules/@electric-sql/client/skills/electric-new-feature/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/live-queries/SKILL.md`
- `node_modules/@tanstack/db/skills/db-core/collection-setup/SKILL.md`

---

## Routes & API

### Page Routes
| Route | File | Description |
|---|---|---|
| `/` | `src/routes/index.tsx` | Main todo list page (SSR disabled — live queries) |

### API / Server Routes
| Method | Path | File | Description |
|---|---|---|---|
| GET | `/api/shape/todos` | `src/routes/api/shape/todos.ts` | Electric shape proxy (forwards to Electric Cloud with auth headers) |
| POST | `/api/todos` | `src/routes/api/todos.ts` | Create a new todo |
| PATCH | `/api/todos/$id` | `src/routes/api/todos.$id.ts` | Update a todo (title, completed, priority) |
| DELETE | `/api/todos/$id` | `src/routes/api/todos.$id.ts` | Delete a todo |
| DELETE | `/api/todos/completed` | `src/routes/api/todos.completed.ts` | Delete all completed todos |

---

## UI Components

### `src/routes/index.tsx` — Main Page
- `ssr: false` on route options (live queries need client-side only)
- Header with app title "Todo App"
- `<TodoInput />` — new todo creation form
- Filter tabs: All / Active / Completed (local state, no route change)
- `<TodoList />` — renders list of `<TodoItem />` cards
- `<TodoFooter />` — active count + "Clear completed" button

### `src/components/TodoInput.tsx`
- Text input for todo title
- Priority selector (Select from shadcn/ui: Low / Medium / High)
- Submit on Enter key or Add button
- Calls POST `/api/todos` via TanStack DB optimistic insert

### `src/components/TodoItem.tsx`
- Checkbox to toggle `completed`
- Title text (strikethrough when completed)
- Priority badge (color-coded: low=gray, medium=blue, high=red)
- Pencil icon (hover) → inline edit mode for title
- Trash icon (hover) → delete with optimistic removal

### `src/components/TodoList.tsx`
- Accepts `filter: "all" | "active" | "completed"` prop
- Uses `useLiveQuery` from `@tanstack/react-db` to read from the todos collection
- Filters results client-side based on filter prop
- Shows empty state when no todos match the filter

### `src/components/TodoFooter.tsx`
- Displays "X items left" count of active (not completed) todos
- "Clear completed" button — calls DELETE `/api/todos/completed`
- Only shows "Clear completed" when there are completed todos

---

## Implementation Tasks

### Phase 1: Schema + Migrations
- [ ] Create `src/db/schema.ts` with `priorityEnum` and `todos` table (per data model above)
- [ ] Generate initial migration with `drizzle-kit generate`
- [ ] Apply migration with `drizzle-kit migrate`

### Phase 2: Electric Shape Proxy
- [ ] Create `/api/shape/todos` route that proxies Electric shape requests to Electric Cloud with `ELECTRIC_SOURCE_ID` and `ELECTRIC_SECRET` headers

### Phase 3: Server API Routes
- [ ] `POST /api/todos` — validate with drizzle-zod, insert into Postgres, return created todo
- [ ] `PATCH /api/todos/$id` — validate partial update, update `updated_at`, write to Postgres
- [ ] `DELETE /api/todos/$id` — delete single todo by ID
- [ ] `DELETE /api/todos/completed` — delete all rows where `completed = true`

### Phase 4: TanStack DB Collection
- [ ] Create `src/lib/todos-collection.ts` — set up the todos collection using `@tanstack/db` pointing at the Electric shape proxy, with `parser` for `timestamptz` fields and `schema` with `z.coerce.date()` for `created_at` and `updated_at`

### Phase 5: UI — Main Page + Components
- [ ] `src/routes/index.tsx` — page shell with `ssr: false`, filter state, layout
- [ ] `src/components/TodoInput.tsx` — creation form with priority selector
- [ ] `src/components/TodoList.tsx` — live-queried list with filter prop
- [ ] `src/components/TodoItem.tsx` — individual row with checkbox, inline edit, delete
- [ ] `src/components/TodoFooter.tsx` — active count + clear completed

### Phase 6: Polish
- [ ] Empty state illustration/message when no todos exist or none match filter
- [ ] Keyboard accessibility (Enter to add, Escape to cancel edit)
- [ ] Responsive layout (mobile-friendly single column)
- [ ] Write `README.md` with setup and run instructions

---

## Parallel Work

### Sequential (must be in order)
1. Phase 1: Schema + Migrations
2. Phase 2: Electric Shape Proxy (depends on schema knowing the table name)
3. Phase 4: TanStack DB Collection (depends on proxy route existing)

### Parallel Group A (after Phase 1, can run concurrently with Phase 2)
- [ ] Phase 3: All four server API routes

### Parallel Group B (after Phase 3 + Phase 4)
- [ ] `src/routes/index.tsx` page shell
- [ ] `src/components/TodoInput.tsx`
- [ ] `src/components/TodoList.tsx`
- [ ] `src/components/TodoItem.tsx`
- [ ] `src/components/TodoFooter.tsx`

### Sequential (final)
- Phase 6 polish + README (after all components are wired up)
