---
name: ""
overview: ""
todos: []
isProject: false
---

# Mobile Sealed Query Layer (`c4f8a2b1`)

> **Status:** PLANNED — awaiting Jonathan's go on §1 decisions before scaffolding.
> **Scope:** `wabbus-mobile/` only. No backend, web, admin, vendor, or support changes.
> **Out of scope:** NestJS envelope unification (deferred to a separate decision after this lands), persistence/offline cache (no persister wired today), web/admin/vendor sealed layers (separate, sequential projects).

---

## §0 — The rule we are enforcing

> **For every query key, exactly one module is allowed to write to that key. All readers consume from a hook in that module. All writers (queryFn, `setQueryData`, optimistic mutation `onMutate`) live in that module. Everywhere else, the only legal cache operation is `invalidateQueries`.**

Corollary rules:

1. **No API-shape transforms outside the query layer.** Components may derive UI state from cached data with `useMemo`. They may not reshape the response.
2. **Validation is the writer's contract.** Every queryFn validates the response with a schema before returning. On parse failure: `removeQueries(key)` + Sentry breadcrumb + throw. The cache is self-healing.
3. **The only thing the rest of the app may import from `@tanstack/react-query`** is `useQueryClient` for the purpose of typed invalidation helpers. Everything else (`useQuery`, `useInfiniteQuery`, `useMutation`, `setQueryData`, `setQueriesData`, `getQueryData`, `removeQueries`) lives behind `lib/queries/`.

The bug class this eliminates: two pieces of code disagreeing about the shape cached under the same key. The handoff (`.cursor/handoff-query-key-shape-collisions.md`) documents one shipped instance and two latent instances of exactly this bug. The latent ones are fixed *as a byproduct* of migrating their domains, not as separate hotfixes.

---

## §1 — Decisions (LOCKED)

### Decision 1: Validator — Valibot ✓ (LOCKED)


|                           | Valibot 1.x                                 | Zod 3.x   |
| ------------------------- | ------------------------------------------- | --------- |
| Bundle (min+gz)           | ~2 KB tree-shaken                           | ~13 KB    |
| API surface we'd use      | identical (object, parse, safeParse, infer) | identical |
| Ecosystem                 | smaller                                     | larger    |
| Hermes parse/startup cost | smaller                                     | larger    |
| Familiarity               | less                                        | more      |


The schemas live in one place and we use ~5% of either library's API. The bundle and startup-time advantage on mobile is material; the familiarity gap is negligible for the surface we touch. Valibot's `v.object({...})` + `v.parse(schema, data)` is the entire vocabulary we need.

**If you'd rather Zod for ecosystem reasons, that's a fine call** — the abstraction inside `lib/queries/` hides the choice; we could swap later with a single sed pass.

### Decision 2: Enforcement — three-layer stack ✓ (LOCKED)

A global alias of `@tanstack/react-query` was rejected as fragile (third-party libs that import the package directly would be silently broken or require per-package alias exceptions; future TanStack upgrades would carry alias drift). Instead, enforcement is a three-layer stack where each layer has a different job, and all three must be defeated for a violation to ship:

**Layer 1 — Module topology (the actual architectural constraint).**

The only file in the entire repo that imports `@tanstack/react-query` is `lib/queries/_internal/react-query.ts`, which re-exports the surface used internally by the sealed module. Every other file in `lib/queries/`** imports from `@/lib/queries/_internal/react-query`. App code imports only from `@/lib/queries` (the public barrel), which exposes typed hooks, typed mutation hooks, the `invalidate` helper, and canonical types — nothing else.

```
APP CODE
   ↓ (imports from)
@/lib/queries  (public barrel — typed hooks + invalidate + types only)
   ↓
lib/queries/<domain>.ts
   ↓ (imports from)
@/lib/queries/_internal/react-query  (the single bridge to the real package)
   ↓
@tanstack/react-query
```

This is the structural enforcement: bypassing it requires a developer to deliberately add a new import path that doesn't exist in any reviewed file. Not a typo, not a copy-paste — an intentional architectural change.

**Layer 2 — ESLint (developer-time signal).**

`no-restricted-imports` rule, scoped to two patterns:

1. `@tanstack/react-query` is forbidden everywhere except `lib/queries/_internal/react-query.ts`.
2. `@/lib/queries/_internal/`** is forbidden everywhere except `lib/queries/`**.

Three new dev deps (`eslint`, `@typescript-eslint/parser`, optionally `eslint-config-expo` for parser sanity). No full lint setup; just this one rule. Editor squiggles + pre-commit fail. Bypassable with disable comments — that's why it's not the only layer.

**Layer 3 — CI grep (merge-time gate, deterministic redundancy).**

`scripts/check-query-imports.sh` — five lines of `grep -rn` that hard-fail the build on the same two patterns. Intentionally dumb: no AST, no config drift, no dependency on ESLint correctness. If ESLint config breaks or a developer ignores the rule, this still fails the build.

**Why this combination is production-grade:** to ship a violation, a developer must (a) ignore the editor signal, (b) bypass the ESLint rule with a disable comment, (c) defeat the CI grep, *and* (d) intentionally restructure the import topology. Each layer is independent — none depends on the others being correctly configured. The bug class becomes non-accidental.

### Decision 3: Typed invalidation surface ✓ (LOCKED)

The rest of the app does not know query keys exist. The only cache-coordination API exposed to app code is the typed `invalidate` module:

```ts
// lib/queries/invalidate.ts
export const invalidate = {
  orders: {
    detail: (id: string) => qc().invalidateQueries({ queryKey: ['orders', 'detail', String(id)] }),
    list: () => qc().invalidateQueries({ queryKey: ['orders', 'list'] }),
    all: () => qc().invalidateQueries({ queryKey: ['orders'] }),
  },
  // ...
};
```

Call sites: `await invalidate.orders.detail(id)`. No raw key strings escape the module. The enforcement layers above ban `useQueryClient` and `queryKeys.*` imports in app code; only the typed helpers are legal.

This is non-negotiable: the corollary of "single writer per key" is "single coordinator per cache cell." Allowing `useQueryClient().invalidateQueries(queryKeys.x.y(z))` from anywhere reintroduces stringly-typed key construction at call sites and gives the bad import surface a foot in the door — which defeats the whole point.

---

## §2 — Architecture

### File layout

```
lib/queries/
├── index.ts              # public re-exports (every typed hook in the system)
├── _internal/
│   └── react-query.ts    # ONLY file in repo that imports from @tanstack/react-query
├── _client.ts            # internal: getQueryClient() accessor for invalidate.ts
├── _validate.ts          # internal: parseOrThrow(schema, data, key) helper
├── invalidate.ts         # typed invalidation helpers (the only cross-domain export besides hooks)
├── orders.ts             # useOrderDetail, useOrdersList, mutations, schemas, keys
├── messages.ts           # conversations, tickets, cases — read + mutation hooks, schemas, keys
├── recommendations.ts    # home, product, strategy, category, context, postPurchase
├── cart.ts
├── addresses.ts
├── paymentMethods.ts
├── products.ts           # detail + list
├── categories.ts
├── vendors.ts
├── returns.ts
├── search.ts             # if it uses TanStack Query (TBD during search migration)
├── me.ts
└── storeCredit.ts
```

### What lives in a domain file (canonical example: `orders.ts`)

```ts
// 1. Schemas (Valibot) — co-located with the hooks that own them
const OrderItemSchema = v.object({ /* ... */ });
const OrderSchema = v.object({ /* ... */ });
const OrderEnvelopeSchema = v.object({ order: OrderSchema });
const OrdersListResponseSchema = v.object({
  data: v.array(OrderSchema),
  pagination: v.nullable(PaginationSchema),
});

// 2. Inferred types (the canonical types for the rest of the app to consume)
export type Order = v.InferOutput<typeof OrderSchema>;
export type OrderItem = v.InferOutput<typeof OrderItemSchema>;

// 3. Keys (private to this module — never exported)
const keys = {
  detail: (id: string) => ['orders', 'detail', String(id)] as const,
  list: (params?: Record<string, unknown>) => ['orders', 'list', params] as const,
  all: () => ['orders'] as const,
};

// 4. Read hooks (the ONLY way to read orders data anywhere in the app)
export function useOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: keys.detail(id ?? ''),
    queryFn: () => fetchOrderDetail(id!),
    enabled: !!id,
  });
}

// 5. Mutation hooks (the ONLY way to write orders data anywhere in the app)
export function useCancelOrder() {
  return useMutation({
    mutationFn: (input: CancelOrderInput) => /* ... */,
    onMutate: /* optimistic update — only legal here */,
    onSuccess: () => invalidate.orders.all(),
  });
}

// 6. Internal queryFn — does the fetch, validates, returns canonical shape
async function fetchOrderDetail(id: string): Promise<Order> {
  const raw = await customerFetch<unknown>(`/orders/by-public-id/${id}`);
  // Endpoint returns either { order: {...} } or {...} depending on history.
  // Normalize once, here, then validate.
  const candidate = (raw && typeof raw === 'object' && 'order' in raw)
    ? (raw as { order: unknown }).order
    : raw;
  return parseOrThrow(OrderSchema, candidate, keys.detail(id));
}
```

### `_validate.ts` — the self-healing contract

```ts
import * as v from 'valibot';
import * as Sentry from '@sentry/react-native';
import { getQueryClient } from './_client';

export function parseOrThrow<TSchema extends v.GenericSchema>(
  schema: TSchema,
  data: unknown,
  queryKey: readonly unknown[],
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, data);
  if (result.success) return result.output;

  // Self-heal: evict the bad cache entry so the next mount refetches cleanly.
  getQueryClient().removeQueries({ queryKey });
  Sentry.addBreadcrumb({
    category: 'cache.shape',
    level: 'error',
    message: 'Query response failed schema validation; cache entry evicted.',
    data: { queryKey: JSON.stringify(queryKey), issues: result.issues.slice(0, 5) },
  });
  throw new Error(`Schema validation failed for ${JSON.stringify(queryKey)}`);
}
```

The throw lets the calling `useQuery` enter `error` state with the existing retry policy in `lib/queryClient.ts`. After eviction, the next mount or refetch calls the queryFn fresh against the live API — no stale-shape persistence possible.

### Public surface of `lib/queries/index.ts`

```ts
// Read hooks
export { useOrderDetail, useOrdersList } from './orders';
export { useConversationsList, useConversationDetail, /* ... */ } from './messages';
// ... one line per hook ...

// Mutation hooks
export { useCancelOrder, useReturnOrderItem, /* ... */ } from './orders';
// ...

// Invalidation
export { invalidate } from './invalidate';

// Canonical types (for component prop typing)
export type { Order, OrderItem } from './orders';
// ...
```

Nothing else. No keys, no queryFns, no schemas, no `queryClient`. The app reaches the cache exclusively through this surface.

---

## §3 — Migration order and per-domain "done" definition

Order is by risk × known-bug-presence × traffic:

1. `**orders**` — 7 callers, includes the `SelectableItem[]` outlier in `support/message-seller/[orderId].tsx`. Highest blast radius if wrong.
2. `**messages**` — already half-fixed; finish properly, remove the read-side `useMemo` belt-and-suspenders in `app/account/messages.tsx`, audit `useLiveChat` for any cache touches.
3. `**recommendations**` — closes the second known latent bug.
4. **The rest** in pragmatic order: `cart`, `addresses`, `paymentMethods`, `me`, `products`, `categories`, `vendors`, `returns`, `search`, `storeCredit`.

A domain is **done** when *all* of these are true:

- Every read hook for the domain lives in `lib/queries/<domain>.ts`.
- Every mutation for the domain lives in `lib/queries/<domain>.ts`.
- Schemas exist and are applied via `parseOrThrow` in every queryFn.
- No file outside `lib/queries/<domain>.ts` constructs the domain's keys (the old `queryKeys.<domain>` factory entries are unreferenced for that domain).
- No file outside `lib/queries/`** imports `useQuery`/`useInfiniteQuery`/`useMutation` for that domain (verifiable: grep call sites and confirm they import from `@/lib/queries`).
- `tsc --noEmit` clean.
- The CI grep check passes for files in that domain.

**Until *all* domains are done, the CI grep check + ESLint rule run in `warn` mode** (prints findings, does not fail). The day the last domain is migrated, we flip both to `error` and delete the old `lib/queryKeys.ts`.

### §3.1 — Per-domain migration sequencing (the overlap-safe protocol)

The window during which a domain has *both* the new typed hook and not-yet-migrated legacy `useQuery` callers is the moment the bug class is technically still expressible. The following discipline closes it:

**Rule A — Same key.** The new typed hook uses the *byte-identical* key the legacy code already uses. Don't invent a new namespace. During the migration window, the legacy `useQuery` and the new typed hook share the cache entry; whichever mounts first writes; the other reads. Safe as long as Rules B and C hold.

**Rule B — Outlier first.** The first call-site migration in any domain is the queryFn whose shape disagrees with the rest. Until the outlier is gone, the cache entry has multiple writers with *disagreeing* shapes — i.e., the bug we're eliminating is live. Once the outlier is migrated, every remaining legacy queryFn and the new typed hook return the same shape; the rest of the migration window is benign.


| Domain            | Outlier (migrate first)                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `orders`          | `app/support/message-seller/[orderId].tsx` (caches `SelectableItem[]` under `orders.detail(id)`) |
| `recommendations` | `app/recommended.tsx` (caches raw envelope under `recommendations.home()`)                       |
| `messages`        | None remaining — already aligned by the original handoff fix                                     |
| Others            | TBD per domain audit; if no outlier exists, any caller can be first                              |


**Rule C — Schema is the canonical contract.** If a legacy queryFn writes a shape that fails the new schema, `parseOrThrow` evicts the entry and the new hook refetches against the live API. The new typed hook is therefore always defended; the only thing at risk during the window is a legacy queryFn reading what the new hook just wrote — and after Rule B, no legacy queryFn cares about the difference.

### §3.2 — Per-domain commit choreography (worked example: `orders`)

```
Commit A — Add lib/queries/orders.ts: typed hook + Valibot schema + same key.
           Zero callers migrated. Pure addition. Zero blast radius.

Commit B — Migrate the OUTLIER (support/message-seller/[orderId].tsx) to use
           useOrderDetail + local useMemo(() => parseOrderItems(order), [order]).
           After this commit, cache invariant for orders.detail is restored.

Commits C–H — Migrate remaining 6 callers (~1 commit each, or grouped).
              Each commit ships safely independently; cache shape is now
              consistent regardless of how many legacy callers remain.

Commit I — Delete queryKeys.orders.* entries. CI + ESLint confirm orders
           is sealed. Domain marked done.
```

Same pattern applied per domain. The window between Commit B and Commit I is the safe zone. No commits ship between A and B except the outlier migration itself.

---

## §4 — Specific resolutions baked in by this plan

### 4a. The `orders.detail` outlier (`support/message-seller/[orderId].tsx:144-167`)

Today: that file's queryFn returns `SelectableItem[]` (parsed line items) under `queryKeys.orders.detail(id)`.

Resolution under sealed layer:

- `lib/queries/orders.ts` owns `useOrderDetail(id)` returning the canonical `Order`.
- `support/message-seller/[orderId].tsx` calls `useOrderDetail(id)` and derives selectables locally:

```ts
  const { data: order } = useOrderDetail(orderId);
  const selectableItems = useMemo(() => parseOrderItems(order), [order]);
  

```

- `parseOrderItems` becomes a pure function in `lib/orderHelpers.ts` if it isn't already (it is).
- Zero shape disagreement possible because there is one writer.

### 4b. The `recommendations.home` collision

Today: `app/(tabs)/(home)/index.tsx` and `app/recommended.tsx` cache different shapes under the same key.

Resolution:

- `lib/queries/recommendations.ts` owns `useHomeRecommendations()` returning `{ products: Product[], personalized: boolean }` (the normalized shape).
- Both screens consume that hook. Neither has its own queryFn.

### 4c. The `messages.tsx` read-side `useMemo` belt-and-suspenders

Today: defensive `useMemo(() => unwrapList(raw), [raw])` exists to survive stale OTA cache from pre-fix builds.

Resolution:

- After the messages domain migration, the schema enforcement makes the read-side normalization obsolete. The `useMemo` is removed.
- The `unwrapList` helper in `lib/api.ts` stays for now (other call sites may use it), but becomes a candidate for deletion once all domains are migrated and no caller remains.

### 4d. `useLiveChat` audit

Today: confirmed (grepped) that `useLiveChat.ts` does **not** call `setQueryData`, `setQueriesData`, `getQueryData`, `removeQueries`, or use `onMutate`. It manages its own state via React refs and Socket.IO. **No migration cost.**

If/when live chat starts touching the messages cache (e.g. to mark a conversation read, or to push an incoming message into the conversations list cache), those writes will go through new typed helpers in `lib/queries/messages.ts` — never directly.

---

## §5 — What stays untouched

- `lib/api.ts` — `customerFetch`, `publicFetch`, `customerFetchBlob`, `unwrapList`. These are transport, not cache. Unchanged.
- `lib/queryClient.ts` — retry policy, gcTime, staleTime. Unchanged.
- `lib/queryKeys.ts` — kept during migration as a reference, deleted at the end (after `lib-flip` step in TODOs).
- `components/QueryProvider.tsx` — unchanged.
- All component-side derivation (formatting, grouping, presentation `useMemo`s) — unchanged.

---

## §6 — Risks and mitigations


| Risk                                                                                                   | Mitigation                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schemas drift from actual API responses (backend ships a field the schema doesn't allow).              | Schemas use Valibot's default-behavior of allowing unknown keys (`v.object` is non-strict by default unless we use `v.strictObject`). We allow extra keys; we only enforce the keys we depend on.      |
| First migration introduces a regression in the orders flow.                                            | Each domain migration is a separate commit. `tsc --noEmit` plus manual smoke test of the affected screens (order list, order detail, cancel, return, message-seller) before moving to the next domain. |
| Bundle size regresses meaningfully.                                                                    | Valibot is ~2 KB. Schemas are tree-shaken. Re-measure `dist/` after migration; if regression > 20 KB total, revisit.                                                                                   |
| Grep CI check produces false positives (e.g. matches in comments).                                     | The check uses `grep -E "from ['\"]@tanstack/react-query['\"]"` which only matches imports. Tested before merge.                                                                                       |
| A queryFn for an endpoint we can't easily schema (returns wildly varying shapes) blocks the migration. | Allowed escape hatch: `v.unknown()` schema with a TODO comment, behind a `// SCHEMA_TODO:` marker that a CI grep counts and reports. Not zero per file — accountable per file.                         |


---

## §7 — Out of scope (deliberate, do not pull in)

- Backend NestJS envelope unification. Valuable but separable; revisit after this lands.
- Persisted query cache / offline support. Not on the roadmap. The plan is forward-compatible (`_validate.ts` self-heals on mismatch) but does not add a persister.
- Cache versioning (`CACHE_VERSION` constant + migration). Only meaningful with persistence; deferred with persistence.
- Web/admin/vendor/support sealed-layer projects. Same architecture would apply, but each is its own project, sequenced after mobile proves the pattern.
- Adding ESLint to mobile. Tracked separately if desired; the grep check supersedes its role here.

---

## §8 — Execution checklist (will become commits)

1. [ ] Land §1 decisions (validator, enforcement, invalidation surface).
2. [ ] Add `valibot` (or `zod`) to dependencies. Add `scripts/check-query-imports.sh`. Wire it into the existing pre-commit / CI hook (TBD: confirm there is one).
3. [ ] Scaffold `lib/queries/{_client,_validate,invalidate,index}.ts` with empty domains. CI check runs in warn mode.
4. [ ] Migrate `orders` domain end-to-end. Smoke-test order flows. Commit.
5. [ ] Migrate `messages` domain. Remove read-side `useMemo` belt-and-suspenders. Smoke-test messages flows. Commit.
6. [ ] Migrate `recommendations` domain. Smoke-test home + recommended-all. Commit.
7. [ ] Migrate remaining domains in agreed order. One commit per domain.
8. [ ] Flip CI check from warn to error. Delete `lib/queryKeys.ts`. Final commit.

Every commit awaits explicit approval per workspace rules.