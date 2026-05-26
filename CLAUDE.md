# CLAUDE.md

This is Agent OS: Felipe × Cai's local-first OpenClaw cockpit built on Next.js 16 + shadcn/ui. It is no longer a generic dashboard starter.

## Key References

- **[AGENTS.md](./AGENTS.md)** — Current coding-agent contract, stack, structure, conventions, validation
- **[README.md](./README.md)** — Active product surfaces and build stance
- **[docs/COPILOT_INVENTORY.md](./docs/COPILOT_INVENTORY.md)** — Real/removed surfaces, missing pieces, no-mock guardrail
- **[docs/BRIDGE_CONTRACTS.md](./docs/BRIDGE_CONTRACTS.md)** — Bridge/API contracts
- **[docs/forms.md](./docs/forms.md)** — Form system: TanStack Form + Zod, composable fields, validation, multi-step, sheet/dialog forms
- **[docs/themes.md](./docs/themes.md)** — Theme system: OKLCH colors, adding themes, font config
- **[docs/nav-rbac.md](./docs/nav-rbac.md)** — Navigation RBAC and visibility rules

## Critical Conventions

- **React Query** for all data fetching — `void prefetchQuery()` on server + `useSuspenseQuery` on client (standard TanStack pattern), `useMutation` for forms, `HydrationBoundary` + `dehydrate` for hydration, `<Suspense fallback>` for streaming
- **API layer** per feature — `api/types.ts` → `api/service.ts` → `api/queries.ts`; queries use key factories (`entityKeys.all/list/detail`); components import from service and queries, never from mock APIs directly
- **nuqs** for URL search params — `searchParamsCache` on server, `useQueryStates` on client, use `getSortingStateParser` for sort (same parser as `useDataTable`)
- **Icons** — only import from `@/components/icons`, never from `@tabler/icons-react` directly
- **Forms** — use `useAppForm` + `useFormFields<T>()` from `@/components/ui/tanstack-form`
- **Page headers** — use `PageContainer` props (`pageTitle`, `pageDescription`, `pageHeaderAction`), never import `<Heading>` manually
- **Formatting** — single quotes, JSX single quotes, no trailing comma, 2-space indent
