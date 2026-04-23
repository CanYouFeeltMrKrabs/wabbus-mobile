# Handoff — TanStack Query Key Shape Collisions

**Status:** All three identified instances fixed. (1) Messages conversations — fixed by initial `unwrapList` patch and superseded by the messages-domain sealed-layer migration. (2) `orders.detail(id)` — fixed during the orders-domain sealed-layer migration (Step B outlier closure: `support/message-seller/[orderId]` no longer writes `SelectableItem[]` under that key; items are derived locally via `useMemo`). (3) `recommendations.home()` — fixed during the recommendations-domain sealed-layer migration (Step B outlier closure: canonical schema enforced via `parseOrThrow` AND `take` baked into the cache key so the home carousel and "browse more" page occupy distinct cache entries with the same schema). The structural fix lives in `lib/queries/{orders,messages,recommendations}.ts`; this document is preserved as historical context for the bug class.

## TL;DR

In TanStack Query, every cache entry is keyed by `queryKey`. The cache stores whatever the `queryFn` returns. If two `useQuery` call sites use the same `queryKey` but their `queryFn`s return different shapes, whichever screen mounts first decides the cached shape — and the other screen will then read a value of the wrong shape from cache and crash on the first operation that assumes a specific shape (`[...x]`, `x.map`, `x.foo`, etc.).

This invariant ("one key = one shape") is **not enforced by TypeScript or by the TanStack API**. It's a hand-shake that lives in the developers' heads. We just got bitten by it.

## What was already reported and fixed

User crash on `/account/messages`:

```
TypeError: iterator method is not callable
  at let list = [...conversations];
  app/account/messages.tsx:195
```

Root cause: `messages.tsx` and `support/message-seller/all.tsx` both used `queryKeys.messages.conversations.list()`. `messages.tsx`'s queryFn unwrapped to an array. `all.tsx`'s queryFn returned the raw `{ data: [...], pagination: {...} }` envelope. If a user opened `all.tsx` first, the cache held the envelope; then on `messages.tsx`, `[...envelope]` crashed Hermes.

Fix shipped:

- Added `unwrapList<T>(raw)` helper in `lib/api.ts` — single source of truth for normalizing list-endpoint envelopes vs bare arrays. Always returns an array, never throws, O(1) when input is already an array.
- Both queryFns now call `unwrapList` inside the queryFn so the **cached value is always an array** for that key, regardless of which screen mounts first.
- Defensive `useMemo(() => unwrapList(raw), [raw])` wrapper in `messages.tsx` re-normalizes on read so a stale cache entry from an old build (pre-fix) cannot crash the screen during the OTA hop. Belt-and-suspenders; safe to remove later.

Files touched:
- `lib/api.ts` (added `unwrapList`)
- `app/account/messages.tsx` (queryFns + defensive normalization)
- `app/support/message-seller/all.tsx` (queryFn)

`tsc --noEmit` passes clean. ESLint clean.

## What is still broken (not yet fixed)

Two more keys have the same class of latent bug. They have NOT triggered user reports yet — only because the navigation order that activates them isn't a common path. They are real bugs sitting there.

### 1. `recommendations.home()` — HIGH severity (FIXED)

Two callers, two different shapes:

- `app/(tabs)/(home)/index.tsx:125` — queryFn returned `{ products: PublicProduct[], personalized: boolean }` (normalized) with `take=PRODUCTS_HOME` (36).
- `app/recommended.tsx:36` — queryFn returned the raw `{ personalized?: boolean } & Record<string, unknown>` API envelope (unnormalized) with `take=200`.

Trigger: user opened "See all recommended" first, then tapped Home — or vice versa across sessions. Likely outcome: empty home carousel or a crash on `data.products.map(...)`.

**Fix shipped (sealed-layer migration §E.3):** both callers now go through `useRecommendationsHome(take)` in `lib/queries/recommendations.ts`. Resolution applied **both halves**: (a) single canonical schema `{products, personalized}` enforced via `parseOrThrow` so the cache shape is invariant regardless of which screen wrote it; (b) `take` baked into the cache key (`["recommendations", "home", take]`) so the home carousel (take=36) and "browse more" page (take=200) occupy distinct cache entries with the same schema. The legacy `queryKeys.recommendations.home()` factory key has been retired with the rest of the recommendations block in `lib/queryKeys.ts`.

### 2. `orders.detail(id)` — HIGH severity (FIXED)

Seven callers. Six returned the order envelope `{ order: {...} }` from `/orders/by-public-id/${id}`. **One returned a parsed array of line items**:

- `app/support/message-seller/[orderId].tsx:144-167` — queryFn returned `SelectableItem[]` from `parseOrderItems(...)`.
- All other callers (`app/orders/[id]/index.tsx`, `cancel.tsx`, `tracking.tsx`, `return.tsx`, `review.tsx`, `missing.tsx`, `app/order-complete.tsx`) returned the order envelope.

Trigger: user started the "message seller about this order" flow (`/support/message-seller/[orderId]`), then opened the order detail page (`/orders/[id]`) for the same order. The detail page would read `data.order` from what is actually an array. Likely outcome: blank order screen or a crash when something does `order.items.map(...)`.

**Fix shipped (sealed-layer migration §E.1):** every caller now goes through `useOrderDetail(id)` in `lib/queries/orders.ts`. The outlier (`support/message-seller/[orderId]`) was rewritten to use `useOrderDetail` for the canonical envelope and derive `SelectableItem[]` locally via `useMemo` (UI projection, not server state).

### 3. `messages.cases.detail(n)` and `messages.cases.messages(n)` — LOW severity (FIXED)

Two callers each (`app/account/messages/case/[caseNumber].tsx` and `components/CaseDetailPanel.tsx`). Today the queryFns were **identical** in both files — same endpoint, same unwrap. Not a current bug, just duplicated code that could drift.

**Fix shipped (sealed-layer migration §E.2):** both callers now go through `useCaseDetail(caseNumber)` and `useCaseMessages(caseNumber)` in `lib/queries/messages.ts`. Single fetcher per key, no drift possible.

## How the bug is created (not laziness — tooling gap)

This is not a moral failure. It's the natural result of two reasonable developers writing reasonable code months apart:

1. Dev A writes screen 1 with `useQuery({ queryKey: K, queryFn: F1 })`. Works in isolation. Ships.
2. Dev B writes screen 2 needing the same data, reuses key `K` (which is exactly what `queryKeys.ts` is designed for), writes a fresh `F2` with a slightly different unwrap. Works in isolation. Ships.
3. Neither dev runs both screens in the same session. Bug is latent until a user does.

TanStack Query's API does not surface the constraint "key K must always cache shape S". TypeScript doesn't catch it. ESLint doesn't catch it. Tests don't catch it (each screen tests in isolation). The only thing that catches it is a user navigating in the wrong order on a real device with real cache lifetimes.

## Recommended fix (when Jonathan greenlights)

For the two HIGH-severity items, the targeted fix is the same pattern as the messages fix:

1. Pick the shape you want to cache (the more useful, more normalized one).
2. Make every `queryFn` for that key return that shape, calling `unwrapList` (or an equivalent `unwrapEnvelope`) inside the queryFn. Do the unwrap at WRITE time, not at read time.
3. Update the read sites to expect the canonical shape directly.

For `orders.detail(id)`: standardize on the order envelope `{ order: {...} }`. Refactor `support/message-seller/[orderId].tsx` to NOT cache its parsed-items result under `orders.detail` — it should either use a separate key (`['orders', 'detail', id, 'parsed-items']`) or derive the items locally with `useMemo` from the cached envelope.

For `recommendations.home()`: standardize on the normalized `{ products, personalized }` shape. Refactor `recommended.tsx` to do the same normalization in its queryFn.

## Larger architectural option (not approved, do not do unless Jonathan asks)

A proper fix to **prevent this entire class of bug forever** is the typed-hook-per-key pattern: every `useQuery` lives in `lib/queries/<domain>.ts`, exported as a hook like `useConversationsList()` that owns BOTH key and queryFn. Call sites import the hook; they cannot supply their own queryFn. Pair with an ESLint `no-restricted-syntax` rule banning bare `useQuery` outside `lib/queries/`. This makes the bug structurally impossible.

Jonathan was offered this and pulled back — said it was over-engineering for the immediate report. Do not propose it again unless the user brings it up.

## Files to read

- `lib/api.ts` — `unwrapList` helper, look here before adding any envelope-handling logic
- `lib/queryKeys.ts` — the key factory; understand which keys are scoped per-id vs global
- `app/account/messages.tsx` — reference example of the fixed pattern
- `app/support/message-seller/all.tsx` — reference example of the second fixed call site
- `app/(tabs)/(home)/index.tsx:125-135` — first half of the recommendations bug
- `app/recommended.tsx:36-50` — second half
- `app/support/message-seller/[orderId].tsx:144-167` — the orders.detail outlier
- `app/orders/[id]/index.tsx:88-91` — canonical orders.detail shape

## Things to NOT do

1. **Do not "fix" by adding `Array.isArray` guards everywhere on the read side.** That's whack-a-mole. The bug is on the write side — two queryFns disagreeing on shape. Fix the queryFns.
2. **Do not change `queryKeys.ts` to add per-screen suffixes.** That defeats the entire purpose of cache sharing and would force redundant network requests.
3. **Do not propose the typed-hook-per-key refactor unless asked.** See above.
4. **Do not commit anything without explicit approval from Jonathan.** Workspace rule.
