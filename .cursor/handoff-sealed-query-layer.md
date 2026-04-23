# Handoff — Sealed Query Layer Migration (Mobile)

**Status:** Scaffolding shipped. **Orders domain fully migrated.** **Messages domain fully migrated.** **Recommendations domain fully migrated.** **Long-tail batch 1 fully migrated** — `addresses`, `paymentMethods`, `storeCredit` shipped as sealed modules; the legacy `me`, `addresses`, `paymentMethods`, `storeCredit` blocks have been deleted from `lib/queryKeys.ts` (the `me` key had zero call sites in the audit, so it was retired without a sealed module). The remaining long tail (cart/products/categories/vendors/returns/search) is still pending. ESLint + CI grep are intentionally in **warn mode** until the last domain is done. Current `npm run lint` warning count: **14** (down from 16 at start of long-tail batch 1; only un-migrated domains remain in the warning list).

**Scope (do not deviate):** `wabbus-mobile/` only. No backend, web, admin, vendor, or support changes. No persisted-cache work. No backend envelope unification. See plan §7 for the explicit out-of-scope list.

---

## §A — Read these first, in this order

1. `.cursor/handoff-query-key-shape-collisions.md` — the original bug report. Establishes the bug class you are eliminating and lists the two known latent crashes (recommendations.home, orders.detail outlier — orders.detail is now closed, recs is still live).
2. `.cursor/plans/sealed_query_layer_c4f8a2b1.plan.md` — the architectural plan. Locked decisions (Valibot, three-layer enforcement, typed `invalidate` namespace), file layout, per-domain rules, commit choreography. **This is the contract you are executing against.** Do not propose alternatives without explicit user approval.
3. This file.
4. `lib/queries/orders.ts` — first worked reference. Demonstrates the **paginated-envelope** canonical shape (`OrdersListResponse = { data, nextCursor, hasMore }`), the `encodeURIComponent` defensive pattern in `fetchOrderDetail`, and the cross-domain invalidation pattern in `lib/useCheckout.ts:cleanupAfterOrder`.
5. `lib/queries/messages.ts` — second worked reference. Demonstrates the **bare-array** canonical shape (the divergent rule — see §F.11), the `QueryOpts` pattern for polling/enabled options (§F.12), the centralised two-step fetch (`fetchConversationDetail`), the centralised envelope unwrap (`fetchTicketDetail`), the centralised post-filter (`fetchFamilyCases`), and the deliberate non-export of `useUnreadCount` (§F.13).

Read both `orders.ts` and `messages.ts` end-to-end. They are the two template extremes — every future domain falls between them.

After those five, skim `lib/queries/{_internal/react-query,_client,_validate,invalidate,index}.ts` so you know the exact bridge surface you are allowed to use.

---

## §B — Hard guardrails (these have already cost time when violated)

1. **No git operations.** No commits, no stashes, no `git add`, no `git checkout`. Workspace rule (`CLAUDE.local.md`). Show diffs, wait for explicit approval. Even within an approved migration, the user signs off per step.
2. **Behavior preservation, not behavior correction.** During migration you replicate existing call-site behavior *exactly*. Fallback logic, defensive `Array.isArray` checks, redundant invalidations, weird `enabled` patterns — preserve them. Optimization comes after the system is structurally stable. The user explicitly rejected "phase-in by normalizing in queryFn" framing; the same applies to "while we're in here, let's clean up X." Don't.
3. **`v.looseObject`, never `v.object`.** Valibot's `v.object` *strips* unknown keys from the parsed output. Using it changes runtime behavior for every caller that reads a non-canonical field. Use `v.looseObject` for every object schema in every domain file. There is a long comment block at the top of `lib/queries/orders.ts` explaining why — copy that explanation into each new domain file (or factor it into a shared comment if it grows).
4. **Byte-identical keys with the legacy `queryKeys.<domain>.*`.** During the migration window the new typed hook and remaining legacy `useQuery` callers share the cache entry. Different keys = duplicated entries = cache fragmentation. Verify by reading `lib/queryKeys.ts` and matching tuple shape exactly (`['orders', 'detail', String(id)]`, etc.). The `String(...)` coercion matters — match it.
5. **Single writer per key. No exceptions.** A domain's queryFn is the only function that writes to its keys. `setQueryData`, `setQueriesData`, `client.fetchQuery({queryFn: ...})` from app code are banned. If a mutation needs an optimistic update, the optimistic write lives *inside* the domain module behind a typed helper.
6. **Invalidations go through `invalidate.<domain>.*`.** No app code may import `useQueryClient` or `queryKeys.<domain>` for the purpose of invalidation. The typed namespace is the only legal coordination surface.
7. **`@tanstack/react-query` is forbidden everywhere except `lib/queries/_internal/react-query.ts`.** Inside `lib/queries/**`, import from `./_internal/react-query`, never from the package. App code imports from `@/lib/queries`, never from internal modules.
8. **The CI grep is in warn mode (`exit 0` on violations) until the *last* domain is migrated.** Do not flip it to error mid-migration. Do not delete `lib/queryKeys.ts` mid-migration. Both happen as the very last step.

If any of the above conflict with a specific call site you're migrating, **stop and ask** — don't improvise.

---

## §C — Where things stand now

### Done
- `lib/queries/{_internal/react-query, _client, _validate, invalidate, index}.ts` — scaffolding.
- `lib/queries/orders.ts` — schemas (`v.looseObject` everywhere), `useOrderDetail`, `useOrdersList`, `invalidateOrders`, normalized list params, defensive `encodeURIComponent` in `fetchOrderDetail`, paginated envelope canonicalised as `OrdersListResponse` ({ data, nextCursor, hasMore }).
- `lib/queries/invalidate.ts` — `invalidate.orders.*` wired.
- `lib/queries/index.ts` — exports orders hooks + types (`Order`, `OrderItem`, `OrdersListParams`, `OrdersListResponse`).
- ESLint config (`eslint.config.mjs`) — `no-restricted-imports` rule in warn mode, `eslint-plugin-react-hooks` registered to satisfy existing disable pragmas.
- CI grep (`scripts/check-query-imports.sh`) — warn mode by default, `STRICT=1` for hard mode.
- Type adjustments: `lib/types.ts` `OrderItem.images.{key,url}` widened to `string | null | undefined`; `lib/orderHelpers.ts` `pickItemImage` parameter widened to match. Pure type-level alignment, zero runtime change.
- **Orders domain Steps A–F complete.** All 8 callers migrated (`index`, `tracking`, `cancel`, `missing`, `return`, `review`, `order-complete`, `support/message-seller/[orderId]`). Cross-domain orders invalidation in `lib/useCheckout.ts:cleanupAfterOrder` migrated to `invalidate.orders.all()`. Zero external `queryKeys.orders.*` code references remain (verified via repo-wide grep).
- **Messages domain fully complete (Steps A–I).** `lib/queries/messages.ts` shipped with 11 schemas (every list endpoint canonicalised as a bare array — see §F.11), 9 read hooks (`useConversationsList`, `useConversationDetail`, `useTicketsList`, `useTicketDetail`, `useCasesList`, `useCasesListFlat`, `useCaseDetail`, `useCaseMessages`, `useFamilyCases`), and the full `invalidate.messages.{conversations,tickets,cases,unread,all}` namespace. All 8 in-domain call sites + both cross-domain stragglers migrated:
  - `app/account/messages/family/[familyNumber].tsx` — `useFamilyCases` (post-filter centralised in fetcher).
  - `app/support/message-seller/all.tsx` — `useConversationsList` (local `Conversation` type retained via §D.4 cast for non-canonical `lastMessageBody`; `unwrapList` `useMemo` belt-and-suspenders explicitly preserved per §B.2 — removal is deferred to the very last messages-domain step alongside the `messages.tsx` `useMemo` removal).
  - `app/account/messages/conversation/[id].tsx` — `useConversationDetail` (two-step fetch fallback now centralised in `fetchConversationDetail`).
  - `app/account/messages/case/[caseNumber].tsx` — `useCaseDetail` + `useCaseMessages`.
  - `components/CaseDetailPanel.tsx` — `useCaseDetail` + `useCaseMessages` (now shares cache with the full-page case screen — single-writer win).
  - `app/support/ticket-detail/[ticketId].tsx` — `useTicketDetail` (`res?.data ?? res?.ticket ?? res` envelope unwrap centralised in `fetchTicketDetail`).
  - `app/support/ticket.tsx` — mutation-only ticket-create screen; `getQueryClient/queryKeys.messages.*` invalidations replaced with `void invalidate.messages.tickets.list()` + `void invalidate.messages.unread()`. `getQueryClient` and `queryKeys` imports dropped.
  - `app/account/messages.tsx` — 3 reads (`useConversationsList`, `useCasesList`, `useTicketsList`); local types from `lib/messages-types` retained via §D.4 cast (helpers and row components consume them). The 3 `useMemo(() => unwrapList(raw), [raw])` defenders that lived here previously were removed as the explicit single-behavior-change commit at the end of the migration (§F.15) — schema enforcement in `parseOrThrow` makes them dead code. `unwrapList` import dropped.
  - **Cross-domain stragglers (closed):** `app/orders/index.tsx` `cases.listFlat` read → `useCasesListFlat({ enabled: isLoggedIn })` (CaseLite cast via §D.4; the legacy `staleTime: 5 * 60_000` is now baked into the hook itself — see §F.12). `app/orders/[id]/return.tsx` `messages.cases.all()` invalidation → `void invalidate.messages.cases.all()`.
- **Legacy `messages` block deleted from `lib/queryKeys.ts`.** The factory now has no entry for the messages domain; `lib/queries/messages.ts` is the sole owner of those keys. A short comment block marks the deletion site and points at the sealed module. Done as a separate verifiable commit after the user signed off on the audit (zero `queryKeys.messages` references in app code, zero dynamic `["messages", ...]` access, chat/socket files clean, no tests).
- **`QueryOpts` pattern introduced** in `lib/queries/messages.ts`: `{ enabled?: boolean; refetchInterval?: number | false }` exposed per-hook so polling-based call sites (every messages detail screen uses `refetchInterval: 30_000`) migrate without behavior change. The fetcher is identical regardless of these flags — they affect TanStack observer timing only, never the queryFn or cache key. Reuse this pattern in every future domain that has polling callers. **Cache-policy options (`staleTime`, `gcTime`) are deliberately NOT in `QueryOpts`** — see §F.12 for the rule and the worked `useCasesListFlat` example.
- **`useUnreadCount` deliberately NOT exported.** The `messages.unread()` key is invalidated by mutations but read by zero callers in the codebase. Adding a read hook with no consumer would create a phantom writer. Only `invalidate.messages.unread()` is exposed. When (if) a consumer lands, the read hook + schema land at the same time — see the comment block above `invalidateMessages` for the rule.
- **Recommendations domain fully complete (Steps A–I).** `lib/queries/recommendations.ts` shipped with a temporarily-local `PublicProductSchema` (will hoist to `lib/queries/products.ts` when that domain migrates), the canonical `HomeRecommendations = { products, personalized }` schema, and the `TrendingCategoryRow` schema. Six read hooks (`useRecommendationsHome`, `useRecommendationsStrategy`, `useTrendingCategories`, `useRecommendationsContext`, `useRecommendationsProduct`, `useRecommendationsPostPurchase`) and the full `invalidate.recommendations.{all,home,strategy,trendingCategories,context,product,postPurchase}` namespace. The `RECS_SLIDER_STALE_TIME_MS = 5 * 60_000` constant is baked into every slider-fed hook per §F.12.
- **Outlier closed (Step B).** `app/recommended.tsx` was the latent-bug caller — it cached the raw API envelope under `recommendations.home()` while `app/(tabs)/(home)/index.tsx` cached the normalized `{products, personalized}` shape under the same key with a different `take` value. Both surfaces now go through `useRecommendationsHome(take)`. Resolution applied **both halves**: (a) single canonical schema enforced via `parseOrThrow` so the cache shape is invariant regardless of which screen wrote it; (b) `take` baked into the cache key (`["recommendations", "home", take]`) so the home carousel (take=36) and "browse more" page (take=200) occupy distinct cache entries with the same schema. **This deliberately diverges from the byte-identical-keys rule (§D Step A) — authorised by plan §3.1 Rule B for outlier closure**, since byte-identical sharing IS the bug for this surface. The legacy `recommendations.home()` factory key has been retired with the rest of the recommendations block in `lib/queryKeys.ts`.
- **`ProductRecommendationSlider` refactored to presentation-only.** The component previously owned its own `useQuery({ apiUrl, queryKey, postProcess })` against arbitrary URLs and arbitrary cache keys — that pattern made every caller a writer for an ad-hoc cache key, exactly the bug class the sealed layer eliminates. The new component takes `products: PublicProduct[] | undefined` + `loading?: boolean` as props; each caller owns its data-fetching side via the appropriate typed hook. Empty/loading semantics preserved verbatim: `loading=false && products.length===0` → render nothing; `loading=true && products.length===0` → skeleton; `products.length>0` → slider regardless of loading.
- **All 9 call sites migrated:**
  - `app/recommended.tsx` — `useRecommendationsHome(200)` (closes the outlier).
  - `app/(tabs)/(home)/index.tsx` — `useRecommendationsHome(PRODUCTS_HOME)` for the grid + `useRecommendationsStrategy("trending"|"new_arrivals"|"deals")` for the three strategy carousels + `useTrendingCategories()` for the categories grid + inline `useQuery` w/ `queryKeys.products.list({take:10,sortBy:"newest"})` for the "Suggestions for you" carousel (stays inline because that surface hits `/products/public`, NOT a recommendations endpoint — products domain still un-migrated).
  - `app/(tabs)/(home)/category/[slug].tsx` — `useRecommendationsStrategy("trending")` + `useRecommendationsContext("category", slug)` for the recommendations carousels + inline `useQuery` w/ `queryKeys.categories.newArrivals(slug)` and `queryKeys.products.list({take:10,sortBy:"newest"})` for the two non-rec carousels (categories/products domains still un-migrated).
  - `app/(tabs)/(home)/product/[id].tsx` — `useRecommendationsProduct(id, "bought_together"|"viewed_together"|"similar")` for the three product-context carousels + inline `useQuery` w/ `queryKeys.vendors.products(...)` for the "More from this vendor" carousel (post-process moved into the queryFn so the cache stores exactly the canonical filtered/capped shape) + inline `useQuery` w/ `queryKeys.products.list(...)` for the bottom "Recommended for you" carousel (vendors/products domains still un-migrated).
  - `app/order-complete.tsx` — `useRecommendationsPostPurchase(order.publicId ?? orderId)`.
  - `app/(tabs)/cart.tsx` — `useRecommendationsStrategy("trending")` for the empty-cart carousel.
  - `app/search.tsx` — inline `useQuery` w/ `queryKeys.products.list({take:10,sortBy:"newest"})` for the no-results "Recommended for you" carousel (products domain still un-migrated).
  - `app/orders/index.tsx` — inline `useQuery` w/ `queryKeys.products.list({sortBy:"rating",take:10})` for the bottom Top-Rated carousel (products domain still un-migrated; this stays on `customerFetch` matching the legacy slider's behaviour, with a defensive `try/catch` returning `[]` on transport failure to mirror the slider's silent-empty-on-error UX).
- **Legacy `recommendations` block deleted from `lib/queryKeys.ts`.** Audit (`rg "queryKeys\.recommendations"` outside `lib/queries/`) returns zero hits in app code; the only remaining matches are in JSDoc/comment text inside the new module and the migration notes. Deletion was a separate verifiable change after the call-site sweep.
- **`ProductRecommendationSlider` extra-prop notes:** the `postProcess` and `apiUrl`/`queryKey` props are gone. The previous PDP "More from vendor" caller used `postProcess` to filter out the current product — that logic now lives in the queryFn for that hook, so the cache stores exactly the canonical shape consumers will read. Apply the same pattern in any future migration where a slider had `postProcess`: lift the transformation into the fetcher.
- **`CartRecommendations` component (`components/ui/CartRecommendations.tsx`) intentionally NOT migrated.** It uses raw `fetch` + `useState`, never touched TanStack Query, and has no `queryKeys.recommendations.*` reference. It's outside the sealed-layer scope (it's a hand-rolled mini-slider, not a recommendations cache consumer). Migrating it would be opportunistic clean-up — explicitly deferred per §B.2.
- **Long-tail batch 1 fully complete: `addresses`, `paymentMethods`, `storeCredit`, `me`.** Three sealed modules shipped + one factory-key retirement, all wired through the public barrel and the typed `invalidate` namespace.
  - `lib/queries/addresses.ts` — single read hook (`useAddressesList`) + `invalidate.addresses.{all,list}`. The 3-endpoint defensive fallback chain (`/customer-addresses` → `/addresses` → `/customer-auth/me.addresses`, with `AuthError` re-throw and 404 fall-through) is centralised inside `fetchAddressesList` per §F.14. Bare-array canonical shape per §F.11 (no caller consumes pagination metadata; the endpoint is non-paginated). The `extractAddresses` helper normalises bare arrays, `{addresses: []}`, and `{data: []}` envelopes — same defensive shape the legacy `normalizeAddressList` accepted.
  - `lib/queries/paymentMethods.ts` — single read hook (`usePaymentMethods`) + `invalidate.paymentMethods.all`. The two-shape envelope flattening (bare array, `{methods: []}`) is centralised inside `fetchPaymentMethods` per §F.14. Bare-array canonical shape. Mutations (PATCH default, DELETE, POST setup-intent + confirm-setup) stay at the call site as direct `customerFetch` calls today; they trigger refetch via the hook's `refetch()` — when the codebase adopts a `useMutation` pattern broadly, typed mutation helpers will land in this module.
  - `lib/queries/storeCredit.ts` — single read hook (`useStoreCreditBalance`) + `invalidate.storeCredit.all`. The defensive `.catch(() => 0)` swallow (store credit is a soft secondary signal in the payment-methods UI) is preserved verbatim per §B.2 inside `fetchStoreCreditBalance`. **Canonical CACHED shape is a bare `number`, NOT the `{balanceCents}` envelope** — see the file-level docblock for the justification (single-writer + no other useful fields + every consumer reads it as a money integer). This is the only acceptable case of envelope-collapse in the sealed layer; if the backend later adds adjacent fields we'll widen to the full envelope at that point.
  - **`me` factory key deleted without a sealed module.** The legacy `["me"]` key had zero application call sites at the audit time (cross-checked across every `.ts/.tsx` file under `app/`, `components/`, `hooks/`, `lib/`). Rather than scaffold a one-key sealed module for a key nobody reads, the factory entry was deleted outright with a comment block at the deletion site explaining the policy: if a future feature needs the `/customer-auth/me` payload cached under a typed key, create `lib/queries/me.ts` at THAT point — don't reintroduce it in `queryKeys.ts`.
  - **Call sites — final state:**
    - `app/account/payment-methods.tsx` — `usePaymentMethods()` + `useStoreCreditBalance()`. `useQuery` and `queryKeys` imports dropped; `customerFetch` import retained for the in-place mutations. Local `PaymentMethod` import dropped (consumed via the canonical type from `@/lib/queries`).
    - `app/account/addresses.tsx` — `useAddressesList()`. The two `queryClient.invalidateQueries({ queryKey: queryKeys.addresses.all() })` calls (after save and after delete) replaced with `await invalidate.addresses.all()`. `useQuery`/`useQueryClient`/`queryKeys`/`FetchError`/`AuthError` imports all dropped (the fallback handling moved into the fetcher); `customerFetch` retained for the mutations. Local `Address` type import dropped (consumed via `@/lib/queries`). Unused `useRouter` removed.
    - `lib/useCheckout.ts:cleanupAfterOrder` — the `addresses` and `storeCredit` invalidations migrated to `void invalidate.addresses.all()` + `void invalidate.storeCredit.all()`. The `cart` invalidation stays on the legacy `queryClient.invalidateQueries({ queryKey: queryKeys.cart() })` line (cart domain still un-migrated); a comment block on that line documents the intent and the fact that it's the lone direct-key write surface in the file.
  - **Audit:** `rg "queryKeys\.(me|addresses|paymentMethods|storeCredit)"` outside `lib/queries/` returns zero hits in app code (only matches are in JSDoc/comment text inside the new modules and the migration notes). `npm run lint` and `npx tsc --noEmit` both clean. Lint warning count dropped from 16 → 14 — the two files removed from the warn list are `app/account/addresses.tsx` and `app/account/payment-methods.tsx`, both of which now have zero direct `@tanstack/react-query` imports.
  - **Pattern reuse for future small domains:** the trio (`addresses`, `paymentMethods`, `storeCredit`) is the worked reference for "small, single-key or near-single-key domain with no polling and no mutation hooks." Copy the file structure (header docblock → schemas → `keys` → `QueryOpts` → `extractX` helper → `fetchX` → `useX` → `invalidateX`) and adapt. The `me`-style "no sealed module, just delete the key" path is the right call whenever the audit shows zero call sites for a factory entry — don't scaffold modules for ghost keys.

### Pending — in this exact order

| Step | Owner | Description |
|---|---|---|
| 1 | **rest** | `cart`, `products`, `categories`, `vendors`, `returns`, `search`. See §E.5. (Batch 1 — `addresses`, `paymentMethods`, `storeCredit`, `me` — done.) |
| 2 | **flip** | Flip ESLint rule `warn → error` and CI grep default to `STRICT=1`. Delete `lib/queryKeys.ts`. Verify `npm run lint` and `npm run check:queries` are both `exit 0` with zero warnings. |

### Verification gates after every step
```bash
npx tsc --noEmit          # must exit 0
npm run lint              # exit 0; warning count should monotonically decrease
npm run check:queries     # exit 0 (warn mode); the migrated file disappears from the list
```

If you ever introduce a new warning or violation, *stop*. Don't proceed to the next file until it's accounted for (either the file genuinely has un-migrated side queries on a different domain, or you've broken something).

---

## §D — The migration protocol (apply to every domain)

Lifted directly from plan §3.1–3.2. Internalize this; every domain follows it without exception.

### Per-domain step sequence

**Step A — Scaffold the domain file.**
`lib/queries/<domain>.ts` ships with: schemas (`v.looseObject` everywhere), inferred types, private `keys` factory matching legacy byte-identically, internal queryFns, exported read hooks, and the `invalidate<Domain>` object. *Zero callers migrated.* Add the domain's exports to `lib/queries/index.ts` and the invalidate helper to `lib/queries/invalidate.ts`.

**Step B — Migrate the OUTLIER first.** (plan §3.1 Rule B)
The outlier is the call site whose queryFn caches a *different shape* than the rest under the same key. Until the outlier is gone, the cache invariant is technically still violated. The outlier inventory per domain is in §E.

**Steps C..H — Migrate remaining callers, one at a time.**
Each migration: replace `useQuery({ queryKey: queryKeys.<domain>.X, queryFn: ... })` with the typed hook. Replace `queryClient.invalidateQueries({ queryKey: queryKeys.<domain>.X })` with `invalidate.<domain>.X(...)`. Preserve every surrounding behavior (fallbacks, `enabled` flags, `useMemo` derivations, error handlers, `refetchOnWindowFocus` overrides, etc.) verbatim.

**Step I — Audit & seal.**
Grep the codebase for any remaining `queryKeys.<domain>.*` references and any direct `@tanstack/react-query` imports in files that previously used them. The CI grep output should no longer list any file that touches *only* this domain. Files that touch this domain *and* an un-migrated domain remain in the warn list (expected) until those domains are also done.

### Per-call-site discipline (the part that's easy to skip)

When migrating a single call site:

1. **Read the file in full** before editing. Identify every `useQuery`, `useMutation`, `useQueryClient`, `queryKeys.*`, `setQueryData`, `cancelQueries` it touches. Some files touch 3–5 domains.
2. **Migrate only the current domain's references.** If a file uses `queryKeys.orders.detail` *and* `queryKeys.products.detail`, replace only the orders one. Leave the products one (and the `useQueryClient` import, and the `queryKeys` import) until the products domain is migrated. The CI grep will keep warning on this file — that's correct. It disappears when the last domain is migrated.
3. **Replace `useQueryClient` invalidations with `invalidate.<domain>.<thing>`** for the migrated domain. Other domains still use the legacy pattern. Per-domain replacement.
4. **Preserve the canonical type contract.** The typed hook returns the canonical inferred type (`Order`, `Conversation`, etc.). If the call site reads non-canonical fields the schema didn't enumerate (`item.id`, `shipment.purpose`, etc. — preserved by `v.looseObject`), introduce a *local* type cast or local typed alias inside that file. Do NOT add those fields to the canonical schema unless they're genuinely part of the contract everyone relies on. (See `app/orders/[id]/tracking.tsx` for the worked example: local `OrderAPI` type, `as unknown as OrderAPI | undefined` cast at the read.)
5. **Run `npx tsc --noEmit` after every file.** Cheap, catches every type drift immediately. Don't batch.
6. **Show the diff and wait for approval before moving on.** Workspace rule.

### What "done" means for a domain

All of these must be true (plan §3, restated):

- Every read hook for the domain lives in `lib/queries/<domain>.ts`.
- Every mutation for the domain lives in `lib/queries/<domain>.ts`.
- Schemas exist and are applied via `parseOrThrow` in every queryFn.
- No file outside `lib/queries/<domain>.ts` references `queryKeys.<domain>.*`.
- No file outside `lib/queries/**` calls `useQuery`/`useInfiniteQuery`/`useMutation`/`useQueryClient` for that domain.
- `tsc --noEmit` clean.
- The CI grep check no longer lists any file whose *only* TanStack import was for this domain.

---

## §E — Per-domain inventory & gotchas

The inventories below come from the current `npm run check:queries` output and reading `lib/queryKeys.ts`. Re-verify with `rg` before starting each domain — files may have moved.

### E.1 — Orders (DONE — kept for reference)

All steps complete. Notes preserved for the patterns the next domain will reuse:

**Outlier handled:** `app/support/message-seller/[orderId].tsx` (Step B). The legacy queryFn cached `SelectableItem[]` under `orders.detail(id)` — corrupting the cache for every other consumer of that key. Replaced with `useOrderDetail` + a separately-gated `useOrdersList` fallback; SelectableItem[] is now derived locally via `useMemo` (UI projection, not server state).

**Type-cast pattern (reuse for every domain):** `app/orders/[id]/tracking.tsx` and `app/orders/index.tsx` both cast typed-hook results to local types from `lib/types.ts` for non-canonical field access. The `as unknown as LegacyType[] | undefined` pattern is the §D.4 escape hatch — use it whenever a caller reads fields outside the canonical schema.

**Paginated envelope discovery:** During Step D, the orders-list canonical shape was corrected from `Order[]` to the envelope `OrdersListResponse = { data: Order[], nextCursor: string | null, hasMore: boolean }`. The original `Order[]` canonicalisation silently erased pagination metadata that the orders screen needed for load-more. The new rule documented in `lib/queries/orders.ts`:

> Paginated endpoints → envelope schema (data + cursor + flag).
> Non-paginated endpoints → bare-shape schema (object or array directly).

**Apply this rule to every paginated domain that follows** (products, recommendations context, search, vendor products, etc.). When in doubt, model the envelope — `v.looseObject` lets future fields pass through harmlessly anyway.

**Step D key-shape gotcha:** the legacy `useQuery({ queryKey: queryKeys.orders.list(), queryFn: () => customerFetch("/orders?limit=50") })` had **drift** — the URL contained `limit=50` but the cache key did not. The byte-identical migration was therefore `useOrdersList()` (no params, key `["orders", "list", undefined]`), NOT `useOrdersList({ limit: 50 })` (which would have produced a *different* key and fragmented the cache). The URL stays equivalent because `customerFetch` auto-appends `limit=PAGE_SIZE.DEFAULT` (=50) when missing — see `lib/api.ts:160-162`. **Always read both the legacy `queryKey` AND the legacy URL before picking the new hook params.**

**Cross-domain invalidation:** `lib/useCheckout.ts:cleanupAfterOrder` invalidates four namespaces after a successful checkout (cart, orders, addresses, storeCredit). Only the orders one was migrated; the other three stay legacy until those domains land. Same pattern will recur in any mutation that fans out across domains — migrate per-domain, not per-call-site.

### E.2 — Messages (DONE — kept for reference)

**Schema + hook layer:** complete. `lib/queries/messages.ts` ships with all 11 schemas, 9 read hooks, and the full `invalidateMessages` namespace. `lib/queries/index.ts` re-exports the 9 hooks and 11 canonical types. `lib/queries/invalidate.ts` re-exports `invalidateMessages` as `invalidate.messages`. The legacy `messages` block has been deleted from `lib/queryKeys.ts`.

**Outlier:** None — confirmed during migration. Per plan §3.1 table, "already aligned by the original handoff fix." All list callers used `unwrapList`; all detail callers used the same response shape. The only structural divergence was the conversation-detail two-step fetch and the ticket-detail envelope unwrap — both centralised inside the fetchers in `lib/queries/messages.ts`.

**Call sites — final state (every file migrated):**

| File | Keys touched | Notes |
|---|---|---|
| `app/account/messages/family/[familyNumber].tsx` | `cases.familyMessages` | Post-filter (`c.caseFamily?.familyNumber === familyNumber`) moved into `fetchFamilyCases`. |
| `app/support/message-seller/all.tsx` | `conversations.list` | Local `Conversation` type retained for non-canonical `lastMessageBody` field via §D.4 cast. `useMemo(() => unwrapList(raw), [raw])` belt-and-suspenders preserved during the migration step, then removed alongside `messages.tsx` removals at the end. |
| `app/account/messages/conversation/[id].tsx` | `conversations.detail` (read), `conversations.list` ×3 + `unread` ×1 (invalidate) | Two-step fetch fallback now in `fetchConversationDetail`. `useQueryClient` removed. |
| `app/account/messages/case/[caseNumber].tsx` | `cases.detail` + `cases.messages` (read), `cases.list` ×1 (invalidate) | Local `CaseMessage` type and `CustomerCaseDetail` import from `lib/messages-types` removed; canonical types from `@/lib/queries` used directly. |
| `components/CaseDetailPanel.tsx` | `cases.detail` + `cases.messages` (read), `cases.messages(caseNumber)` ×1 (invalidate) | Now shares cache with `case/[caseNumber].tsx` via the same fetchers — single-writer win. |
| `app/support/ticket-detail/[ticketId].tsx` | `tickets.detail` (read), `tickets.list` ×3 + `unread` ×1 (invalidate) | Local `Message`/`Ticket` types removed. `res?.data ?? res?.ticket ?? res` envelope unwrap centralised in `fetchTicketDetail`. |
| `app/support/ticket.tsx` | `tickets.list` + `unread` (invalidate only) | Mutation-only ticket-create screen. `getQueryClient()` + `queryKeys.messages.*` invalidations replaced with `void invalidate.messages.tickets.list()` + `void invalidate.messages.unread()`. `getQueryClient` and `queryKeys` imports dropped. |
| `app/account/messages.tsx` | `conversations.list` + `cases.list` + `tickets.list` (3 reads) | Replaced with `useConversationsList()` / `useCasesList()` / `useTicketsList()`. Local types from `lib/messages-types` retained via §D.4 cast (helpers + row components consume them). The 3 `useMemo(() => unwrapList(raw), [raw])` defenders that lived here previously were the runtime-tolerance for the now-extinct outlier and were removed as the explicit single-behavior-change commit at the end of the messages migration (see §F.15). `unwrapList` import dropped. |

**Cross-domain stragglers — final state:**

| File | Action taken |
|---|---|
| `app/orders/index.tsx` | `useQuery({ queryKey: queryKeys.messages.cases.listFlat(), ... staleTime: 5 * 60_000 })` → `useCasesListFlat({ enabled: isLoggedIn })`. The 5-minute `staleTime` is now baked **inside** `useCasesListFlat` via the module-level `CASES_LIST_FLAT_STALE_TIME_MS` constant — see §F.12 for why cache policy belongs in the hook, not in `QueryOpts`. CaseLite cast via §D.4. |
| `app/orders/[id]/return.tsx` | `queryClient.invalidateQueries({ queryKey: queryKeys.messages.cases.all() })` → `void invalidate.messages.cases.all()`. The legacy `useQueryClient` + `queryKeys` imports stay because the file still has un-migrated returns/replacementCheck reads. |

**`queryKeys.messages` block deletion:** with both stragglers closed, `rg "queryKeys.messages"` outside `lib/queries/messages.ts` returns zero hits in app code (only matches are in JSDoc/comment text). The `messages` block was removed from `lib/queryKeys.ts` as a separate gated commit (replaced with a short comment block pointing at the sealed module). When migrating future domains, follow the same closing sequence: cross-domain stragglers → audit zero hits → delete the domain block from `lib/queryKeys.ts` as a standalone signoff-gated step → only THEN move to the next domain.

**Audit `useLiveChat`:** Plan §4d's reference is to `lib/useLiveChat.ts`, but the actual file lives at `lib/chat/useLiveChat.ts`. **Verified during the messages-domain wrap-up:** the entire `lib/chat/` directory contains zero `setQueryData`, `queryClient`, `getQueryClient`, `queryKeys`, or `invalidateQueries` references. The audit point is satisfied. Re-verify with `rg "setQueryData|queryClient|queryKeys|getQueryClient|invalidateQueries" lib/chat/` when starting the next domain in case anyone has added cache writes since.

**Schema notes (kept for reference — apply same reasoning to future domains):**
- All four list endpoints (`/messages/conversations`, `/support/tickets`, `/cases/mine?limit=50`, `/cases/mine?limit=200`) are canonicalised as **bare arrays**, not paginated envelopes. Zero callers consume `nextCursor` / `hasMore` from any of these responses today. The fetcher unwraps the envelope defensively via `unwrapList` then validates the array. This **diverges from the orders pattern** intentionally — see §F.11 for the rule and the upgrade path if/when a load-more UI lands on one of these endpoints.
- `cases.listFlat` and `cases.familyMessages` both hit `/cases/mine?limit=200` but live under separate cache keys with separate post-processing. The same backend payload is fetched twice if both are mounted simultaneously — preserved verbatim per §B.2 (behavior preservation, not optimization).
- Conversation detail performs a **two-step fetch** when the detail response omits `messages` (falls back to `/messages/conversations/${id}/messages` with envelope unwrap). Centralised in `fetchConversationDetail` — every consumer of `conversations.detail(id)` now sees a populated `messages` array regardless of which call site triggered the fetch.
- Ticket detail performs an **envelope unwrap** (`res?.data ?? res?.ticket ?? res`). Centralised in `fetchTicketDetail` for the same reason.
- `useCasesListFlat` carries a 5-minute `staleTime` baked into the hook (the only cache-policy override across all 9 messages hooks). The constant `CASES_LIST_FLAT_STALE_TIME_MS` is defined at module scope and referenced inline. NOT exposed via `QueryOpts` — see §F.12.

### E.3 — Recommendations (DONE — kept for reference)

All steps complete. Notes preserved for the patterns the next domain will reuse:

**Outlier handled (Step B):** `app/recommended.tsx`. The legacy queryFn cached the raw API envelope under `recommendations.home()` while the home screen cached `{products, personalized}` under the same key with a different `take` value — corrupting the cache for whichever screen mounted second. Resolution applied **both halves**: (a) single canonical schema enforced via `parseOrThrow` so the cache shape is invariant; (b) `take` baked into the cache key (`["recommendations", "home", take]`) so the home carousel (take=36) and "browse more" page (take=200) occupy distinct cache entries with the same schema. **This deliberately diverges from the byte-identical-keys rule (§D Step A) — authorised by plan §3.1 Rule B for outlier closure**, since byte-identical sharing IS the bug for this surface.

**Component-as-cache-writer pattern (eliminated, document for future):** `components/ui/ProductRecommendationSlider.tsx` was a generic horizontal slider that owned its own `useQuery({ apiUrl, queryKey, postProcess })`. That made every caller a writer for an ad-hoc cache key — exactly the bug class the sealed layer eliminates. The component is now presentation-only (`products` + `loading` props); each caller fetches via the appropriate typed hook from `@/lib/queries`. **Apply the same pattern to any other "generic data-fetching component" you encounter** (e.g. `CartRecommendations`, `RecentlyViewedSlider`, etc.): lift the queryFn out, make the component pure, give the data-source side a typed hook in the relevant domain. (Note: `CartRecommendations` was intentionally NOT migrated in this domain — see §C above for the rationale.)

**Slider-fed `staleTime` lift:** the legacy `ProductRecommendationSlider` queryFn had a hardcoded `staleTime: 5 * 60_000`. Per §F.12, that policy belongs INSIDE each hook, not in `QueryOpts`. Lifted into the module-level `RECS_SLIDER_STALE_TIME_MS = 5 * 60_000` constant in `lib/queries/recommendations.ts` and baked into every product-returning hook (`useRecommendationsStrategy`, `useRecommendationsContext`, `useRecommendationsProduct`, `useRecommendationsPostPurchase`). Hooks that had no legacy `staleTime` (`useRecommendationsHome`, `useTrendingCategories`) keep the QueryClient default to preserve behavior.

**Two-shapes-one-factory-key pattern:** the legacy `queryKeys.recommendations.strategy(s)` factory served two distinct shapes — `PublicProduct[]` for trending/new_arrivals/deals, `{name,slug}[]` for `"trending-categories"`. The cache tuples never collided because their discriminator values differ (`["recommendations","strategy","trending"]` vs `["recommendations","strategy","trending-categories"]`), but the architectural awkwardness is real. Resolution: keep both under the byte-identical legacy key tuples (Rule A), but expose them via two distinct typed hooks (`useRecommendationsStrategy` vs `useTrendingCategories`) so the shape contract is explicit per consumer. Same pattern will recur in other domains where one factory key serves multiple shapes via a discriminator value — split the hooks, keep the keys.

**`PublicProduct` schema temporarily co-located:** `recommendations` is the first domain that needs a `PublicProduct` schema. To avoid blocking on the products-domain migration, the schema lives at the top of `lib/queries/recommendations.ts` with a `// IMPORTANT — hoist when products domain migrates` comment. **When the products domain is migrated next, hoist `PublicProductSchema` (and `PublicProductBadgeSchema`, `PreviewVideoMetaSchema`) to `lib/queries/products.ts` and import it back into `lib/queries/recommendations.ts`.** Same pattern will recur if a future domain needs a schema that "belongs" to a domain not yet migrated — co-locate temporarily, mark for hoisting, hoist on migration.

**Call sites — final state (every file migrated):**

| File | Hooks used | Notes |
|---|---|---|
| `app/recommended.tsx` | `useRecommendationsHome(200)` | Outlier closure; `take=200` distinguishes from the home carousel's `take=36`. |
| `app/(tabs)/(home)/index.tsx` | `useRecommendationsHome(PRODUCTS_HOME)`, `useRecommendationsStrategy("trending"\|"new_arrivals"\|"deals")`, `useTrendingCategories()` + inline `useQuery` for the non-rec "Suggestions for you" surface (`queryKeys.products.list`) | The local `customerFetch` import was dropped (no longer used); `NetworkError` is still imported by `fetchJSON`. |
| `app/(tabs)/(home)/category/[slug].tsx` | `useRecommendationsStrategy("trending")`, `useRecommendationsContext("category", slug)` + inline `useQuery` ×2 for non-rec surfaces (`queryKeys.categories.newArrivals`, `queryKeys.products.list`) | All four hooks `enabled: !!slug` — gating preserved verbatim from the legacy renderer. |
| `app/(tabs)/(home)/product/[id].tsx` | `useRecommendationsProduct(id, "bought_together"\|"viewed_together"\|"similar")` + inline `useQuery` for vendor "More from" + bottom "Recommended for you" (`queryKeys.vendors.products`, `queryKeys.products.list`) | Vendor-products `postProcess` (filter out current product, slice to 10) lifted into the queryFn. |
| `app/order-complete.tsx` | `useRecommendationsPostPurchase(order.publicId ?? orderId)` + the existing `useOrderDetail` | Hook gates on truthy orderId internally; passing `undefined` safely disables. `queryKeys` import dropped from the file entirely. |
| `app/(tabs)/cart.tsx` | `useRecommendationsStrategy("trending")` | Hook is always-mounted so the cache primes ahead of the empty state — matches the legacy slider's eager-fetch behaviour. |
| `app/search.tsx` | inline `useQuery` w/ `queryKeys.products.list` for the no-results "Recommended for you" | This surface hits `/products/public`, not a recommendations endpoint — no rec hook applies. |
| `app/orders/index.tsx` | inline `useQuery` w/ `queryKeys.products.list({sortBy:"rating",take:10})` for the Top-Rated footer carousel | Hits `customerFetch` (legacy slider's `publicFetch` is replaced with `customerFetch` to mirror the explicit cookie-credentialed default the legacy slider's network layer used) with a defensive `try/catch` returning `[]` on transport failure. |

**`queryKeys.recommendations` block deletion:** confirmed `rg "queryKeys\.recommendations"` outside `lib/queries/` returns zero hits in app code (only matches are in JSDoc/comment text). Block was removed from `lib/queryKeys.ts` as a separate gated step (replaced with a short comment block pointing at the sealed module). Same closing sequence as messages: cross-domain stragglers → audit zero hits → delete the domain block from `lib/queryKeys.ts` as a standalone signoff-gated step → only THEN move to the next domain.

**Schema notes (kept for reference — apply same reasoning to future domains):**
- All recommendations endpoints with envelope-shape responses are normalized at write time via the internal `extractProducts(raw: unknown): unknown[]` helper, which handles bare arrays, `{products}`, `{data}`, and `{items}` envelopes. Centralised in the fetchers per §F.14.
- `useRecommendationsHome` performs a fetch-and-fallback (try `/recommendations?context=home&take=...`; on failure, fall back to `/products/public?take=...&skip=0`). Both paths normalize to `{products, personalized}` — the fallback always yields `personalized: false`. Centralised in `fetchHomeRecommendations` per §F.14.
- The `useRecommendationsContext` hook intentionally fetches the SAME backend payload per `contextType` regardless of `contextId` (the URL only carries `contextType`; `contextId` is added to the cache key for per-scope isolation). This is **preserved verbatim** from the legacy slider behavior per §B.2 — the per-`contextId` cache fragmentation is a UX-deliberate isolation pattern, not a bug.

### E.4 — Long-tail batch 1 (DONE — kept for reference)

All four shipped together as one focused session: `addresses`, `paymentMethods`, `storeCredit`, and the `me`-key retirement. The trio of small modules + one factory-key deletion is the worked reference for the "long tail of small domains" pattern. Notes preserved for the patterns the next batch will reuse:

**Outliers:** None for any of the three sealed domains. Each had exactly one writer for its cache key in the entire codebase (cross-checked against `lib/useCheckout.ts`, `lib/cart.ts`, `lib/auth.tsx`, every component, every screen). No shape divergence; the migrations were straight key-shape-preserving rewrites with the legacy queryFn lifted into the fetcher.

**Bare-array canonical shape used for both `addresses` and `paymentMethods`** per §F.11 — neither endpoint is paginated, no caller consumes pagination metadata. The `extractX(payload: unknown): unknown[]` helper pattern (mirrored from `extractProducts` in recommendations) is the canonical way to defensively flatten the legacy multi-shape envelopes inside the fetcher.

**Bare-`number` canonical shape for `storeCredit`** is the only acceptable case of envelope-collapse in the sealed layer. See §F.17 (newly added).

**`me`-key retirement** is the worked reference for "factory key with zero call sites": don't scaffold a sealed module, just delete the entry with a comment block at the deletion site documenting the policy. Audit BEFORE you scaffold — `rg "queryKeys\.<key>"` outside `lib/queries/` is the cheap check.

**Final state:**

| File | Hooks used | Notes |
|---|---|---|
| `app/account/payment-methods.tsx` | `usePaymentMethods()`, `useStoreCreditBalance()` | `useQuery`/`queryKeys`/local `PaymentMethod` type imports all dropped. `customerFetch` retained for in-place mutations. |
| `app/account/addresses.tsx` | `useAddressesList()`, `invalidate.addresses.all()` ×2 | `useQuery`/`useQueryClient`/`queryKeys`/`FetchError`/`AuthError`/local `Address`/`useRouter` imports all dropped. Fallback chain moved into `fetchAddressesList`. |
| `lib/useCheckout.ts:cleanupAfterOrder` | `invalidate.addresses.all()`, `invalidate.storeCredit.all()` | `cart` invalidation stays on the legacy `queryClient.invalidateQueries({ queryKey: queryKeys.cart() })` (cart domain still un-migrated; a comment block on that line documents intent). |

**Closing audit:** `rg "queryKeys\.(me|addresses|paymentMethods|storeCredit)"` outside `lib/queries/` returns zero hits in app code. Lint warning count dropped from 16 → 14 (the two files removed from the warn list are the two account screens migrated above).

### E.5 — The remaining rest (long-tail batch 2)

**Current state (verified at end of batch 1):** `npm run lint` → 14 warnings, 0 errors. `npx tsc --noEmit` → exit 0. `npm run check:queries` → exit 0 (warn mode), 14 files listed.

**Remaining `lib/queryKeys.ts` live blocks (to be deleted as each domain migrates):**
- `products` — `all()`, `list(params)`, `detail(id)`
- `orders` — `all()`, `list(params?)`, `detail(id)` ← already sealed in `lib/queries/orders.ts`; the factory entry is legacy compat and deletes when orders is the ONLY domain left using the factory import in a given file (or at final flip)
- `returns` — `all()`, `list(params?)`, `replacementCheck(orderItemId)`
- `cart` — `cart()`
- `categories` — `all()`, `detail(slug)`, `products(slug, params?)`, `newArrivals(idOrSlug)`
- `vendors` — `detail(publicId)`, `products(publicId, params?)`, `reviews(publicId)`

**Remaining files with direct `@tanstack/react-query` imports (14 files):**

| File | `@tanstack/react-query` import | `queryKeys.*` domains touched | Inline unmanaged keys | Notes |
|---|---|---|---|---|
| `app/(tabs)/(home)/index.tsx` | `useQuery` | `products.list` ×3 | — | Three inline `useQuery` for different product lists. |
| `app/(tabs)/(home)/category/[slug].tsx` | `useQuery` | `categories.products`, `categories.newArrivals`, `products.list` | — | Two inline `useQuery` for categories, one for products. |
| `app/(tabs)/(home)/product/[id].tsx` | `useQuery` | `products.detail`, `vendors.products`, `products.list` | — | PDP: product detail + vendor products + bottom recommended. |
| `app/search.tsx` | `useQuery` | `categories.all`, `products.list` | — | Category list for filters + no-results recommended. |
| `app/orders/index.tsx` | `useQuery` | `returns.list`, `products.list` | — | Returns badge count + top-rated footer. |
| `app/orders/[id]/return.tsx` | `useQuery`, `useQueryClient` | `returns.list`, `returns.replacementCheck`, `returns.all` (invalidate) | — | Return initiation flow; also does `invalidate.orders.detail(id!)` + `invalidate.messages.cases.all()`. |
| `app/orders/[id]/review.tsx` | `useQuery`, `useQueryClient` | `products.detail` (invalidate only) | `["reviews", "mine", productIds]` | Review submission; invalidates product detail after submit. The `["reviews", ...]` key is unmanaged. |
| `app/orders/[id]/case.tsx` | `useQuery` | — | `["cases", "detail", issueId!]` | Uses ONLY an inline unmanaged key, no `queryKeys.*` at all. |
| `app/orders/[id]/missing.tsx` | `useQuery` | — | `["cases", "mine", id]` | Uses ONLY an inline unmanaged key, no `queryKeys.*` at all. |
| `app/vendor/[id]/index.tsx` | `useQuery`, `keepPreviousData` | `vendors.detail`, `vendors.products` | — | Vendor detail + paginated product grid. |
| `app/vendor/[id]/reviews.tsx` | `useQuery` | `vendors.reviews` | `[...queryKeys.vendors.reviews(id!), "summary"]` | Reviews list + review summary (summary key extends the factory key). |
| `components/QueryProvider.tsx` | `QueryClientProvider` | — | — | Infrastructure — stays on `@tanstack/react-query` permanently (add to `check-query-imports.sh` allowlist at final flip). |
| `lib/queryClient.ts` | `QueryClient` | — | — | Infrastructure — stays on `@tanstack/react-query` permanently (add to allowlist at final flip). |
| `lib/useCheckout.ts` | `useQueryClient` | `cart` (invalidate) | — | The lone `queryKeys.cart()` direct-key invalidation. Migrates when cart sealed module lands. |

**Domain inventory:**

| Domain | Notable files | Keys | Notes |
|---|---|---|---|
| **products** | `app/(tabs)/(home)/index.tsx` (×3), `app/(tabs)/(home)/category/[slug].tsx` (×1), `app/(tabs)/(home)/product/[id].tsx` (detail + list), `app/search.tsx` (×1), `app/orders/index.tsx` (×1), `app/orders/[id]/review.tsx` (invalidate only) | `all`, `list(params)`, `detail(id)` | **Largest remaining domain.** 7 inline `useQuery` call sites + 1 invalidation-only. **Co-locate `PublicProduct` schema here** and update `lib/queries/recommendations.ts` to import it back (the temporary co-location is documented in §E.3). Hoist `PublicProductBadgeSchema` and `PreviewVideoMetaSchema` at the same time. The `app/orders/[id]/review.tsx` `products.detail(productId)` invalidation → `invalidate.products.detail(productId)`. |
| **categories** | `app/(tabs)/(home)/category/[slug].tsx` (products + newArrivals), `app/search.tsx` (all) | `all`, `detail(slug)`, `products(slug, params?)`, `newArrivals(idOrSlug)` | 3 call sites. Has parameterized `products(slug, params)` keys — apply `normalizeListParams` pattern from orders. `categories.all()` is used for the search filter dropdown. |
| **vendors** | `app/vendor/[id]/index.tsx` (detail + products), `app/vendor/[id]/reviews.tsx` (reviews + summary), `app/(tabs)/(home)/product/[id].tsx` (vendor products) | `detail(publicId)`, `products(publicId, params?)`, `reviews(publicId)` | 5 call sites across 3 files. The reviews-summary key extends the factory key (`[...queryKeys.vendors.reviews(id!), "summary"]`) — model as `reviews(publicId)` and `reviewsSummary(publicId)` in the sealed module. The PDP "More from vendor" inline `useQuery` already has the post-process baked into its queryFn — lift verbatim into the sealed fetcher. The `app/vendor/[id]/index.tsx` uses `keepPreviousData` for paginated sort transitions — preserve via a `placeholderData` option in the typed hook. |
| **returns** | `app/orders/[id]/return.tsx` (list + replacementCheck + `all` invalidate), `app/orders/index.tsx` (list) | `all`, `list(params?)`, `replacementCheck(orderItemId)` | 4 call sites across 2 files. `replacementCheck` is per-orderItemId. `app/orders/[id]/return.tsx` also performs `invalidate.orders.detail(id!)` + `invalidate.messages.cases.all()` (cross-domain, already on typed namespace) + `queryClient.invalidateQueries({ queryKey: queryKeys.returns.all() })` (this one migrates to `invalidate.returns.all()`). |
| **cart** | `lib/useCheckout.ts:cleanupAfterOrder` | `cart()` | 1 call site. Mutation-heavy domain — audit `setQueryData`/`setQueriesData` in `lib/cart.ts` and `lib/useCheckout.ts` carefully. May need typed mutation helpers in the sealed module. |
| **search** | `app/search.tsx` | — | Verify if it has its own dedicated query key or only touches `categories.all` + `products.list` (which are covered by those domains). If the latter, search has NO dedicated sealed module and the file clears automatically when categories + products are done. |

**Unmanaged inline keys (NOT in `lib/queryKeys.ts`):**
- `["reviews", "mine", productIds]` in `app/orders/[id]/review.tsx` — needs either a `reviews` sealed module or folding into the `products` domain. Only one call site. Audit whether any other file reads/writes this key.
- `["cases", "detail", issueId!]` in `app/orders/[id]/case.tsx` — does NOT align with the messages domain's `["messages", "cases", "detail", caseNumber]`. Either fold into messages domain (if it hits the same `/cases/by-id/` endpoint), create a separate `cases` sealed module, or leave as-is if it's genuinely a different concept (order-scoped case vs. customer case). Read the file to decide.
- `["cases", "mine", id]` in `app/orders/[id]/missing.tsx` — similar to above; hits `/cases/mine` which IS the same endpoint as `useCasesList` / `useCasesListFlat`. Strong candidate for folding into the messages domain under a new hook or reusing `useCasesList`.

**Suggested migration order (dependencies flow left-to-right):**
1. **products** first (unblocks schema hoist from recommendations, clears the most call sites).
2. **categories** and **vendors** in parallel or back-to-back (independent of each other, both depend on products being done to clear multi-domain files).
3. **returns** (depends on orders + messages being done — they are; but touches files that also use products/categories, so products should be done first).
4. **cart** last among the domain modules (single call site, but mutation-heavy and may need careful `setQueryData` audit).
5. **Unmanaged keys** (`reviews`, `cases` inlines) — fold into the appropriate sealed modules during or after the domain they most naturally belong to.
6. **Final flip** — §H checklist.

**Infrastructure files that need allowlisting (NOT migration):**
- `components/QueryProvider.tsx` — `QueryClientProvider` import. This is infrastructure; it stays. Add to the `check-query-imports.sh` allowlist at final flip.
- `lib/queryClient.ts` — `QueryClient` import. Same; infrastructure, stays.
- `lib/queries/_internal/react-query.ts` — already allowlisted; this IS the bridge.
- `lib/queries/_client.ts` — already uses `_internal` bridge; clean.

For each domain: outlier first (audit by reading every queryFn that uses the same key — if any return different shapes, that's the outlier; if all return the same shape, any caller can be first).

---

## §F — Common gotchas (lessons from the orders + messages migrations)

Items 1–10 are from the orders migration. Items 11–15 are from the messages migration. All apply universally to every remaining domain.

1. **`v.object` silently strips fields.** Caught only because the user pushed back on "phase-in normalization." If you see schema-validated data missing a field a caller used to read, you used `v.object` instead of `v.looseObject`. There is no other way this happens.
2. **Legacy `lib/types.ts` is sometimes *narrower* than the actual API.** When the canonical inferred type rejects something `lib/types.ts` permitted, prefer **loosening the legacy type** (`string` → `string | null`) over tightening the canonical schema. Backend reality > legacy type aspirations. (See `OrderItem.images` precedent.)
3. **One caller in seven encoded the URL — bake it into the queryFn.** `app/order-complete.tsx` was the only `orders.detail` caller that ran `encodeURIComponent` on the id. Defensive encoding inside `fetchOrderDetail` matched its behavior and harmlessly upgraded the other six. Look for the same pattern elsewhere (`messages.cases.detail` may have similar drift).
4. **Redundant invalidations should consolidate.** `app/orders/[id]/cancel.tsx` was calling both `invalidateQueries({ queryKey: queryKeys.orders.detail(id) })` and `invalidateQueries({ queryKey: queryKeys.orders.all() })` — the second covers the first. Replace with the single `invalidate.orders.all()`. **But** only collapse when one truly subsumes the other; preserve both if they target different domains.
5. **`enabled` in hooks gates execution timing only.** Never gate it on a different fetcher path or different schema. The plan §0 invariant `one key → one fetcher → one schema` is non-negotiable. If a caller seems to need different fetchers based on a flag, that's actually two separate hooks (or one hook + a derived `useMemo`).
6. **Don't pre-export future hooks.** The public barrel (`lib/queries/index.ts`) exports only what's been built. Don't add stub exports for messages/recs hooks before those domains exist — leave the surface honest.
7. **`react-hooks/exhaustive-deps` rule namespace must be registered.** Already done in `eslint.config.mjs` via `eslint-plugin-react-hooks`. If a future ESLint upgrade or config edit removes it, the disable pragmas in app code will error. Don't enable any of the plugin's rules — registration alone is what we need.
8. **Don't run git operations.** Repeating because it's the easiest one to slip on. The user reviews and stages diffs themselves.
9. **Paginated endpoints — model the envelope, NOT a bare array.** During orders Step D the canonical shape was found to be lossy: `Order[]` had silently erased `nextCursor` and `hasMore` that the load-more UI depended on. The corrected canonical shape is `{ data: Order[], nextCursor: string | null, hasMore: boolean }`. Apply the same rule to every other paginated domain (products list, recommendations context, search, vendor products, category products, etc.). The schema-as-contract has to match what the backend *actually serves*, not a tidied-up simplification of it. Cursor/pagination fields go on the schema. Required vs. optional: only loosen when you've seen the field genuinely missing — `v.looseObject` keeps unknown fields anyway, so being strict on documented fields costs nothing and surfaces backend regressions loudly via `parseOrThrow`.
10. **Read both the legacy `queryKey` AND the legacy URL before picking new-hook params.** Orders Step D had key/URL drift: `queryKeys.orders.list()` (no params) paired with `customerFetch("/orders?limit=50")` (URL with `limit`). Picking `useOrdersList({ limit: 50 })` based on the URL would have produced a *different* cache key from the legacy one and fragmented the cache during migration. The byte-identical key wins; verify the URL still resolves correctly via `customerFetch` defaults (`lib/api.ts:160-162` auto-appends `limit=PAGE_SIZE.DEFAULT`).
11. **Bare-array vs envelope canonical shape — decide per endpoint, not per domain.** Orders Step D corrected the canonical shape from `Order[]` → envelope because the load-more UI needed `nextCursor`/`hasMore`. The messages domain went the opposite way: all four list endpoints (`/messages/conversations`, `/support/tickets`, `/cases/mine?limit=50`, `/cases/mine?limit=200`) are canonicalised as **bare arrays** because zero callers today consume pagination metadata. The rule: model what the runtime actually delivers AND what callers actually consume. If a paginated UI exists → envelope. If not → bare array (the fetcher still defensively `unwrapList`s before validating, mirroring the legacy pattern). `v.looseObject` keeps unknown fields so the upgrade path is open: when a load-more lands on, say, `/cases/mine`, switch THAT endpoint's canonical shape to an envelope and migrate its callers — exactly as orders Step D did. Document the divergence loudly in a top-of-section comment so the next reader doesn't assume the orders pattern is the universal pattern. See `lib/queries/messages.ts` lines ~313–336 for the worked comment block.
12. **Per-hook polling/enabled options — expose via a `QueryOpts` type, never via passthrough of `UseQueryOptions`. Cache-policy options (`staleTime`, `gcTime`) belong INSIDE the hook, not in `QueryOpts`.** Multiple messages detail screens use `refetchInterval: 30_000`. Exposing those flags safely required a local `type QueryOpts = { enabled?: boolean; refetchInterval?: number | false }` and explicit pass-through inside each hook. Reasoning: `enabled` and `refetchInterval` affect TanStack observer *timing* only — they never change the queryFn or cache key, so they're safe under the single-writer invariant.

    The temptation during the messages migration was to also expose `staleTime` (the orders-screen `cases.listFlat` caller had `staleTime: 5 * 60_000` we needed to preserve). **That was rejected.** Two related reasons:

    - **Invariant reasoning:** anything that influences cache *content* (`queryFn`, `select`, `initialData`, `placeholderData`, `queryKey`) WOULD obviously violate single-writer. But cache *policy* (`staleTime`, `gcTime`) is a different category of risk — same-key-different-policy reintroduces the original bug class in a subtler form: two screens reading the same cache entry would assume different freshness semantics, leading to flickery UI on one screen and stale reads on the other.
    - **Architectural reasoning:** cache freshness is a property of the **data + key**, not of the **caller**. It belongs co-located with the queryFn and schema, not as a runtime knob the UI layer chooses per-mount. Exposing it would replicate the "random tuning at call sites" anti-pattern the sealed layer exists to eliminate.

    **The rule:** `staleTime` belongs inside the hook, baked in. If a future caller genuinely needs different freshness for the same backend payload, the answer is a **separate hook with a separate key** (e.g. `useCasesListFlatRealtime` with no `staleTime` and a distinct `["messages", "cases", "listFlat", "realtime"]` key), NOT a `staleTime?: number` knob. Worked example: `lib/queries/messages.ts` `useCasesListFlat` — module-level `CASES_LIST_FLAT_STALE_TIME_MS = 5 * 60_000` constant, hardcoded in the `useQuery` call, documented as "policy lives with the data" in the `useCasesListFlat` JSDoc.

    Apply this rule going forward: when you find a legacy caller passing `staleTime`/`gcTime`, lift the value into a named module-level constant inside the domain's queries file, hardcode it into the relevant hook, and add a comment explaining why this hook's data tolerates that freshness window. Same for any caller passing `refetchOnWindowFocus`, `refetchOnMount`, `refetchOnReconnect` — these are policy, not preference.

    Reuse the `QueryOpts` pattern — copy it verbatim — in every domain that has polling/enabled callers (messages did; recommendations probably will; cart/me probably won't).
13. **Don't expose a read hook for an invalidate-only key.** `messages.unread()` is invalidated by 3 mutation call sites but read by zero consumers in the codebase today. Adding `useUnreadCount` "for completeness" would create a phantom writer for a key with no reader — the queryFn would mint cache entries that are immediately stale, and the schema would have nothing to validate against in practice. Only `invalidate.messages.unread()` is exported. When (if) a consumer lands, the read hook + schema land at the same time. Apply this rule to every other domain: enumerate readers BEFORE exporting hooks; if the count is zero, export only the invalidate helper.
14. **Centralise outliers (two-step fetches, envelope unwraps, post-filters) inside the fetcher — never at the call site.** Three messages call sites had non-trivial response normalization at the queryFn level: `app/account/messages/conversation/[id].tsx` (two-step fetch when `detail.messages` is missing), `app/support/ticket-detail/[ticketId].tsx` (`res?.data ?? res?.ticket ?? res` envelope unwrap), `app/account/messages/family/[familyNumber].tsx` (post-filter by familyNumber). All three are now baked into the canonical fetchers (`fetchConversationDetail`, `fetchTicketDetail`, `fetchFamilyCases`). Reasoning: any fragment of normalization that lives outside the single-writer module breaks the invariant — a future consumer of the same key would silently get a different shape. The call site becomes pure UI consumption; the fetcher is the only place that knows about the backend's quirks.
15. **Defer schema-redundant defensive code to the *last* file of a domain.** When migrating `app/support/message-seller/all.tsx`, the existing `useMemo(() => unwrapList(raw), [raw])` belt-and-suspenders was preserved verbatim, even though the canonical hook now guarantees a `Conversation[]`. The same pattern lives in `app/account/messages.tsx` (3 instances). Both removals are deliberately deferred to the very last commit of the messages domain so the diff is reviewable in isolation as the *single* explicit behavior change the plan authorises (plan §4c). Apply the same discipline in every domain: defensive-code removal is its own commit, gated on the user explicitly approving the behavior delta. Don't bundle it with a routine call-site swap.
16. **Lift component-owned queries before migrating call sites.** A "generic data-fetching component" (one that takes `apiUrl`/`queryKey`/`postProcess` as props and runs its own `useQuery` internally) is the worst form of single-writer violation: every caller is implicitly a writer for an arbitrary cache key, so the component itself is what makes the bug class possible. The recommendations migration found exactly one of these (`ProductRecommendationSlider`) and refactored it to be presentation-only (`products` + `loading` props) **before** migrating any call site. The order matters: if you migrate call sites first and leave the component as a writer, you now have BOTH the typed hook AND the component competing to write the same cache key — single-writer violated even harder than before. Refactor the component first, let the type checker tell you which call sites broke, fix them one by one with the appropriate typed hook. **Audit pattern for future domains:** `rg "useQuery|useMutation" components/` before starting — any hits are component-owned-query candidates that need the same treatment.
17. **Envelope-collapse to a primitive is allowed ONLY for irreducible single-field endpoints with a single writer and zero adjacent-field potential.** The `storeCredit` domain stores a bare `number` in the cache (the extracted `balanceCents` value), not the wire envelope `{balanceCents}`. That decision is the SOLE acceptable case of envelope-collapse in the sealed layer, gated on three preconditions: (a) exactly one writer (the sealed module), so collapsing here cannot create the multi-writer divergence problem we're solving elsewhere; (b) the endpoint has no other useful fields — the envelope is a one-field wrapper, not a slice of a richer object; (c) every observed consumer reads the value as the primitive directly, so preserving the envelope would force an `.x` accessor on every caller for no observable benefit. **If any of those preconditions fails, model the envelope.** The default for every new domain is "preserve the envelope, looseObject everywhere" — primitive collapse is the explicit exception, never the rule. If the backend ever adds adjacent fields to a collapsed-shape endpoint (e.g. `{balanceCents, currency, expiresAt}`), the collapse becomes a bug; widen the canonical shape to the full envelope at THAT migration step. The escape hatch is documented in the file-level docblock of any module that uses it (see `lib/queries/storeCredit.ts` for the worked example).

---

## §G — Cheatsheet: the exact migration of a single call site

Take any caller, e.g. `app/foo/bar.tsx`:

```tsx
// BEFORE
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customerFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

const queryClient = useQueryClient();
const orderQuery = useQuery({
  queryKey: queryKeys.orders.detail(id!),
  queryFn: () => customerFetch(`/orders/by-public-id/${id}`),
  enabled: !!id,
});

await someAction();
queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id!) });

// AFTER
import { useOrderDetail, invalidate } from "@/lib/queries";

const orderQuery = useOrderDetail(id);

await someAction();
void invalidate.orders.detail(id!);
```

Notes:
- `useQueryClient` is gone iff this file no longer uses it for any other domain.
- `customerFetch` import stays only if other code in the file still uses it directly (most places do).
- `queryKeys` import stays only if other domains in the file still reference it.
- The `void` prefix on `invalidate.*` calls is convention — these are fire-and-forget Promises; explicit `void` documents intent and silences `no-floating-promises` if it's ever enabled.
- The hook's `data` is now `Order | undefined` (canonical type from the schema). If you need a non-canonical field, define a local type and cast.

---

## §H — Final checklist before flipping the rule to error

When the last domain is done:

1. `npm run lint` — must report **0 warnings, 0 errors**.
2. `npm run check:queries` — must report **`[OK] Sealed query layer: no boundary violations.`** (default warn mode).
3. `STRICT=1 npm run check:queries` — must exit 0.
4. `rg "queryKeys\." --type ts --type tsx` outside `lib/queries/` and `lib/queryKeys.ts` itself — must return **zero hits**.
5. `rg "from ['\"]@tanstack/react-query['\"]" --type ts --type tsx` outside `lib/queries/_internal/` — must return **zero hits**.
6. Edit `eslint.config.mjs`: change `"no-restricted-imports": ["warn", ...]` → `["error", ...]`.
7. Edit `scripts/check-query-imports.sh`: change the default-mode `exit 0` to `exit 1` (or remove the `STRICT` toggle entirely — at this point hard mode is the only mode).
8. Delete `lib/queryKeys.ts`.
9. Re-run all four verification commands. Everything still 0.
10. Show the diff to the user. Wait for approval. Do not commit.

---

## §I — If you get stuck

The user is direct and prefers being told "I'm not sure what's right here, please decide" over silent guesses. Triggers for stopping and asking:

- Two callers under the same key disagree on shape and you can't tell which is canonical.
- A queryFn does work that isn't a fetch (mutation-style side effects in a `useQuery`). This is a code-smell symptom but the fix may be out of scope.
- A call site uses TanStack Query in a way the plan doesn't cover (`useInfiniteQuery`, `useSuspenseQuery`, `useQueries`).
- You hit a schema mismatch where `parseOrThrow` would reject real backend data. **Loosen the schema** (`v.looseObject` everywhere already; if a *value* type is wrong, widen it to `v.union([...])` or `v.unknown()` with a `// SCHEMA_TODO:` marker per plan §6).
- The user changes scope mid-stream. Ask whether the new request supersedes the migration plan or runs in parallel.

When in doubt: the plan (`.cursor/plans/sealed_query_layer_c4f8a2b1.plan.md`) is the contract. Re-read §0 (the rule) and §3.1 (Rules A/B/C) when something feels uncertain.

---

## §J — Transcript references

Four relevant transcripts exist. Search by keyword before reading — they're large.

**1. Original orders-domain migration + scaffolding** (the contract that established every guardrail above):
`/Users/jonathan/.cursor/projects/Users-jonathan-Desktop-wabbascus-wabbascus2-Wabbus-src/agent-transcripts/1e5bd70c-9406-4724-8c00-18d3d7688300/1e5bd70c-9406-4724-8c00-18d3d7688300.jsonl`

Useful keywords: `looseObject`, `encodeURIComponent`, `invalidateOrders`, `OrderItem`, `pickItemImage`, `react-hooks`, `OrdersListResponse`, `nextCursor`. The user's stance on architecture, urgency, and behavior preservation is documented in their pushback messages — re-read those rather than paraphrasing them. The pivotal exchange is the user's response to "Option 1 vs Option 2 vs Option 3" on the orders-list canonical shape (search `lossy transformation`); that message establishes the bare-array vs envelope rule cited in §F.11.

Cite as: [Sealed Query Layer Mobile](1e5bd70c-9406-4724-8c00-18d3d7688300).

**2. Messages-domain migration** (this handoff's most recent work):
`/Users/jonathan/.cursor/projects/Users-jonathan-Desktop-wabbascus-wabbascus2-Wabbus-src/agent-transcripts/8d724f81-102a-4736-8395-dea6b3cfc1a7/8d724f81-102a-4736-8395-dea6b3cfc1a7.jsonl`

Useful keywords: `useConversationsList`, `useFamilyCases`, `QueryOpts`, `fetchConversationDetail`, `fetchFamilyCases`, `lastMessageBody`, `unwrapList`, `bare array`. Includes the rationale for canonicalising messages list endpoints as bare arrays (vs the orders envelope), the `QueryOpts` introduction, the `useUnreadCount` non-export decision, the centralised post-filter for `useFamilyCases`, and the `as unknown as Conversation[]` local-cast in `app/support/message-seller/all.tsx`. Each per-call-site migration commit-equivalent diff is documented in the assistant turns — useful as worked examples for the remaining files.

Cite as: [Messages Domain Migration](8d724f81-102a-4736-8395-dea6b3cfc1a7).

**3. Recommendations-domain migration** (this handoff's most recent work):
`/Users/jonathan/.cursor/projects/Users-jonathan-Desktop-wabbascus-wabbascus2-Wabbus-src/agent-transcripts/1b59068e-14c1-496e-a176-8f2a913ed3ab/1b59068e-14c1-496e-a176-8f2a913ed3ab.jsonl`

Useful keywords: `useRecommendationsHome`, `useRecommendationsStrategy`, `useTrendingCategories`, `useRecommendationsContext`, `useRecommendationsProduct`, `useRecommendationsPostPurchase`, `RECS_SLIDER_STALE_TIME_MS`, `extractProducts`, `ProductRecommendationSlider`, `take`-parameterized cache key. Includes the rationale for parameterising `recommendations.home()` by `take` to close the shape collision (the explicit Rule B divergence from byte-identical keys), the `ProductRecommendationSlider` lift to a presentation-only component, the `PublicProductSchema` co-location decision (with hoisting marker for the products-domain migration), and the per-call-site migration diffs. Each call site's typed-hook swap + remaining inline-`useQuery` rationale (for non-rec product list endpoints whose domain is still un-migrated) is documented in the assistant turns — useful as worked examples for the long-tail domains.

Cite as: [Recommendations Domain Migration](1b59068e-14c1-496e-a176-8f2a913ed3ab).

**4. Long-tail batch 1 migration (addresses, paymentMethods, storeCredit, me retirement):**
`/Users/jonathan/.cursor/projects/Users-jonathan-Desktop-wabbascus-wabbascus2-Wabbus-src/agent-transcripts/1b59068e-14c1-496e-a176-8f2a913ed3ab/1b59068e-14c1-496e-a176-8f2a913ed3ab.jsonl`

(Same transcript as #3 — the long-tail batch 1 was completed as a continuation of the recommendations session.) Useful keywords: `useAddressesList`, `usePaymentMethods`, `useStoreCreditBalance`, `fetchAddressesList`, `extractAddresses`, `extractPaymentMethods`, `envelope-collapse`, `me key`, `cleanupAfterOrder`. Includes the `me`-key zero-call-site retirement rationale, the storeCredit bare-`number` canonical shape justification (§F.17), the 3-endpoint defensive fallback chain centralisation for addresses, and the cross-domain invalidation partial migration in `lib/useCheckout.ts` (addresses + storeCredit done, cart deferred).

Cite as: [Long-tail Batch 1](1b59068e-14c1-496e-a176-8f2a913ed3ab).
