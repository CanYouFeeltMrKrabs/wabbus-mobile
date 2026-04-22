# Handoff — Product Video on Mobile (Card Preview + PDP Gallery)

**Status:** Plan complete, not started. Ready to execute.

## The plan

Read this in full BEFORE writing any code:

```
/Users/jonathan/Desktop/wabbascus/wabbascus2/wabbus-mobile/.cursor/plans/product_video_mobile_4f8d2e91.plan.md
```

It's a port of the already-shipped web feature to React Native. The web plan it mirrors:

```
/Users/jonathan/Desktop/wabbascus/wabbascus2/Wabbus/src/.cursor/plans/product_card_preview_video_c7d3a4e2.plan.md
```

You do NOT need to re-read the web plan to execute the mobile one — the mobile plan is self-contained and §0 calls out every divergence explicitly. Reference the web plan only if you hit ambiguity.

## What this feature does (2-line version)

Brings the web's video display capabilities to wabbus-mobile. Two surfaces: (1) silent autoplay loop on product cards as they scroll into view, capped at 3 concurrent; (2) tappable video tile in the PDP gallery that opens a full-screen player with controls and a sidebar of all videos.

## Cross-repo scope

Mobile-only. Backend is already done — listings expose `previewVideo` and PDP exposes `videos[]` (web has been consuming both for weeks). §A1 / §A2 of the plan are 5-minute curl verifications, not code changes.

## Critical things you WILL get wrong if you don't read carefully

1. **Mobile has NO first-card-only rule.** Web limits the preview to `idx === 0` of each carousel because desktop fits many cards on screen. Mobile sees ~1 card at a time and the user explicitly said "let every viewable card play, the LRU cap of 3 is the safety net." Do NOT port the `idx === 0` check from web.

2. **Mobile has NO LCP gate.** `PerformanceObserver` doesn't exist in RN, and the LCP problem (long page → late LCP element competing with video bytes) doesn't exist on mobile single-screen layouts. Do NOT invent an analog. The viewability gate alone is sufficient.

3. **Use `expo-video`, NEVER `expo-av`.** `expo-av`'s Video is deprecated. The plan uses `useVideoPlayer` + `<VideoView>`.

4. **Do NOT call `player.release()` manually.** `expo-video`'s `useVideoPlayer` hook owns the player lifecycle. Calling release on top of hook-managed release crashes iOS. Set `source` to `null` (via the conditional in the hook call) and let expo-video do its thing.

5. **Failure = silent fallback to static image.** Cardinal rule. ANY video error → component returns null → image stays visible underneath. No retry. No error UI. No badge. The user must not be able to tell the card ever had a preview. This is web contract #8 carried over verbatim.

6. **`onViewableItemsChanged` MUST be `useRef`'d.** FlatList throws `Changing onViewableItemsChanged on the fly is not supported` if the callback identity changes between renders. Same for `viewabilityConfig`.

7. **Grid viewability has a known limitation.** When `ProductGrid` is nested in a parent `ScrollView`, FlatList's viewability detection can't fire on parent scroll. The plan ships the pragmatic fallback ("all rendered = viewable") and documents the proper fix as a follow-up. Do NOT block v1 trying to solve this — the LRU cap of 3 makes it safe.

8. **`ViewabilityProvider` must wrap every `<ProductCard>` render site.** If a card is rendered outside any provider, `useIsCardViewable` returns `false` permanently and no preview ever plays. That's a safe default — but if you forget to wrap one of the home/search/category screens, that whole surface silently has no previews. §B11.3 has the search list — verify each.

## User's hard rules (from `CLAUDE.local.md`)

- **NEVER commit, push, or modify git state without explicit approval.**
- **NEVER suggest shortcuts or "easy" solutions.** Production-grade or nothing.
- **All user-facing strings via `useTranslation()`.** §B14 covers the new keys.
- **Routes via `ROUTES` constants** (not relevant here, no new routes).
- **Run lint before suggesting a commit.**

## Recommended execution order

Follow the todo IDs in the plan's frontmatter top-to-bottom — they're already in dependency order. Specifically:

1. `dep-add-expo-video` first (no other code can run without the native module)
2. Then types (`type-public-product`, `type-product-detail`)
3. Then verify backend (`be-verify-pdp-videos`) — 5 minutes of curl
4. Then libs (`lib-preview-environment`, `lib-preview-concurrency`)
5. Then hooks (`hook-app-active-gate`, `hook-viewability`)
6. Then components (`comp-preview-video`, `comp-fullscreen-player`)
7. Then edits (`edit-product-card` → `edit-image-gallery` → producer wiring → PDP screen)
8. i18n (`i18n-strings`) last

## Build/install reminder

`expo-video` ships native code → after `npx expo install expo-video`:

```sh
npx expo prebuild --clean
npm run rebuild:ios
```

For Android: `npx expo run:android`. For TestFlight: queue a fresh EAS dev build.

## How to verify you're done

The plan has explicit acceptance criteria in §C — go through it as a literal checklist. Do not claim done without each item verified on a real device.

Most likely-to-regress checks:
- Backgrounding the app pauses videos within ~500ms (sample bandwidth in Xcode Network tab)
- Reduce Motion ON kills all videos
- Product with no videos shows image only (no broken UI)
- Tapping the PDP video tile opens the modal with the right video

## Files to read for context BEFORE coding

- The plan itself (mandatory).
- `/Users/jonathan/Desktop/wabbascus/wabbascus2/Wabbus/src/components/product/ProductPreviewVideo.tsx` — the web reference for the card preview component.
- `/Users/jonathan/Desktop/wabbascus/wabbascus2/Wabbus/src/components/product/VideoPopover.tsx` — the web reference for the full-screen modal.
- `/Users/jonathan/Desktop/wabbascus/wabbascus2/Wabbus/src/lib/previewConcurrency.ts` — copy verbatim into mobile.
- `/Users/jonathan/Desktop/wabbascus/wabbascus2/Wabbus/src/components/product/ProductGallery.tsx` — the web reference for video-tile placement in the gallery rail.
- `/Users/jonathan/Desktop/wabbascus/wabbascus2/Wabbus/src/app/[locale]/product/[id]/[slug]/page.tsx` lines 386–398 — the web reference for `videoEntries` derivation from `product.videos`.
- `expo-video` docs: https://docs.expo.dev/versions/latest/sdk/video/

## Conversation history summary

The user asked to bring the web's video capabilities to wabbus-mobile. They explicitly approved:

1. `expo-video` as the native dependency (rebuild required, accepted).
2. **Multi-card playback policy**: do NOT port web's first-card-only rule. Every viewable card with a `previewVideo` plays, capped at LRU 3.
3. **PDP behavior**: match web exactly (video tile after images, opens full-screen modal player).

User's exact instruction: *"the answers are in /wabbus already, i said to match the behavior, dont overthink it."*

Don't re-litigate any of these. They are settled.

## When you start

Open the plan file, read it cover to cover, then start with todo `dep-add-expo-video`. Use `TodoWrite` to track progress against the plan's frontmatter todos.

If the user asks "where are we" mid-execution, point them at the TodoWrite list and the plan path above.

If you hit ANY ambiguity not covered in the plan — STOP and ask the user. Do not invent.
