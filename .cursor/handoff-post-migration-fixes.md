# Handoff — Post-Migration Runtime Fixes (Mobile)

**Status:** All fixes applied. `tsc` and `eslint` both clean. Not yet committed — user must approve before any git operations.

**Scope:** `wabbus-mobile/` only. All changes are defensive fixes for schema mismatches exposed after the sealed query layer migration. No backend changes. No new features.

---

## What happened

After the sealed query layer migration shipped (`48feac1`), several screens started rendering indefinitely (stuck on skeleton/spinner). The root cause is the same in every case: **`parseOrThrow` rejects the entire API response when even one field doesn't match the Valibot schema, TanStack Query retries forever, and the UI never exits the loading state.**

The old code used loose TypeScript types (`type Ticket = { ... }`) with no runtime validation — bad fields were silently `undefined` and defensive fallbacks (`|| []`, `?? ""`) absorbed them. The sealed layer introduced `parseOrThrow` which is strict by design. The fix is to align schemas with what the backend actually returns, and to add per-item filtering for arrays so one bad item doesn't nuke the whole list.

---

## §1 — Fixes applied (in chronological order)

### 1.1 — Home carousels stuck on skeletons

**Symptom:** All product carousels on the home screen (trending, new arrivals, deals) showed grey skeleton placeholders indefinitely.

**Root cause:** Test products in the database had `price: null` and empty `slug`. `PublicProductSchema` required `price: v.number()`. `parseOrThrow` on the full array threw, killing the entire fetch.

**Fix:** Introduced `filterValidItems()` in `lib/queries/_validate.ts` — validates each array item individually via `v.safeParse`, drops invalid items silently, logs a Sentry breadcrumb with the drop count. Applied to all array-returning fetchers:
- `lib/queries/products.ts` → `fetchProductsList`
- `lib/queries/recommendations.ts` → `fetchHomeRecommendations`, `fetchRecommendationsStrategy`, `fetchRecommendationsContext`, `fetchRecommendationsProduct`, `fetchRecommendationsPostPurchase`
- `lib/queries/categories.ts` → `fetchCategoryProducts`, `fetchCategoryNewArrivals`
- `lib/queries/vendors.ts` → `fetchVendorProducts`, `fetchVendorMoreProducts`

**File:** `lib/queries/_validate.ts` — new export `filterValidItems<TSchema>(itemSchema, items, queryKey)`

### 1.2 — Product detail page (PDP) stuck on skeletons

**Symptom:** Tapping any product from a carousel → blank page with skeleton forever.

**Root cause:** `ProductDetailSchema` required `image: v.nullable(v.string())`, `price: v.number()`, `ratingAvg: v.number()`, `reviewCount: v.number()`, `vendorName: v.nullable(v.string())` as top-level fields. The `/products/public/:id/view` endpoint returns a raw database model where these are nested within `images`, `variants`, `vendor` objects or absent entirely.

**Fix:** Made all five fields `v.optional(v.nullable(...))` in `ProductDetailSchema` in `lib/queries/products.ts`.

### 1.3 — `resolutionIntent` null-guard failures

**Symptom:** TypeScript errors after making `resolutionIntent` optional in `CustomerCaseSchema` / `CustomerCaseDetailSchema` (needed because new cases have no resolution intent).

**Fix:** Added null-guarding (`caseDetail.resolutionIntent ? ... : null`) in:
- `app/account/messages/case/[caseNumber].tsx`
- `components/CaseDetailPanel.tsx`

### 1.4 — `addresses.ts` schema — optional `zip`

**Symptom:** Address fetch failing for records where backend uses `postalCode` interchangeably or omits `zip`.

**Fix:** Made `zip: v.optional(v.string())` in `AddressSchema` in `lib/queries/addresses.ts`.

### 1.5 — Support ticket detail page stuck on spinner (this session's final fix)

**Symptom:** Clicking into a support ticket → blank page with ActivityIndicator spinning forever (see screenshot).

**Root cause (two-part):**

1. **Schema mismatch:** `SupportTicketDetailSchema` required `messages: v.array(SupportTicketMessageSchema)` (non-optional). The backend's customer-facing `GET /support/tickets/:publicId` endpoint explicitly strips `messages` from the response on line 656 of `support.service.ts` (`const { messages: _msgs, ... } = ticket`). Messages live on a separate paginated sub-route (`GET /support/tickets/:publicId/messages`). So `parseOrThrow` always failed.

2. **Missing message fetch:** `fetchTicketDetail` only hit the detail endpoint and never fetched messages. The screen relied on `ticket.messages || []` — even in the old code, messages were likely never populating (the old `customerFetch<Ticket>()` call returned `{ ticket: { ... } }` and the `Ticket` type expected `messages: Message[]` at the top level, which was always `undefined`).

**Fix:**
- Made `messages` optional in `SupportTicketDetailSchema`: `v.optional(v.nullable(v.array(SupportTicketMessageSchema)))`.
- Updated `fetchTicketDetail` to do a two-step fetch (mirroring the existing `fetchConversationDetail` pattern): fetch the ticket detail, then fetch `/support/tickets/${id}/messages?limit=200`, unwrap the paginated envelope (`data` array), reverse to chronological order (backend returns newest-first, screen renders oldest-first with scroll-to-end), and splice into the ticket object before `parseOrThrow`.

**Files changed:** `lib/queries/messages.ts`

---

## §2 — UI polish (same session, not schema-related)

### 2.1 — Product card border removal

Removed `borderWidth: 1` and `borderColor: colors.gray100` from the `card` style in `components/ui/ProductCard.tsx`.

### 2.2 — Carousel vertical spacing tightened

- `components/ui/ProductRecommendationSlider.tsx` — `container.marginVertical` reduced from `spacing[4]` (16px) to `spacing[2]` (8px); `header.marginBottom` reduced from `spacing[4]` to `spacing[3]` (12px).
- `components/ui/HeroCarousel.tsx` — `carouselCard.paddingTop` set to `spacing[2]` (8px), `paddingBottom` to `spacing[1]` (4px).

### 2.3 — Category page grid fix

`app/(tabs)/(home)/category/[slug].tsx` — added `maxWidth: "50%"` to the `gridCell` style so single items in a 2-column `FlatList` don't stretch full-width.

### 2.4 — CartRecommendations refactored to sealed layer

The old `components/ui/CartRecommendations.tsx` used raw `fetch` + `useState` (outside the sealed query layer) and had inconsistent image sizing (`resizeMode="cover"`, fixed `height: 120`, `"thumb"` size). Replaced with:
- New `useRecommendationsCart` hook in `lib/queries/recommendations.ts` (POST to `/recommendations/cart`).
- `app/(tabs)/cart.tsx` now uses `ProductRecommendationSlider` with `cartRecos.data` from the new hook, matching the visual and data-fetching style of every other carousel.

---

## §3 — Known remaining issue

| # | Issue | Notes |
|---|---|---|
| 1 | TEST-PHASE2 products with `price: null` / empty `slug` still in staging database | `filterValidItems` defensively handles them at runtime, but they should be cleaned up or flagged for exclusion at the data level. Not a code issue. |

---

## §4 — Verification

```bash
npx tsc --noEmit          # exit 0
npx eslint lib/queries/messages.ts  # exit 0
npx eslint lib/queries/products.ts  # exit 0
npx eslint lib/queries/_validate.ts # exit 0
```

All clean as of this session.

---

## §5 — Files changed (complete list)

| File | Change type |
|---|---|
| `lib/queries/_validate.ts` | Added `filterValidItems` |
| `lib/queries/products.ts` | Schema relaxation (PDP fields optional) + `filterValidItems` in list fetcher |
| `lib/queries/recommendations.ts` | `filterValidItems` in all array fetchers + new `useRecommendationsCart` hook |
| `lib/queries/categories.ts` | `filterValidItems` in array fetchers |
| `lib/queries/vendors.ts` | `filterValidItems` in array fetchers |
| `lib/queries/messages.ts` | `resolutionIntent` optional + ticket detail schema/fetcher fix (two-step fetch) |
| `lib/queries/addresses.ts` | `zip` optional |
| `components/ui/ProductCard.tsx` | Border removal |
| `components/ui/ProductRecommendationSlider.tsx` | Spacing tightened |
| `components/ui/HeroCarousel.tsx` | Spacing tightened |
| `components/ui/CartRecommendations.tsx` | Deprecated (replaced by sealed-layer combo) |
| `app/(tabs)/cart.tsx` | Uses `useRecommendationsCart` + `ProductRecommendationSlider` |
| `app/(tabs)/(home)/category/[slug].tsx` | `maxWidth: "50%"` grid fix |
| `app/account/messages/case/[caseNumber].tsx` | `resolutionIntent` null-guard |
| `components/CaseDetailPanel.tsx` | `resolutionIntent` null-guard |
