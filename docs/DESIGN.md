# Agent OS Design Rules

Agent OS must look and behave like one coherent app across all installed themes.

## Non-negotiable: use theme tokens

All new dashboard sections, cards, panels, badges, containers, and custom UI blocks must use the app theme tokens. Do **not** hard-code visual colors for text, borders, or container backgrounds.

Use these by default:

- Text: `text-foreground`, `text-card-foreground`, `text-muted-foreground`, `text-primary`, `text-destructive`
- Backgrounds: `bg-background`, `bg-card`, `bg-muted`, `bg-popover`, `bg-primary`, `bg-destructive`
- Borders: `border-border`, `border-input`, `border-primary`, `border-destructive`
- Components: prefer `Card`, `Badge`, `Button`, `Alert`, `Tabs`, and other `src/components/ui/*` primitives before custom containers.

Avoid these in runtime dashboard containers:

- `text-white`
- `text-slate-*`, `text-cyan-*`, `text-violet-*`, `text-emerald-*`, `text-amber-*`, `text-rose-*`, `text-blue-*`, `text-pink-*`, `text-zinc-*`
- `bg-slate-*`, `bg-cyan-*`, `bg-violet-*`, `bg-emerald-*`, etc.
- `border-slate-*`, `border-cyan-*`, `border-violet-*`, `border-emerald-*`, etc.

Those classes may look fine in one theme and become unreadable in another.

## Container rule

Do not create “special” colored sections unless there is a strong product reason.

Default pattern:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
    <CardDescription>Description</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

If a section needs custom layout, keep styling semantic:

```tsx
<section className='rounded-3xl border bg-card p-5 text-card-foreground shadow-sm'>
  <p className='text-muted-foreground'>...</p>
</section>
```

## Accent rule

Accents should come from theme-aware primitives:

- Prefer `Badge variant='outline'`, `Badge variant='secondary'`, `Button variant='outline'`, `Button variant='secondary'`.
- If you need a dot/icon accent, use `bg-primary`, `text-primary`, or `text-muted-foreground`.
- Avoid “cyan means X, violet means Y” unless the colors are mapped through CSS variables or a component designed for all themes.

## Shared code rule

If the same card/section pattern appears twice, extract a small shared component instead of duplicating custom classes.

Good candidates:

- status cards
- metric cards
- review/action rows
- section headers
- empty states
- source/meta pills

## Guardrail

`npm run check:runtime-mocks` also runs `scripts/check-theme-containers.mjs`.

That guard blocks hard-coded accent color classes in key dashboard containers:

- `src/app/dashboard/overview/page.tsx`
- `src/app/dashboard/action-center/page.tsx`
- `src/app/dashboard/knowledge/page.tsx`

If the guard fails, replace the hard-coded color with theme tokens or move the visual into a reusable theme-safe component.

## Why

Felipe uses multiple themes. Agent OS is a cockpit/control plane, not a one-off landing page. Readability and consistency matter more than flashy custom gradients.
