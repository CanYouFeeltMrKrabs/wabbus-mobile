/**
 * onScreenViewability — single source of truth for "is this product card
 * currently visible on screen?" used to gate preview-video autoplay.
 *
 * Why polling instead of scroll-event-driven?
 *
 *   The mobile app renders cards inside a wide variety of scroll
 *   containers: plain `<ScrollView>` on home/recommended (with multiple
 *   `<ProductGrid>` sections interleaved with horizontal sliders), 2-up
 *   `<FlatList numColumns=2>` on category/search/vendor, and horizontal
 *   `<FlatList>` sliders. Wiring a scroll listener through every one of
 *   these requires either:
 *
 *     a) Refactoring every parent screen to use a single FlatList that
 *        owns the entire mixed-content layout (heavy, ergonomically
 *        bad), or
 *     b) Forcing every parent to be a custom scroll wrapper that
 *        publishes scroll events through context (less heavy, but
 *        brittle: any future surface that forgets the wrapper silently
 *        breaks autoplay).
 *
 *   Polling `measureInWindow` on registered card refs is the only
 *   approach that works on EVERY surface with zero parent integration
 *   and zero risk of silent breakage. Each registered card costs one
 *   bridge-async measureInWindow per tick; with the cap of ~30 cards
 *   ever rendered at once on a screen and a 200ms tick, that's ~150
 *   microscopic bridge calls per second. Negligible vs. the cost of
 *   even a single decoded video frame.
 *
 *   The ticker auto-pauses when no cards are registered (returning
 *   home → unregister → ticker stops; bandwidth/CPU baseline = zero).
 *
 * Contract:
 *   - register(productId, ref) — call from a card; returns a function
 *     that unregisters AND notifies subscribers that the card is no
 *     longer on screen. Safe to call repeatedly with the same ref.
 *   - subscribe(productId, cb) — call from a card to receive a
 *     boolean whenever its on-screen status changes. The callback
 *     fires synchronously once with the current known state.
 *   - The on-screen rule: any portion of the card's bounding rect
 *     intersects the screen viewport AND the rect has non-zero size.
 *     A card with zero width/height is never on-screen (filters out
 *     unmounted/unmeasured views).
 */

import { Dimensions, type View } from "react-native";

/* ─── Types ──────────────────────────────────────────────────────── */

type CardRef = React.RefObject<View | null>;
type Subscription = (visible: boolean) => void;

type Registration = {
  ref: CardRef;
  /** Last known visibility — keeps subscribers in sync without re-measuring. */
  lastVisible: boolean;
};

/* ─── Module state ───────────────────────────────────────────────── */

const TICK_MS = 200;
/**
 * Vertical buffer (in pts) added to the screen rect when computing
 * intersections. A card whose top edge is `BUFFER_PX` BELOW the screen
 * bottom is still considered "approaching" and starts loading; this
 * eliminates the empty-screen flash when scrolling fast.
 */
const BUFFER_PX = 0;

/** productId → Registration. Multiple registrations per productId are NOT
 *  expected (each productId appears at most once on a given screen at a
 *  given time), but if it ever happens, the most recent ref wins. */
const registry = new Map<string, Registration>();
/** productId → set of subscribers. */
const subscribers = new Map<string, Set<Subscription>>();

let tickerHandle: ReturnType<typeof setInterval> | null = null;

/* ─── Internal helpers ───────────────────────────────────────────── */

function startTicker() {
  if (tickerHandle != null) return;
  tickerHandle = setInterval(tick, TICK_MS);
  // Eager first measurement so newly-registered cards don't have to
  // wait a full tick before their video can autoplay.
  tick();
}

function stopTicker() {
  if (tickerHandle == null) return;
  clearInterval(tickerHandle);
  tickerHandle = null;
}

function notify(productId: string, visible: boolean) {
  const subs = subscribers.get(productId);
  if (!subs) return;
  for (const cb of subs) {
    try {
      cb(visible);
    } catch {
      // A misbehaving subscriber must never break sibling notifications
      // or the ticker itself.
    }
  }
}

function tick() {
  if (registry.size === 0) {
    stopTicker();
    return;
  }

  // Re-read the screen height every tick to handle device rotation,
  // split-screen on iPad, and software keyboard cases without needing
  // to wire a separate dimensions listener.
  const { height: screenH, width: screenW } = Dimensions.get("window");
  const top = -BUFFER_PX;
  const bottom = screenH + BUFFER_PX;

  for (const [productId, reg] of registry) {
    const node = reg.ref.current;
    if (!node) {
      if (reg.lastVisible) {
        reg.lastVisible = false;
        notify(productId, false);
      }
      continue;
    }
    // measureInWindow is async via the bridge but extremely cheap. The
    // callback may not fire if the view is unmounted before the bridge
    // returns — that's harmless because the unregister path already
    // notified subscribers with `false`.
    node.measureInWindow((x, y, width, height) => {
      // Defensive: native sometimes returns NaN/Infinity for
      // never-laid-out views during transitions.
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        return;
      }
      const stillRegistered = registry.get(productId);
      if (!stillRegistered || stillRegistered !== reg) return;

      const hasSize = width > 0 && height > 0;
      const verticallyOnScreen = y + height > top && y < bottom;
      const horizontallyOnScreen = x + width > 0 && x < screenW;
      const visible = hasSize && verticallyOnScreen && horizontallyOnScreen;

      if (visible !== reg.lastVisible) {
        reg.lastVisible = visible;
        notify(productId, visible);
      }
    });
  }
}

/* ─── Public API ─────────────────────────────────────────────────── */

/**
 * Register a card's outer view ref so the ticker can poll its position.
 * Returns an unregister function — MUST be called from the same
 * effect's cleanup, otherwise the ref leaks and the ticker keeps
 * polling a stale node.
 */
export function registerCardForViewability(
  productId: string,
  ref: CardRef,
): () => void {
  registry.set(productId, { ref, lastVisible: false });
  startTicker();
  return () => {
    const reg = registry.get(productId);
    if (reg && reg.ref === ref) {
      registry.delete(productId);
      // Inform subscribers that the card is no longer on-screen — a
      // card that unmounts mid-playback must release its preview slot
      // immediately, not on the next tick.
      if (reg.lastVisible) {
        notify(productId, false);
      }
    }
    if (registry.size === 0) {
      stopTicker();
    }
  };
}

/**
 * Subscribe to on-screen changes for a productId. The callback fires
 * synchronously once with the currently known state (false if the
 * card hasn't been measured yet) and then on every subsequent change.
 * Returns an unsubscribe function.
 */
export function subscribeViewability(
  productId: string,
  cb: Subscription,
): () => void {
  let bucket = subscribers.get(productId);
  if (!bucket) {
    bucket = new Set();
    subscribers.set(productId, bucket);
  }
  bucket.add(cb);
  // Sync the new subscriber to whatever the ticker last observed —
  // avoids waiting a full tick for the first paint.
  const reg = registry.get(productId);
  cb(reg?.lastVisible ?? false);
  return () => {
    const b = subscribers.get(productId);
    if (!b) return;
    b.delete(cb);
    if (b.size === 0) subscribers.delete(productId);
  };
}

/** Test-only helper. */
export function _resetOnScreenViewabilityForTests(): void {
  stopTicker();
  registry.clear();
  subscribers.clear();
}
