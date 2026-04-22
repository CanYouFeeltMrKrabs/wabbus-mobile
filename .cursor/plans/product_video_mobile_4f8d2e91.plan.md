---
name: Product Video — Mobile Parity (Card Preview + PDP Gallery)
overview: Bring the web's video display capabilities to wabbus-mobile. Two surfaces, one cohesive port — (1) silent autoplay loop on product cards as they scroll into view (no first-card limitation; mobile sees ~1 card at a time), capped at LRU 3 concurrent; (2) tappable video tile in the PDP gallery that opens a full-screen player with controls and a sidebar of all videos. Both built on `expo-video`. Strict guarantee: ANY video failure silently falls back to the static image — the user never sees a broken or stalled tile.
todos:
  - id: dep-add-expo-video
    content: Add expo-video to package.json + run expo prebuild + rebuild dev clients
    status: pending
  - id: type-public-product
    content: Extend PublicProduct type in lib/types.ts with previewVideo (mirror of backend PublicProductDto)
    status: pending
  - id: type-product-detail
    content: Extend ProductDetail type in app/(tabs)/(home)/product/[id].tsx with videos[] (mirror of backend findOnePublic shape)
    status: pending
  - id: be-verify-pdp-videos
    content: Verify backend findOnePublic already returns videos[].playback.mp4 / thumbnailUrl / duration / width / height (web PDP already consumes this) — add nothing if present
    status: pending
  - id: lib-preview-environment
    content: Create lib/previewEnvironment.ts — async helper using AccessibilityInfo.isReduceMotionEnabled() + NetInfo for saveData / 2g / cellular-expensive checks
    status: pending
  - id: lib-preview-concurrency
    content: Create lib/previewConcurrency.ts — page-wide LRU cap of 3 with acquire/release/onEvict (port directly from web — pure JS, no DOM)
    status: pending
  - id: hook-app-active-gate
    content: Create hooks/useAppActiveGate.ts — AppState wrapper returning whether the app is in foreground (replaces document.visibilityState)
    status: pending
  - id: hook-viewability
    content: Create hooks/useViewabilityGate.ts — context-driven boolean for "this card is currently viewable in its scroll container"; producers (FlatList carousels + vertical ScrollView grid) push viewable IDs into context
    status: pending
  - id: comp-preview-video
    content: Create components/ui/ProductPreviewVideo.tsx — expo-video VideoView mounted only when all gates pass, releases player on unmount/error, fires onError → silent fallback to null (image stays underneath)
    status: pending
  - id: comp-fullscreen-player
    content: Create components/ui/ProductVideoPlayer.tsx — full-screen modal mirroring web's VideoPopover; tabs for Videos / Images, sidebar of all videos, tap to switch, close button
    status: pending
  - id: edit-product-card
    content: Edit components/ui/ProductCard.tsx — wire useViewabilityGate + previewVideo, render ProductPreviewVideo absolutely over the existing <Image>
    status: pending
  - id: edit-image-gallery
    content: Edit components/ui/ProductImageGallery.tsx — append a video thumbnail tile (single tile regardless of count, like web's ThumbRail) that opens ProductVideoPlayer
    status: pending
  - id: edit-carousel-producer
    content: Edit components/ui/ProductRecommendationSlider.tsx (and other FlatList carousels) — add onViewableItemsChanged that pushes viewable productIds into ViewabilityContext
    status: pending
  - id: edit-grid-producer
    content: Edit components/ui/ProductGrid.tsx + parent screens — wrap in ViewabilityProvider that uses scroll position + measured cell layouts to identify currently-viewable productIds
    status: pending
  - id: edit-pdp-screen
    content: Edit app/(tabs)/(home)/product/[id].tsx — derive videoEntries from product.videos and pass to ProductImageGallery
    status: pending
  - id: i18n-strings
    content: Add i18n strings for video player — close button, videos tab, images tab, "videos for product", play video aria-label (en/es/id)
    status: pending
isProject: false
---

# Product Video — Mobile Parity (Cross-Repo)

This plan brings the web's video display capabilities to wabbus-mobile. The web feature is fully shipped — see `/Users/jonathan/Desktop/wabbascus/wabbascus2/Wabbus/src/.cursor/plans/product_card_preview_video_c7d3a4e2.plan.md` for the original cross-repo plan and contracts. This plan does NOT re-derive those decisions; it ports them to React Native with the deliberate divergences called out in §0.

ALL PATHS in this plan are relative to: `/Users/jonathan/Desktop/wabbascus/wabbascus2/wabbus-mobile`

The backend is already done — listings expose `previewVideo`, PDP exposes `videos[]`. Mobile is the only repo that changes. (Verification step §A1 confirms this; if anything is missing, escalate before assuming.)

---

## §0. Deliberate divergences from the web plan

These are the user-approved differences between the mobile port and the web original. Do NOT re-litigate them.

### 0.1. No "first card only" rule

Web limits the preview to `idx === 0` of each carousel because desktop layouts show many carousels with many cards visible simultaneously. Mobile is single-column vertical scroll — the user sees ~1 card at a time anyway.

→ **Every viewable card with `previewVideo` plays.** The LRU concurrency cap (3) is the only ceiling. This naturally lands at 1–2 cards playing at once during scroll, which is exactly what we want.

### 0.2. No LCP gate

`PerformanceObserver` and `largest-contentful-paint` do not exist in React Native. There is no analogous metric.

→ **No LCP gate.** Mobile relies on the viewability gate alone. Cards that aren't viewable never mount a video, so they never load bytes. There is no equivalent of "above-fold static image candidates being out-competed by video bytes".

If we ever needed an analog, the right substitute would be `InteractionManager.runAfterInteractions()` plus a small delay — but that's solving a problem that doesn't exist on mobile, so we don't add it. (Web's LCP gate exists because the LCP element on a long homepage can take 1–2s to settle; mobile renders one screen of content immediately and the user is already scrolling by the time anything could compete.)

### 0.3. AppState replaces visibilitychange

`document.visibilityState` doesn't exist in RN. Replace with `react-native`'s `AppState` API:

- `active` → equivalent to `visible`
- `background` / `inactive` → equivalent to `hidden`

Same semantic: pause all videos when the app backgrounds, resume on return.

### 0.4. expo-video, not expo-av

`expo-av`'s `Video` component is deprecated in favor of `expo-video` (Expo SDK 53+). `expo-video` is built for the New Architecture (which this app has enabled per `app.json`), exposes a `useVideoPlayer` hook that returns a controllable player object, and renders via `<VideoView player={...} />`. This is the only correct choice.

### 0.5. No CORS / crossOrigin

RN's media stack doesn't expose CORS modes — videos are loaded via the native HTTP layer, same as `<Image>`. The web plan's "opaque resource" decision is moot here.

### 0.6. PDP video discoverability — match web

Web puts the video tile AFTER images in the thumb rail. Mobile does the same. The image FlatList already supports horizontal swipe; we append one video tile to the rail (with a play-button overlay), and tapping it opens the full-screen player modal.

---

## §A. Backend verification (no code change expected)

### A1. Verify `/products/public` returns `previewVideo`

```sh
curl -s 'https://api.wabbus.app/products/public?take=2' | jq '.products[0].previewVideo'
```

Expected: an object with `mp4Url`, `posterUrl`, `width`, `height`, `durationSec` (or `null` when the product has no approved video). If absent, the web plan's Part A wasn't shipped — escalate to user before continuing.

### A2. Verify `/products/public/:id/view` returns `videos[]`

The web PDP at `app/[locale]/product/[id]/[slug]/page.tsx` line 390 already consumes:

```typescript
const videoEntries = (product.videos ?? [])
  .filter((vid) => vid.playback?.mp4)
  .map((vid) => ({
    mp4Url: vid.playback!.mp4!,
    thumbnailUrl: vid.thumbnailUrl ?? undefined,
    duration: vid.duration,
    width: vid.width ?? undefined,
    height: vid.height ?? undefined,
  }));
```

So `findOnePublic` already returns the shape we need. Confirm with:

```sh
curl -s 'https://api.wabbus.app/products/public/<known-product-id>/view' | jq '.videos[0]'
```

Expected: an object with `playback.mp4`, `thumbnailUrl`, `duration`, `width`, `height`. If absent, escalate.

### A3. R2 caching headers

Already verified for the web rollout (see web plan §A6). Same MP4s, same R2 bucket, same headers — nothing to verify on the mobile side. Native players honor `Accept-Ranges: bytes` automatically.

---

## §B. Frontend port (`wabbus-mobile`)

### B1. Add `expo-video` dependency

```sh
cd /Users/jonathan/Desktop/wabbascus/wabbascus2/wabbus-mobile
npx expo install expo-video
```

`expo-video` ships native code → requires `npx expo prebuild --clean` (already in `package.json` scripts as part of `rebuild:ios`) and a fresh dev-client build.

After `prebuild`, run `npm run rebuild:ios` to confirm iOS builds. For Android, follow up with `npx expo run:android`.

If user is on EAS, queue a new EAS dev build for testers — the existing builds on TestFlight will not have the native module.

### B2. Type — Extend `PublicProduct`

Edit `lib/types.ts`. Add `previewVideo` mirroring the backend exactly (and matching web's type in `Wabbus/src/lib/category-data.ts`):

```typescript
export type PublicProduct = {
  // ... existing fields ...
  badges?: Array<{ type: string; label: string; value?: number }>;

  /**
   * Primary APPROVED product video for in-card preview autoplay on
   * carousels and grids. Absent when the product has no approved video.
   * The card silently falls back to the static image when null/undefined.
   * Shape mirrors the backend `PublicProductDto.previewVideo` exactly.
   */
  previewVideo?: {
    mp4Url: string;
    posterUrl: string | null;
    width: number | null;
    height: number | null;
    durationSec: number | null;
  } | null;
};
```

No other code in `lib/types.ts` changes — the field is opt-in and existing consumers (cart, search, recently viewed) ignore it.

### B3. Type — Extend `ProductDetail`

Edit `app/(tabs)/(home)/product/[id].tsx` `ProductDetail` type. Add `videos`:

```typescript
type ProductVideo = {
  playback?: { mp4?: string | null } | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
};

type ProductDetail = {
  // ... existing fields ...
  variants?: ProductVariant[];
  videos?: ProductVideo[];
  // ... rest ...
};
```

The shape matches what web's `findOnePublic` returns — see web's PDP page line 390 for the consumer pattern.

### B4. New file — `lib/previewEnvironment.ts`

Async (mobile checks are async — `AccessibilityInfo.isReduceMotionEnabled()` returns a promise; NetInfo is async). Returns `false` if any of:

- Reduce-motion is enabled
- NetInfo reports `details.isConnectionExpensive === true` AND user has data saver hint (we use `isConnectionExpensive` as the conservative proxy)
- NetInfo reports `type === 'cellular'` AND `details.cellularGeneration === '2g'`

```typescript
import { AccessibilityInfo } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

/**
 * Async environment gate for preview-video autoplay.
 *
 * Returns false (gate closed → render static image only) when ANY of:
 *   - User has Reduce Motion enabled (iOS Settings → Accessibility → Motion;
 *     Android Settings → Accessibility → Remove animations)
 *   - Connection is expensive (cellular + metered) — conservative default
 *     because mobile users on cellular care about data
 *   - Connection is 2g — bandwidth too low for any video to play smoothly
 *
 * All checks are feature-detected. Anything we can't read is treated as
 * permissive (default allow). Cached after first resolve — environment
 * conditions don't change frequently within a session, and re-checking
 * on every card mount is wasteful. Exposed via a refresh helper for
 * AppState=active transitions if we ever need to re-evaluate.
 */
let cached: boolean | null = null;

export async function isPreviewEnvironmentPermitted(): Promise<boolean> {
  if (cached !== null) return cached;

  try {
    const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
    if (reduceMotion) {
      cached = false;
      return false;
    }
  } catch {
    // AccessibilityInfo throwing is exotic; fall through and check network
  }

  try {
    const state = await NetInfo.fetch();
    if (state.details && 'isConnectionExpensive' in state.details) {
      // isConnectionExpensive is iOS-only (Android always returns false).
      // Treat as a soft signal: only block when cellular AND expensive.
      const expensive = state.details.isConnectionExpensive === true;
      const cellular = state.type === 'cellular';
      if (expensive && cellular) {
        cached = false;
        return false;
      }
    }
    if (
      state.type === 'cellular' &&
      state.details &&
      'cellularGeneration' in state.details &&
      state.details.cellularGeneration === '2g'
    ) {
      cached = false;
      return false;
    }
  } catch {
    // Permissive fail — if NetInfo throws, we don't want to brick the feature
  }

  cached = true;
  return true;
}

/** Test-only helper. */
export function _resetPreviewEnvironmentCacheForTests(): void {
  cached = null;
}
```

### B5. New file — `lib/previewConcurrency.ts`

Pure JS, no DOM dependencies — copy verbatim from web's `Wabbus/src/lib/previewConcurrency.ts`. Same LRU cap of 3, same `acquire/release/onEvict` API. The file is identical bit-for-bit:

```typescript
/**
 * App-level concurrency cap for preview videos.
 *
 * Hard cap = 3. Single-column mobile scroll typically lands at 1–2
 * concurrent (one card mostly visible, one entering/leaving). The cap
 * is a guardrail for unusual cases (e.g. small-text accessibility mode
 * making cards smaller, multiple carousels visible at once on iPad).
 *
 * When acquire() pushes count over the cap, the OLDEST acquired slot
 * is evicted: its onEvict callback is invoked (which the video element
 * uses to pause itself) and its slot is freed.
 *
 * Module-level state — survives component remounts within the same
 * app session, which matches the "app-wide cap" semantic.
 */

const MAX_CONCURRENT_PREVIEWS = 3;

type Slot = { id: string; onEvict: () => void };

const slots: Slot[] = [];

export function acquirePreviewSlot(id: string, onEvict: () => void): void {
  const existing = slots.findIndex((s) => s.id === id);
  if (existing !== -1) {
    slots.splice(existing, 1);
    slots.push({ id, onEvict });
    return;
  }

  slots.push({ id, onEvict });

  while (slots.length > MAX_CONCURRENT_PREVIEWS) {
    const evicted = slots.shift();
    if (!evicted) break;
    try {
      evicted.onEvict();
    } catch {
      // An evicted callback throwing must never break the acquire path.
    }
  }
}

export function releasePreviewSlot(id: string): void {
  const idx = slots.findIndex((s) => s.id === id);
  if (idx !== -1) slots.splice(idx, 1);
}

export function _resetPreviewSlotsForTests(): void {
  slots.length = 0;
}
```

### B6. New file — `hooks/useAppActiveGate.ts`

AppState wrapper. Returns `true` when the app is in the foreground.

```typescript
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Returns whether the app is currently in the foreground.
 *
 * Used to pause preview videos when the user backgrounds the app.
 * Without this, videos continue downloading and burning battery while
 * the app is offscreen.
 *
 * AppState transitions are reliable on both platforms — iOS fires
 * `inactive` then `background`; Android fires `background` directly.
 * We treat anything other than `active` as paused.
 */
export function useAppActiveGate(): boolean {
  const [active, setActive] = useState<boolean>(
    AppState.currentState === 'active',
  );

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      setActive(state === 'active');
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return active;
}
```

### B7. New file — `hooks/useViewabilityGate.ts`

This is the mobile equivalent of web's `useViewportGate`, but it works very differently. RN doesn't have IntersectionObserver. Instead, **scroll containers (FlatList / ScrollView) own viewability state and broadcast it via a context** — cards then subscribe to that context by their `productId`.

```typescript
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * Viewability is computed by the scroll container, not by the card.
 * RN doesn't have IntersectionObserver, so we use FlatList's
 * `onViewableItemsChanged` (or measured layout for non-FlatList grids)
 * to populate this context with the set of currently-viewable productIds.
 *
 * Cards consume the context with `useIsCardViewable(productId)`, which
 * returns a boolean kept in sync via a tight subscription. The set
 * itself is mutable (Ref-backed) and we tick a version counter to
 * trigger re-renders only on cards whose viewability ACTUALLY changed —
 * a naïve "pass the Set as a context value" approach would re-render
 * every card on every scroll tick.
 */

type ViewabilitySubscription = (visible: boolean) => void;

type ViewabilityContextValue = {
  /** Mutable set of currently-viewable productIds. */
  viewableIdsRef: React.MutableRefObject<Set<string>>;
  /** Subscribe to viewability changes for a specific productId. */
  subscribe: (productId: string, cb: ViewabilitySubscription) => () => void;
  /** Producer-facing setter. Called by FlatList's onViewableItemsChanged. */
  setViewable: (ids: string[]) => void;
};

const NoopContext: ViewabilityContextValue = {
  viewableIdsRef: { current: new Set<string>() },
  subscribe: () => () => {},
  setViewable: () => {},
};

const ViewabilityContext =
  createContext<ViewabilityContextValue>(NoopContext);

/**
 * Wraps a scroll container. Cards inside it call useIsCardViewable to
 * get their boolean. Producers call ctx.setViewable from their scroll/
 * FlatList viewability callback.
 *
 * If a card is rendered OUTSIDE any provider (e.g. a dialog), useIsCardViewable
 * returns `false` permanently — safe default, no preview attempted.
 */
export function ViewabilityProvider({ children }: { children: React.ReactNode }) {
  const viewableIdsRef = useRef<Set<string>>(new Set());
  const subscribersRef = useRef<Map<string, Set<ViewabilitySubscription>>>(
    new Map(),
  );

  const subscribe = useCallback(
    (productId: string, cb: ViewabilitySubscription) => {
      let bucket = subscribersRef.current.get(productId);
      if (!bucket) {
        bucket = new Set();
        subscribersRef.current.set(productId, bucket);
      }
      bucket.add(cb);
      cb(viewableIdsRef.current.has(productId));
      return () => {
        bucket?.delete(cb);
        if (bucket?.size === 0) {
          subscribersRef.current.delete(productId);
        }
      };
    },
    [],
  );

  const setViewable = useCallback((ids: string[]) => {
    const next = new Set(ids);
    const prev = viewableIdsRef.current;
    viewableIdsRef.current = next;

    // Notify only cards whose viewability actually changed.
    const allKeys = new Set<string>([...prev, ...next]);
    for (const id of allKeys) {
      const wasIn = prev.has(id);
      const isIn = next.has(id);
      if (wasIn === isIn) continue;
      const subs = subscribersRef.current.get(id);
      if (!subs) continue;
      for (const cb of subs) cb(isIn);
    }
  }, []);

  const value = useMemo<ViewabilityContextValue>(
    () => ({ viewableIdsRef, subscribe, setViewable }),
    [subscribe, setViewable],
  );

  return (
    <ViewabilityContext.Provider value={value}>
      {children}
    </ViewabilityContext.Provider>
  );
}

/** Card-side hook. Returns whether THIS productId is currently viewable. */
export function useIsCardViewable(productId: string): boolean {
  const ctx = useContext(ViewabilityContext);
  const [visible, setVisible] = useState<boolean>(() =>
    ctx.viewableIdsRef.current.has(productId),
  );
  useEffect(() => {
    return ctx.subscribe(productId, setVisible);
  }, [ctx, productId]);
  return visible;
}

/** Producer-side hook. Returns the setter to call from FlatList. */
export function useViewabilityProducer(): ViewabilityContextValue['setViewable'] {
  return useContext(ViewabilityContext).setViewable;
}
```

### B8. New file — `components/ui/ProductPreviewVideo.tsx`

Mounts a `VideoView` only when all gates pass. On any error → unmount and return `null` so the static `<Image>` underneath shows through.

```typescript
import React, { useCallback, useEffect, useId, useState } from 'react';
import { StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  acquirePreviewSlot,
  releasePreviewSlot,
} from '@/lib/previewConcurrency';

type Props = {
  mp4Url: string;
  enabled: boolean;
};

/**
 * Mounted by ProductCard for ANY card that:
 *   - is currently viewable in its scroll container
 *   - has product.previewVideo non-null
 *   - environment permits autoplay (no Reduce Motion, not 2g/expensive)
 *   - app is foregrounded
 *
 * Unlike the web version, mobile has no first-card limitation — every
 * viewable card with a video plays, capped at LRU 3 (acquirePreviewSlot
 * evicts oldest when over cap).
 *
 * Strict guarantees:
 *   - When enabled=false: returns null, no VideoView, no fetch.
 *   - When enabled=true AND not errored: mounts a muted, looping,
 *     contentFit="cover" VideoView absolutely positioned over the card's
 *     <Image>. The <Image> is NEVER unmounted — it's the foundation.
 *   - On ANY playback error → set errored=true, return null, release
 *     slot. Do NOT retry. Do NOT show error UI. The user must see the
 *     static image with NO indication that a video ever existed.
 *   - On unmount: player.release() — fully tears down the native
 *     player and decoder. (expo-video handles the equivalent of
 *     pause+removeAttribute(src)+load() automatically when the player
 *     is released.)
 *   - On AppState=background: parent passes enabled=false, which
 *     unmounts. Re-mounts on foreground.
 */
export default function ProductPreviewVideo({ mp4Url, enabled }: Props) {
  const slotId = useId();
  const [errored, setErrored] = useState(false);

  // Reset errored when the URL itself changes (rare card reuse).
  const [prevUrl, setPrevUrl] = useState(mp4Url);
  if (prevUrl !== mp4Url) {
    setPrevUrl(mp4Url);
    setErrored(false);
  }

  const player = useVideoPlayer(
    enabled && !errored ? mp4Url : null,
    (p) => {
      p.muted = true;
      p.loop = true;
      // staysActiveInBackground=false is the default; explicit for clarity.
      p.staysActiveInBackground = false;
    },
  );

  const handleError = useCallback(() => {
    setErrored(true);
    releasePreviewSlot(slotId);
    if (__DEV__) {
      console.warn(
        `[ProductPreviewVideo] playback failed for ${mp4Url} — falling back to static image`,
      );
    }
  }, [slotId, mp4Url]);

  useEffect(() => {
    if (!enabled || errored) return;

    const evict = () => {
      try {
        player.pause();
      } catch {
        // ignore — pause on a torn-down player is a no-op
      }
    };

    acquirePreviewSlot(slotId, evict);

    try {
      player.play();
    } catch {
      // Native may throw synchronously if asset is invalid. Treat as error.
      handleError();
    }

    // Listen for player error events. expo-video exposes a
    // 'statusChange' event whose status='error' fires for network /
    // decode / unsupported-codec errors.
    const sub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error' || error) {
        handleError();
      }
    });

    return () => {
      try {
        sub.remove();
      } catch {
        // ignore
      }
      releasePreviewSlot(slotId);
      // expo-video automatically releases the underlying native player
      // when the source is set to null (next render) or the player is
      // garbage-collected. We don't need an explicit player.release()
      // call here — re-renders with source=null handle it cleanly.
    };
  }, [enabled, errored, slotId, player, handleError]);

  if (!enabled || errored) return null;

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      allowsPictureInPicture={false}
    />
  );
}
```

**Notes:**

- `useVideoPlayer(null, ...)` is a documented expo-video pattern for "no source yet" — the player exists but doesn't load anything. We feed `null` when `enabled=false` so the player is detached from any URL the moment we want to stop.
- `nativeControls={false}` — preview is decorative, no UI affordance.
- `contentFit="cover"` matches web's `object-cover` so the video fills the same square the image did.
- Errors flow through `statusChange` events, not a dedicated `onError` prop. The expo-video API uses event subscriptions for player state.
- We do NOT call `player.release()` explicitly in cleanup. expo-video's `useVideoPlayer` hook owns the player lifecycle; the next render with `source=null` triggers internal release. Calling `release()` ourselves would double-release and crash on iOS.

### B9. New file — `components/ui/ProductVideoPlayer.tsx`

Full-screen modal mirroring web's `VideoPopover`. Tabs for Videos / Images, sidebar of all videos, tap to switch.

```typescript
import React, { useCallback, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  StatusBar,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import AppText from '@/components/ui/AppText';
import Icon from '@/components/ui/Icon';
import { useTranslation } from '@/hooks/useT';
import { colors, spacing, borderRadius, shadows } from '@/lib/theme';

export type VideoEntry = {
  mp4Url: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
};

type Tab = 'videos' | 'images';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function formatDuration(seconds?: number): string | null {
  if (seconds == null || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = {
  videos: VideoEntry[];
  imageUrls: string[];
  initialVideoIndex?: number;
  initialImageIndex?: number;
  initialTab?: Tab;
  productTitle: string;
  vendorName?: string | null;
  visible: boolean;
  onClose: () => void;
};

/**
 * Full-screen player. Mirrors web's VideoPopover:
 *   - Top tabs: Videos / Images
 *   - Videos tab: large player + sidebar of all videos
 *   - Images tab: large image + thumbnail grid
 *   - Tapping a sidebar entry switches the active video (full unmount/remount
 *     of the player via `key` prop, same pattern as web)
 *
 * Player has native controls enabled (this is the canonical "watch the
 * video with sound" experience — different from the silent card preview).
 */
export default function ProductVideoPlayer({
  videos,
  imageUrls,
  initialVideoIndex = 0,
  initialImageIndex = 0,
  initialTab = 'videos',
  productTitle,
  vendorName,
  visible,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [activeVideoIdx, setActiveVideoIdx] = useState(initialVideoIndex);
  const [activeImageIdx, setActiveImageIdx] = useState(initialImageIndex);

  const activeVideo = videos[activeVideoIdx] ?? videos[0];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" />
      <View style={styles.root}>
        {/* Header — tabs + close */}
        <View style={styles.header}>
          <View style={styles.tabs}>
            <Pressable
              onPress={() => setActiveTab('videos')}
              style={styles.tabBtn}
            >
              <AppText
                weight="bold"
                style={[
                  styles.tabLabel,
                  activeTab === 'videos' && styles.tabLabelActive,
                ]}
              >
                {t('product.gallery.videosTab')}
              </AppText>
              {activeTab === 'videos' && <View style={styles.tabUnderline} />}
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('images')}
              style={styles.tabBtn}
            >
              <AppText
                weight="bold"
                style={[
                  styles.tabLabel,
                  activeTab === 'images' && styles.tabLabelActive,
                ]}
              >
                {t('product.gallery.imagesTab')}
              </AppText>
              {activeTab === 'images' && <View style={styles.tabUnderline} />}
            </Pressable>
          </View>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            hitSlop={12}
            accessibilityLabel={t('product.gallery.closeVideo')}
          >
            <Icon name="close" size={26} color={colors.white} />
          </Pressable>
        </View>

        {activeTab === 'videos' && activeVideo ? (
          <VideosTab
            videos={videos}
            activeVideoIdx={activeVideoIdx}
            activeVideo={activeVideo}
            productTitle={productTitle}
            vendorName={vendorName}
            onSwitchVideo={setActiveVideoIdx}
          />
        ) : (
          <ImagesTab
            imageUrls={imageUrls}
            activeImageIdx={activeImageIdx}
            onSelectImage={setActiveImageIdx}
            productTitle={productTitle}
          />
        )}
      </View>
    </Modal>
  );
}

/* ── Videos Tab ─────────────────────────────────────────────── */

function VideosTab({
  videos,
  activeVideoIdx,
  activeVideo,
  productTitle,
  vendorName,
  onSwitchVideo,
}: {
  videos: VideoEntry[];
  activeVideoIdx: number;
  activeVideo: VideoEntry;
  productTitle: string;
  vendorName?: string | null;
  onSwitchVideo: (idx: number) => void;
}) {
  const { t } = useTranslation();

  // key={activeVideo.mp4Url} ensures full unmount/remount of the player
  // when the user switches videos in the sidebar — same pattern as web.
  return (
    <View style={styles.body}>
      <ActiveVideoPlayer
        key={activeVideo.mp4Url}
        mp4Url={activeVideo.mp4Url}
      />
      <ScrollView style={styles.sidebar}>
        <AppText variant="caption" weight="bold" style={styles.sidebarHeader}>
          {t('product.gallery.videosForProduct')}
        </AppText>
        {videos.map((vid, i) => (
          <Pressable
            key={vid.mp4Url}
            onPress={() => onSwitchVideo(i)}
            style={[
              styles.sidebarEntry,
              i === activeVideoIdx && styles.sidebarEntryActive,
            ]}
          >
            <View style={styles.sidebarThumb}>
              {vid.thumbnailUrl ? (
                <Image source={{ uri: vid.thumbnailUrl }} style={styles.sidebarThumbImg} />
              ) : (
                <View style={styles.sidebarThumbPlaceholder} />
              )}
              <View style={styles.sidebarPlayBadge}>
                <Icon name="play-arrow" size={14} color={colors.white} />
              </View>
              {formatDuration(vid.duration) && (
                <View style={styles.sidebarDuration}>
                  <AppText style={styles.sidebarDurationText}>
                    {formatDuration(vid.duration)}
                  </AppText>
                </View>
              )}
            </View>
            <View style={styles.sidebarLabel}>
              <AppText variant="label" numberOfLines={2}>{productTitle}</AppText>
              {vendorName && (
                <AppText variant="caption" numberOfLines={1} style={styles.sidebarSublabel}>
                  {vendorName}
                </AppText>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/* ── Active Video Player ───────────────────────────────────── */

function ActiveVideoPlayer({ mp4Url }: { mp4Url: string }) {
  const player = useVideoPlayer(mp4Url, (p) => {
    p.muted = false;
    p.loop = false;
    p.play();
  });
  return (
    <View style={styles.playerFrame}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
        allowsFullscreen
      />
    </View>
  );
}

/* ── Images Tab ─────────────────────────────────────────────── */

function ImagesTab({
  imageUrls,
  activeImageIdx,
  onSelectImage,
  productTitle,
}: {
  imageUrls: string[];
  activeImageIdx: number;
  onSelectImage: (idx: number) => void;
  productTitle: string;
}) {
  const { t } = useTranslation();
  const activeUrl = imageUrls[activeImageIdx] ?? imageUrls[0];
  if (!activeUrl) {
    return (
      <View style={styles.body}>
        <AppText style={styles.noImagesLabel}>{t('product.gallery.noImages')}</AppText>
      </View>
    );
  }
  return (
    <View style={styles.body}>
      <View style={styles.imageFrame}>
        <Image
          source={{ uri: activeUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          accessibilityLabel={productTitle}
        />
      </View>
      {imageUrls.length > 1 && (
        <ScrollView style={styles.sidebar}>
          <View style={styles.imageGrid}>
            {imageUrls.map((url, i) => (
              <Pressable
                key={url}
                onPress={() => onSelectImage(i)}
                style={[
                  styles.imageGridCell,
                  i === activeImageIdx && styles.imageGridCellActive,
                ]}
              >
                <Image source={{ uri: url }} style={styles.imageGridImg} resizeMode="contain" />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[2],
  },
  tabs: { flexDirection: 'row', gap: spacing[4] },
  tabBtn: { paddingVertical: spacing[2] },
  tabLabel: {
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    fontSize: 13,
    letterSpacing: 1,
  },
  tabLabelActive: { color: colors.white },
  tabUnderline: {
    height: 2,
    backgroundColor: colors.brandBlue,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  body: { flex: 1 },
  playerFrame: {
    width: SCREEN_W,
    height: (SCREEN_W * 16) / 9,
    backgroundColor: '#000',
    maxHeight: SCREEN_H * 0.55,
  },
  imageFrame: {
    width: SCREEN_W,
    height: SCREEN_W,
    backgroundColor: colors.white,
  },
  sidebar: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
  },
  sidebarHeader: {
    color: colors.white,
    marginBottom: spacing[2],
    textTransform: 'uppercase',
  },
  sidebarEntry: {
    flexDirection: 'row',
    gap: spacing[2],
    padding: spacing[1.5],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[1.5],
  },
  sidebarEntryActive: { backgroundColor: 'rgba(255,255,255,0.08)' },
  sidebarThumb: {
    width: 110,
    aspectRatio: 16 / 9,
    backgroundColor: '#222',
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  sidebarThumbImg: { width: '100%', height: '100%' },
  sidebarThumbPlaceholder: { width: '100%', height: '100%', backgroundColor: '#222' },
  sidebarPlayBadge: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarDuration: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sidebarDurationText: { color: colors.white, fontSize: 10 },
  sidebarLabel: { flex: 1, paddingVertical: 2 },
  sidebarSublabel: { color: 'rgba(255,255,255,0.55)' },
  imageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing[2],
    paddingBottom: spacing[6],
  },
  imageGridCell: {
    width: (SCREEN_W - spacing[3] * 2 - spacing[2] * 2) / 3,
    aspectRatio: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  imageGridCellActive: { borderColor: colors.brandBlue },
  imageGridImg: { width: '100%', height: '100%' },
  noImagesLabel: { color: colors.white, textAlign: 'center', marginTop: 100 },
});
```

### B10. Edit — `components/ui/ProductCard.tsx`

Add the preview-video overlay. The image stays exactly as-is — the video lays on top.

#### B10.1. Imports

```typescript
import { useEffect, useState } from 'react';
import ProductPreviewVideo from './ProductPreviewVideo';
import { useIsCardViewable } from '@/hooks/useViewabilityGate';
import { useAppActiveGate } from '@/hooks/useAppActiveGate';
import { isPreviewEnvironmentPermitted } from '@/lib/previewEnvironment';
```

#### B10.2. Compute the resolved enable boolean

Inside `ProductCard`, after the existing `imageUri` line:

```typescript
const isViewable = useIsCardViewable(product.productId);
const appActive = useAppActiveGate();
const [envPermitted, setEnvPermitted] = useState(false);

useEffect(() => {
  let cancelled = false;
  isPreviewEnvironmentPermitted().then((ok) => {
    if (!cancelled) setEnvPermitted(ok);
  });
  return () => { cancelled = true; };
}, []);

const showPreview =
  isViewable &&
  appActive &&
  envPermitted &&
  !!product.previewVideo?.mp4Url;
```

#### B10.3. Render the overlay

In the existing `<View style={styles.imageWrap}>`, AFTER the `<Image>` and BEFORE `<View style={styles.badges}>`:

```tsx
<View style={styles.imageWrap}>
  <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />

  {/* Preview video lays over the static image. Image stays mounted —
      any video error unmounts the video and the image stays visible. */}
  {product.previewVideo?.mp4Url && (
    <ProductPreviewVideo
      mp4Url={product.previewVideo.mp4Url}
      enabled={showPreview}
    />
  )}

  <View style={styles.badges}>
    <BadgeRow badges={product.badges} />
  </View>
  {/* ... wishlist button unchanged ... */}
</View>
```

The wishlist button already has `position: 'absolute'` with shadows — it stays above the video automatically (RN's z-index follows source order within the same parent).

### B11. Edit — Producer wiring

#### B11.1. `components/ui/ProductRecommendationSlider.tsx`

Wrap the FlatList in `ViewabilityProvider` and wire `onViewableItemsChanged`:

```typescript
import {
  ViewabilityProvider,
  useViewabilityProducer,
} from '@/hooks/useViewabilityGate';

// ... inside the rendered tree, replace the existing FlatList with: ...

<ViewabilityProvider>
  <CarouselFlatList products={products} onAddToCart={onAddToCart} />
</ViewabilityProvider>

// New internal component so the producer hook has a provider above it:
function CarouselFlatList({
  products,
  onAddToCart,
}: {
  products: PublicProduct[];
  onAddToCart?: (product: PublicProduct) => void;
}) {
  const setViewable = useViewabilityProducer();

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    setViewable(
      viewableItems
        .map((v: any) => v.item?.productId)
        .filter((id: string | undefined): id is string => !!id),
    );
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  return (
    <FlatList
      data={products}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(p) => p.productId}
      contentContainerStyle={styles.scrollContent}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      renderItem={({ item }) => (
        <View style={styles.cardContainer}>
          <ProductCard product={item} onAddToCart={onAddToCart} />
        </View>
      )}
    />
  );
}
```

**Critical**: `onViewableItemsChanged` and `viewabilityConfig` MUST be stored in `useRef` (not `useState` or inline). FlatList throws `Changing onViewableItemsChanged on the fly is not supported` otherwise.

Apply the same pattern to:
- `components/ui/RecentlyViewedSlider.tsx`
- `components/ui/CartRecommendations.tsx`
- `components/ui/HeroCarousel.tsx` (if it surfaces ProductCard — verify; if it doesn't render product cards, skip)

#### B11.2. `components/ui/ProductGrid.tsx`

ProductGrid is rendered inside a vertical `ScrollView` on Home, Search, Category screens — not its own FlatList. Two options:

**Option A (recommended, minimal change):** add a top-level `ViewabilityProvider` to each PARENT screen (Home, Search, Category) and use a FlatList for the grid OR drive viewability from the parent ScrollView's `onScroll` using `View.measureInWindow()` on cells.

**Option B (cleaner):** convert ProductGrid to a `FlatList` with `numColumns={2}` and own its `ViewabilityProvider`. This is the preferred path — same pattern as the carousels, no parent-screen surgery, and FlatList handles measurement natively.

Implement Option B:

```typescript
import {
  ViewabilityProvider,
  useViewabilityProducer,
} from '@/hooks/useViewabilityGate';

export default function ProductGrid({ products, onAddToCart }: Props) {
  return (
    <ViewabilityProvider>
      <GridFlatList products={products} onAddToCart={onAddToCart} />
    </ViewabilityProvider>
  );
}

function GridFlatList({ products, onAddToCart }: Props) {
  const setViewable = useViewabilityProducer();

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    setViewable(
      viewableItems
        .map((v: any) => v.item?.productId)
        .filter((id: string | undefined): id is string => !!id),
    );
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 60,
  }).current;

  return (
    <FlatList
      data={products}
      keyExtractor={(p) => p.productId}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.grid}
      scrollEnabled={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      renderItem={({ item }) => (
        <View style={styles.cell}>
          <ProductCard product={item} onAddToCart={onAddToCart} />
        </View>
      )}
    />
  );
}
```

`scrollEnabled={false}` because ProductGrid is rendered inside a parent ScrollView. **Critical caveat:** when `scrollEnabled={false}`, `onViewableItemsChanged` will NOT fire on parent-scroll because the FlatList itself isn't scrolling — it has no scroll position to compare against.

To make this work, the parent ScrollView's `onScroll` must trigger viewability recomputation. The standard React Native fix:

- Pass the parent scroll position into ViewabilityProvider via context-set (e.g. parent calls `setViewable` directly)
- OR use `react-native-viewport-aware-flatlist` / similar
- OR use `View.measureInWindow` on each cell with a parent-scroll-driven re-evaluation

The cleanest approach for our codebase: parent screens already use `ScrollView` with `onScroll`. Have ProductGrid expose a `onScrollPositionChange(y)` and recompute viewability from cell layouts. **This is the right solution but requires changes in each parent screen.** Alternatively:

- **Pragmatic fallback**: if the grid sits inside a ScrollView, mark all rendered cells as "viewable" (the screen-height window will contain at most ~6 cards anyway, and the LRU concurrency cap of 3 handles the rest). The `previewEnvironment` gate + LRU eviction prevents bandwidth blowup.

For v1, ship the pragmatic fallback (treat all rendered grid cells as viewable). Document in code comments that this is a known limitation and the proper fix requires parent-scroll integration.

```typescript
function GridFlatList({ products, onAddToCart }: Props) {
  // KNOWN LIMITATION: when nested in a parent ScrollView, FlatList's
  // viewability detection can't fire on parent scroll. As a pragmatic
  // fallback we mark ALL rendered cells viewable — the LRU concurrency
  // cap of 3 ensures we never play more than 3 simultaneously regardless.
  // Proper fix requires parent screens to drive viewability via onScroll
  // + measureInWindow on each cell. Tracked: TODO add issue reference.
  const setViewable = useViewabilityProducer();
  const ids = useMemo(() => products.map((p) => p.productId), [products]);
  useEffect(() => {
    setViewable(ids);
  }, [ids, setViewable]);
  // ... FlatList without onViewableItemsChanged ...
}
```

#### B11.3. Anywhere else `<ProductCard>` is rendered

Search the codebase for `<ProductCard ` and verify each render site has a `ViewabilityProvider` somewhere above it. If not, wrap or fall back to the "all rendered = viewable" pattern. Render sites to check (non-exhaustive):

- `app/(tabs)/(home)/index.tsx`
- `app/search.tsx`
- `app/(tabs)/(home)/category/[slug].tsx`
- `app/account/wishlist.tsx` (if it uses ProductCard — verify)

If a render site doesn't wrap, ProductCard's `useIsCardViewable` returns `false` permanently (safe default — no preview attempted) so nothing breaks.

### B12. Edit — `components/ui/ProductImageGallery.tsx`

Add a video tile to the gallery's bottom thumbnail strip and open the full-screen player on tap. The main image FlatList does NOT include videos as slides — keeping the gallery's swipe-through-images UX intact. (Same as web's pattern where videos live in the rail, not in the main image carousel.)

#### B12.1. Type + prop change

Add `videos` prop:

```typescript
import ProductVideoPlayer, { type VideoEntry } from './ProductVideoPlayer';

interface ProductImageGalleryProps {
  images: string[];
  videos?: VideoEntry[];
  inWishlist: boolean;
  onToggleWishlist: () => void;
}
```

#### B12.2. Render a video tile + player modal

After the existing pagination dots and BEFORE the lightbox modal, add:

```tsx
{videos && videos.length > 0 && (
  <View style={styles.videoStrip}>
    <Pressable
      style={styles.videoTile}
      onPress={() => setPlayerOpen(true)}
      accessibilityLabel={t('product.gallery.playVideo')}
    >
      {videos[0].thumbnailUrl ? (
        <Image source={{ uri: videos[0].thumbnailUrl }} style={styles.videoTileImg} />
      ) : (
        <View style={styles.videoTilePlaceholder} />
      )}
      <View style={styles.videoTilePlayBadge}>
        <Icon name="play-arrow" size={20} color={colors.white} />
      </View>
    </Pressable>
  </View>
)}

{playerOpen && videos && videos.length > 0 && (
  <ProductVideoPlayer
    visible={playerOpen}
    videos={videos}
    imageUrls={validImages}
    initialVideoIndex={0}
    initialImageIndex={activeIndex}
    initialTab="videos"
    productTitle={/* productTitle prop, see below */}
    vendorName={/* vendorName prop, see below */}
    onClose={() => setPlayerOpen(false)}
  />
)}
```

ProductImageGallery doesn't currently take `productTitle` or `vendorName` — add them as props (PDP screen has both readily available). Mirror web's `VideoPopover` props.

```typescript
interface ProductImageGalleryProps {
  images: string[];
  videos?: VideoEntry[];
  productTitle?: string;
  vendorName?: string | null;
  inWishlist: boolean;
  onToggleWishlist: () => void;
}
```

Add `playerOpen` state:

```typescript
const [playerOpen, setPlayerOpen] = useState(false);
```

Add styles:

```typescript
videoStrip: {
  marginTop: spacing[2],
  flexDirection: 'row',
  paddingHorizontal: spacing[1],
},
videoTile: {
  width: 64,
  aspectRatio: 16 / 9,
  borderRadius: borderRadius.md,
  overflow: 'hidden',
  backgroundColor: colors.slate100,
  position: 'relative',
},
videoTileImg: { width: '100%', height: '100%' },
videoTilePlaceholder: { width: '100%', height: '100%', backgroundColor: colors.slate200 },
videoTilePlayBadge: {
  position: 'absolute',
  inset: 0,
  alignItems: 'center',
  justifyContent: 'center',
},
```

### B13. Edit — `app/(tabs)/(home)/product/[id].tsx`

Derive `videoEntries` from `product.videos` and pass to `ProductImageGallery`. Mirror the web PDP page's exact derivation logic at line 390:

```typescript
const videoEntries = useMemo(() => {
  return (product?.videos ?? [])
    .filter((vid) => !!vid.playback?.mp4)
    .map((vid) => ({
      mp4Url: vid.playback!.mp4!,
      thumbnailUrl: vid.thumbnailUrl ?? undefined,
      duration: vid.duration ?? undefined,
      width: vid.width ?? undefined,
      height: vid.height ?? undefined,
    }));
}, [product?.videos]);
```

Pass to gallery:

```tsx
<ProductImageGallery
  images={imageUrls}
  videos={videoEntries}
  productTitle={product.title}
  vendorName={product.vendorName}
  inWishlist={inWishlist}
  onToggleWishlist={handleToggleWishlist}
/>
```

### B14. i18n strings

Add to all three locale files (`i18n/en.json`, `i18n/es.json`, `i18n/id.json`) under `product.gallery`:

```json
{
  "product": {
    "gallery": {
      "playVideo": "Play video",
      "closeVideo": "Close video player",
      "videosTab": "Videos",
      "imagesTab": "Images",
      "videosForProduct": "Videos for this product",
      "noImages": "No images available"
    }
  }
}
```

Provide proper translations for `es` and `id`. Do not reuse English strings.

---

## §C. Acceptance criteria

Feature is shippable when ALL of:

### Card preview
- `ProductCard` renders an image-only card when `previewVideo` is null (verified on a product with no approved video).
- `ProductCard` overlays a silent autoplay loop when `previewVideo` is present AND the card is viewable AND the app is foregrounded AND environment permits.
- Maximum 3 concurrent video players across the entire app at any moment (verified by scrolling through home + recommendations + recently viewed simultaneously).
- Backgrounding the app pauses ALL videos within ~500ms (verified by sampling network bandwidth — should drop to ~0 immediately).
- ANY playback error (404, decode, codec) results in the static image showing with NO visible UI difference. No error icon, no broken-tile UI, no console-visible failure leaking to the user.
- Reduce Motion ON: zero videos play (verified in iOS Settings → Accessibility → Motion → Reduce Motion).
- Cellular + 2g: zero videos play (hard to verify without a 2g network — confirm via NetInfo logging).

### PDP gallery
- Product with no videos: gallery shows images only, no video tile.
- Product with at least one video: gallery shows existing image strip + a single video tile after.
- Tapping the video tile opens a full-screen modal with native player controls.
- Modal has Videos / Images tabs at top.
- Modal sidebar lists ALL videos when there's more than one — tapping switches the active video.
- Closing the modal resumes the gallery's swipe state.
- Player has sound by default in the modal (the muted card preview is a different surface).

### Cross-cutting
- TypeScript strict mode passes.
- All new strings exist in `en`, `es`, `id` locale files.
- No console errors / warnings during normal browsing.
- No memory growth during a 5-minute browse session (verified by Xcode Instruments / Android Studio Profiler — heap should stabilize, not grow unboundedly).
- iOS + Android both build via `npm run rebuild:ios` and `npx expo run:android`.

---

## §D. Anti-patterns (DO NOT DO)

- **Do NOT** render `VideoView` and toggle `opacity` to "hide" it. The native player keeps decoding regardless of opacity. Mount/unmount is the only correct gate.
- **Do NOT** call `player.release()` manually inside `ProductPreviewVideo`'s effect cleanup. `expo-video`'s `useVideoPlayer` hook owns the player lifecycle; manual release on top of hook-managed release crashes iOS.
- **Do NOT** skip the `key={activeVideo.mp4Url}` on the modal's `<ActiveVideoPlayer>`. Without it, switching videos in the sidebar reuses the same player instance with a swapped source, which breaks expo-video's autoplay behavior on Android.
- **Do NOT** show ANY UI feedback when a card preview fails. Per web plan contract #8, the user must see the static image with zero indication that a video ever existed.
- **Do NOT** lift the LRU cap above 3 without re-running the bandwidth math. The cap is a guardrail.
- **Do NOT** set `staysActiveInBackground=true` on the preview player. Audio-only background playback is the only legitimate use case for that flag and we are explicitly muted.
- **Do NOT** put videos in the main image FlatList. The gallery is built around `pagingEnabled` swipe through images; mixing videos into the same scroll container forces the player to mount/unmount on every swipe and bricks autoplay.
- **Do NOT** load `@react-native-community/netinfo` inside a render path. The async `NetInfo.fetch()` call must live behind the `previewEnvironment` cache.
- **Do NOT** implement a custom IntersectionObserver-equivalent for cards using `View.measureInWindow` on every scroll tick. That re-measures every card on every frame and tanks scroll performance. The viewability context driven by FlatList's native callback is the correct primitive.
- **Do NOT** import from `expo-av`. It's deprecated for video and we have zero existing usage to keep compatibility with.

---

## §E. Optional follow-ups (NOT in v1 scope)

- Proper grid viewability for `ProductGrid` nested in parent ScrollView (currently uses pragmatic "all rendered = viewable" fallback — see §B11.2).
- Vitest/Jest unit tests for the five new modules. The web plan's tests in `Wabbus/src/lib/__tests__/` and `Wabbus/src/hooks/__tests__/` are good references; mobile equivalents would live in `lib/__tests__/` and `hooks/__tests__/` and use `jest-expo` if testing infra is added later.
- A debug overlay (DEV only) showing slot count + currently-acquired ids — handy for verifying LRU behavior visually during development.
