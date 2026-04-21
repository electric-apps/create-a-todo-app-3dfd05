---
name: ui-design
description: Design system reference for building UIs with shadcn/ui + Tailwind CSS. Covers theming, typography, spacing, component patterns, and anti-patterns.
---

# UI Design System — shadcn/ui + Tailwind CSS

## Theme Configuration

Apps use shadcn/ui's CSS variable system in `src/styles.css`. Dark mode is enabled via `class="dark"` on the html element.

Key variables to customize per app:
- `--background` / `--foreground` — page background and text
- `--primary` / `--primary-foreground` — brand color for buttons, links, accents
- `--secondary` / `--secondary-foreground` — secondary actions
- `--muted` / `--muted-foreground` — subdued backgrounds and text
- `--accent` / `--accent-foreground` — highlights, hover states
- `--destructive` — delete/error actions
- `--border` — borders and dividers
- `--radius` — border radius scale

## Typography

Use Tailwind text classes for a clear hierarchy:
| Role | Classes | Example |
|------|---------|---------|
| Page title | `text-3xl font-bold tracking-tight` | Dashboard |
| Section heading | `text-xl font-semibold` | Recent Activity |
| Card title | `text-lg font-medium` | User Profile |
| Body text | `text-sm text-muted-foreground` | Last updated 2 hours ago |
| Label | `text-sm font-medium` | Email Address |
| Caption | `text-xs text-muted-foreground` | 3 items remaining |

## Spacing (8px Grid)

| Tailwind | Pixels | Use |
|----------|--------|-----|
| `gap-1` / `p-1` | 4px | Tight: icon + text |
| `gap-2` / `p-2` | 8px | Related items |
| `gap-3` / `p-3` | 12px | Within components |
| `gap-4` / `p-4` | 16px | Component padding |
| `gap-6` / `p-6` | 24px | Between groups |
| `gap-8` / `p-8` | 32px | Section spacing |
| `gap-12` / `p-12` | 48px | Major sections |

## Component Patterns

### Page Layout
```tsx
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

export function PageLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-1">Manage your items</p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" /> Add New
        </Button>
      </div>
      {children}
    </div>
  )
}
```

### Card List
```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

function ItemCard({ item }: { item: Item }) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{item.name}</CardTitle>
          <Badge variant={item.active ? "default" : "secondary"}>
            {item.active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <CardDescription>{item.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{item.details}</p>
      </CardContent>
    </Card>
  )
}
```

### Dialog Form
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function CreateDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Create New</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Enter name..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" placeholder="Enter description..." />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Empty State
```tsx
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Inbox, Plus } from "lucide-react"

function EmptyState({ title, description, action }: { title: string; description: string; action?: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 px-8 text-center border-dashed">
      <Inbox className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">{description}</p>
      {action && (
        <Button onClick={action}>
          <Plus className="h-4 w-4 mr-2" /> Get Started
        </Button>
      )}
    </Card>
  )
}
```

### Loading Skeleton
```tsx
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-48 mt-2" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4 mt-2" />
      </CardContent>
    </Card>
  )
}
```

### Data Grid
```tsx
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
  {items.map((item) => (
    <ItemCard key={item.id} item={item} />
  ))}
</div>
```

## Anti-Patterns

- **Raw HTML elements** — use shadcn components (Button not button, Card not div)
- **Inline styles** — use Tailwind utility classes
- **Hardcoded colors** — use CSS variables (text-primary, bg-muted, etc.)
- **Missing states** — always handle empty, loading, and error states
- **Flat hierarchy** — use clear visual grouping with Card, Separator, spacing
- **No hover/focus** — interactive elements need visible feedback
- **Fixed widths** — use responsive classes (sm:, md:, lg: breakpoints)
