# Electric Design System

The official visual identity for apps built with Electric SQL. Dark-first, purple-accented, generous whitespace, warm typography. Derived from the Electric Studio UI.

---

## 1. Visual Theme & Atmosphere

**Mood:** Technical yet warm. Professional but not corporate. The UI should feel like a well-crafted developer tool — precise, clean, with subtle depth. Think Linear meets Supabase.

**Key adjectives:** Dark, precise, purple-accented, spacious, translucent

**Dark mode is the default and primary experience.** Light mode is optional and secondary. Design for dark first.

---

## 2. Color Palette & Roles

### Backgrounds
| Token | Hex | Role |
|-------|-----|------|
| `--background-alt` | `#161618` | Chrome surfaces: sidebars, footers, code copy strip — sits BELOW page bg |
| `--background` | `#1b1b1f` | Page background |
| `--card` | `#202127` | Elevated surfaces: cards, panels, modals |
| `--popover` | `#202127` | Dropdowns, popovers, sheets |
| `--muted` | `#2a2a32` | Opaque hover states and input fills (reserve for interactive feedback only — the live brand uses translucent overlays instead) |

The four-step ladder — `#161618` → `#1b1b1f` → `#202127` → `#2a2a32` — matches electric-sql.com's rendered VitePress theme. The darker-than-page `#161618` floor gives the elevation ladder somewhere to bottom out, so `#1b1b1f` feels like the middle of the stack rather than the deepest surface. Without it, the whole app reads "flatly dark".

### Borders
| Token | Value | Role |
|-------|-------|------|
| `--border` | `#2a2c34` (or `rgba(42, 44, 52, 0.5)` over `--card`) | Default borders, dividers — **soft, nearly melts into the card** |
| `--input` | `#3c3f44` | Input field borders — slightly stronger for form affordance |
| `--ring` | `#d0bcff` | Focus rings (purple glow) |

⚠️ `--border` at `#2a2c34` is intentionally subtle. Electric's live site uses `rgba(42, 44, 52, 0.5)` over the card surface, producing borders that are ~80% less contrasty than the old `#3a3a44` value. Cards should look like gentle elevations, not pinstriped panels. If a border feels invisible, add 2–4px of padding rather than bumping the border color.

### Text
| Token | Value | Role |
|-------|-------|------|
| `--foreground` | `rgba(255, 255, 245, 0.92)` | Primary text (warm white, NOT pure white) |
| `--muted-foreground` | `rgba(235, 235, 245, 0.8)` | Secondary body text, labels, metadata |
| `--caption-foreground` | `rgba(235, 235, 245, 0.68)` | Extra-quiet captions only (timestamps, file sizes, "press ⌘K to search") |
| `--card-foreground` | `rgba(255, 255, 245, 0.92)` | Text on cards |

Body copy / secondary labels use `--muted-foreground` at **`.8` alpha**, not `.68`. Matches the live site's `--vp-c-text-2`. Reserve `.68` for genuine captions where you deliberately want the text to recede.

### Brand — Purple Spectrum
| Name | Hex | Role |
|------|-----|------|
| Primary | `#d0bcff` | Primary actions, links, active states, focus rings |
| Secondary | `#998fe7` | Secondary buttons, badges, accents |
| Tertiary | `#7e78db` | Subtle accents, borders on hover |
| Primary foreground | `#1b1b1f` | Text on primary-colored buttons |

### Product Accents
| Name | Hex | Role |
|------|-----|------|
| Electric green | `#00d2a0` | Electric SQL product references only — NOT for generic "success" |
| TanStack orange | `#ff8c3b` | Warnings, TanStack product references |
| Durable cyan | `#75fbfd` | Info accents, Durable Streams product references |

### Semantic Colors
| Role | Hex | Usage |
|------|-----|-------|
| Success | `#d0bcff` | Use **purple** for success — NOT green |
| Warning | `#d29922` | Warnings, approaching deadlines |
| Error/Destructive | `#f85149` | Errors, delete actions, validation failures |
| Info | `#9ecbff` | Informational badges, help text |

### CRITICAL: Color Rules
- **NEVER use green for success states** — green is reserved for the Electric SQL product brand
- **Purple IS the success color** — checkmarks, confirmations, completed states all use `#d0bcff`
- Avoid saturated colors on large surfaces — use them for accents, badges, and small UI elements
- Background surfaces use the grey ladder `#161618` → `#1b1b1f` → `#202127`, with `#2a2a32` reserved for opaque hover states only. Never tint backgrounds purple.
- Borders are soft (`#2a2c34` or a translucent `rgba(42, 44, 52, 0.5)` over the card), never loud. Cards should look like gentle elevations, not outlined boxes.

---

## 3. Typography Rules

### Font Stack
- **Primary:** Inter, system-ui, sans-serif (clean, modern, excellent at small sizes)
- **Monospace:** Source Code Pro, ui-monospace, Consolas (for code blocks, technical data)

### Hierarchy
| Role | Tailwind Classes | Size | Weight |
|------|-----------------|------|--------|
| Page title | `text-3xl font-bold tracking-tight` | 30px | 700 |
| Section heading | `text-xl font-semibold` | 20px | 600 |
| Card title | `text-lg font-medium` | 18px | 500 |
| Body text | `text-sm` | 14px | 400 |
| Label | `text-sm font-medium` | 14px | 500 |
| Secondary text | `text-sm text-muted-foreground` | 14px | 400 |
| Caption/metadata | `text-xs text-muted-foreground` | 12px | 400 |
| Code inline | `text-sm font-mono` | 14px | 400 |

### Rules
- Headings are warm white (`--foreground`), body text can be muted
- Never use pure `#ffffff` — always warm white `rgba(255, 255, 245, 0.92)`
- Large numbers/stats: `text-4xl font-bold tabular-nums`
- Tracking: tight on headings (`tracking-tight`), normal on body

---

## 4. Component Stylings

### Buttons
```
Primary:    bg-[#d0bcff] text-[#1b1b1f] hover:bg-[#c4aef5]     (purple bg, dark text)
Secondary:  bg-[#2a2a32] text-foreground hover:bg-[#3a3a44]     (muted bg, hover steps up one grey)
Outline:    border-[#2a2c34] text-foreground hover:bg-[#2a2a32] (ghost with soft border)
Destructive: bg-[#f85149]/10 text-[#f85149] hover:bg-[#f85149]/20 (red tint, not solid red)
Ghost:      text-muted-foreground hover:text-foreground hover:bg-[#2a2a32]
```

### Cards
- Background: `#202127` (one step above page)
- Border: `1px solid #2a2c34` (soft — nearly melts into the card surface)
- Border radius: `0.75rem` (rounded-xl)
- Hover: `border-color: #d0bcff/30` (subtle purple glow)
- Padding: `p-6` (24px)
- No heavy shadows — use border for depth

### Inputs
- Background: `#2a2a32`
- Border: `1px solid #3c3f44` (slightly stronger than the card border so form affordance reads clearly)
- Focus: `ring-2 ring-[#d0bcff]/50` (purple focus ring)
- Placeholder: `text-muted-foreground`
- Border radius: `0.5rem` (rounded-lg)

### Badges
- Default: `bg-[#d0bcff]/10 text-[#d0bcff]` (purple tint)
- Secondary: `bg-[#2a2a32] text-muted-foreground`
- Warning: `bg-[#d29922]/10 text-[#d29922]`
- Error: `bg-[#f85149]/10 text-[#f85149]`
- Use tinted backgrounds (10-20% opacity), never solid colored badges

### Dialogs & Sheets
- Background: `#202127`
- Overlay: `rgba(0, 0, 0, 0.6)` with backdrop blur
- Border: `1px solid #2a2c34` (soft — matches card border)
- Header: clear title, optional description in muted text
- Always include a close mechanism (X button or Cancel)

### Footer (MANDATORY)
Every app MUST include a footer with the Electric branding. Place it at the bottom of the page layout:

```tsx
<footer className="border-t border-[#2a2c34] py-6 mt-auto">
  <div className="container mx-auto max-w-5xl px-4 flex items-center justify-between text-xs text-muted-foreground">
    <div className="flex items-center gap-2">
      <svg className="h-4 w-4" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
        <path d="M106.992 16.1244C107.711 15.4029 108.683 15 109.692 15H170L84.0082 101.089C83.2888 101.811 82.3171 102.213 81.3081 102.213H21L106.992 16.1244Z" fill="#d0bcff" />
        <path d="M96.4157 104.125C96.4157 103.066 97.2752 102.204 98.331 102.204H170L96.4157 176V104.125Z" fill="#d0bcff" />
      </svg>
      <span>Built with <a href="https://electric-sql.com" target="_blank" rel="noopener noreferrer" className="text-[#d0bcff] hover:underline">Electric</a></span>
    </div>
    <span>© {new Date().getFullYear()} Electric SQL</span>
  </div>
</footer>
```

The footer must be inside the root layout so it appears on every page. Use `mt-auto` on the footer and `min-h-screen flex flex-col` on the body/main wrapper to push it to the bottom.

---

## 5. Layout Principles

### Spacing Scale (8px Grid)
| Tailwind | Pixels | Use Case |
|----------|--------|----------|
| `gap-1` | 4px | Icon + text pairing |
| `gap-2` | 8px | Related items within a group |
| `gap-3` | 12px | Form fields, list items |
| `gap-4` | 16px | Component internal padding |
| `gap-6` | 24px | Between content groups |
| `gap-8` | 32px | Between major sections |
| `gap-12` | 48px | Page-level section breaks |

### Container
- Max width: `max-w-5xl` (1024px) for content pages
- Max width: `max-w-7xl` (1280px) for dashboard/data-dense pages
- Horizontal padding: `px-4 sm:px-6 lg:px-8`
- Vertical padding: `py-8` minimum for page content

### Page Structure
```
div (min-h-screen, flex flex-col)
  header (h-14, border-b, sticky top-0)
    logo + nav + actions (justify-between)
  main (flex-1, overflow-auto)
    container (max-w, mx-auto, px, py)
      page-title + actions (justify-between, mb-8)
      content
  footer (border-t, py-6, mt-auto)
    Electric branding + copyright (see Component Stylings > Footer)
```

### Whitespace Philosophy
- **Generous by default** — when in doubt, add more space
- Headers: `mb-8` gap before content
- Cards in a grid: `gap-4` minimum
- Form fields: `gap-4` between fields, `gap-6` between groups
- Never let content touch edges — minimum `p-4` on all containers

---

## 6. Depth & Elevation

### Surface Hierarchy
1. **Chrome / sidebar / footer** — `#161618` (deepest — gives the elevation ladder a floor)
2. **Page** — `#1b1b1f` (main content surface)
3. **Card / Panel** — `#202127` (elevated one step above the page)
4. **Hover / Active** — `#2a2a32` (interactive feedback only; prefer translucent `rgba(255, 255, 255, 0.06)` overlays where possible)
5. **Popover / Dialog** — `#202127` + backdrop blur + `rgba(0, 0, 0, 0.6)` overlay

### Shadows
- Avoid heavy box-shadows — the dark theme provides natural depth via background contrast
- Use `shadow-sm` sparingly on popovers/dropdowns only
- Prefer border (`border-[#2a2c34]`) for visual separation over shadows

### Translucency
- Card backgrounds can use `bg-[#202127]/80 backdrop-blur-sm` for a translucent glass effect
- Use sparingly — one translucent surface per view maximum
- Navigation and header benefit most from translucency

---

## 7. Do's and Don'ts

### DO
- Use purple (`#d0bcff`) as the dominant accent color
- Use dark surfaces with subtle borders for depth
- Use warm white text (never pure `#fff`)
- Include empty states with icons, messages, and call-to-action buttons
- Include loading skeletons for async content
- Add hover states to all interactive elements
- Use `transition-colors duration-150` on interactive elements
- Use monospace font for IDs, hashes, code, and technical data

### DON'T
- Use green for success — purple is success in the Electric brand
- Use heavy box-shadows — depth comes from background contrast
- Use saturated colors on large surfaces — tint at 10-20% opacity
- Use pure white (`#ffffff`) for text — use warm white
- Use pure black (`#000000`) for backgrounds — use `#1b1b1f`
- Create flat layouts with no visual hierarchy — use Card, Separator, spacing
- Skip hover/focus states on interactive elements
- Use centered-everything layouts — use `justify-between`, asymmetric spacing
- Use `@radix-ui/themes` — use shadcn/ui components with Tailwind

---

## 8. Responsive Behavior

### Breakpoints
| Breakpoint | Width | Behavior |
|------------|-------|----------|
| Default | < 640px | Single column, stacked layout, hamburger nav |
| `sm:` | 640px | Two-column grids begin |
| `md:` | 768px | Sidebar becomes visible |
| `lg:` | 1024px | Full layout, three-column grids |
| `xl:` | 1280px | Max content width reached |

### Mobile Rules
- Touch targets: minimum 44px height for buttons and interactive elements
- Navigation: collapse to hamburger or bottom tabs below `md:`
- Cards: stack to single column below `sm:`
- Dialogs: full-screen sheet below `sm:`, centered modal above
- Tables: horizontal scroll or card-based layout below `md:`

---

## 9. CSS Variable Override for shadcn/ui

Apply this to `src/styles.css` to theme shadcn components with the Electric brand:

```css
.dark {
  /* Chrome surface (sidebar, footer, code copy strip) — darker than the
     page so the elevation ladder has a floor. #161618 from the live site's
     VitePress --vp-c-bg-alt. */
  --sidebar: oklch(0.15 0.003 285);
  --sidebar-foreground: oklch(0.95 0.005 90);
  --sidebar-border: oklch(0.25 0.007 265);

  --background: oklch(0.14 0.005 285);      /* #1b1b1f */
  --foreground: oklch(0.95 0.005 90);        /* warm white */

  --card: oklch(0.17 0.005 285);             /* #202127 */
  --card-foreground: oklch(0.95 0.005 90);
  --popover: oklch(0.17 0.005 285);
  --popover-foreground: oklch(0.95 0.005 90);

  --primary: oklch(0.8 0.12 290);            /* #d0bcff brand purple */
  --primary-foreground: oklch(0.14 0.005 285);

  --secondary: oklch(0.22 0.005 285);        /* #2a2a32 — opaque hover */
  --secondary-foreground: oklch(0.95 0.005 90);
  --muted: oklch(0.22 0.005 285);            /* #2a2a32 — opaque hover */

  /* Body copy at 0.8 alpha, matches live site --vp-c-text-2.
     Was 0.7 (≈ 0.68 alpha) — too dim, made the whole UI feel dark. */
  --muted-foreground: oklch(0.78 0.004 285);

  --accent: oklch(0.22 0.005 285);
  --accent-foreground: oklch(0.95 0.005 90);
  --destructive: oklch(0.6 0.2 25);          /* #f85149 */

  /* Borders softened: was oklch(0.3 ...) ≈ #3a3a44, now ≈ #2a2c34.
     Cuts border luminance ~25% so cards no longer look pinstriped. */
  --border: oklch(0.25 0.007 265);
  --input: oklch(0.3 0.005 285);             /* slightly stronger on inputs */
  --ring: oklch(0.8 0.12 290);               /* purple focus glow */

  --radius: 0.75rem;
}
```

This maps the Electric hex palette to oklch values for shadcn's CSS variable system. Three values were tuned from an earlier draft after auditing the live electric-sql.com CSS: `--border` softened, `--muted-foreground` brightened, and `--sidebar*` added as a darker chrome surface. See Section 6 "Surface Hierarchy" for the rationale.
