/**
 * useOnScreenViewability — card-side hook that ties a card's outer
 * View ref to the global on-screen polling tracker.
 *
 * Returns `true` while any portion of the referenced view's bounding
 * rect intersects the screen viewport. Used by ProductCard to gate
 * preview-video autoplay; safe to use for any future on-screen-driven
 * behavior (lazy image hi-res swap, impression analytics, etc).
 *
 * Replaces the previous `useIsCardViewable` (subscription-to-context)
 * approach. The new mechanism works on EVERY scroll surface — plain
 * ScrollView, FlatList, SectionList, no scroll at all — without
 * requiring the parent to wire up `onViewableItemsChanged` or any
 * provider. See `lib/onScreenViewability.ts` for the design rationale.
 *
 * Strict guarantees:
 *   - `false` until the card has been measured at least once.
 *   - `false` immediately when the card unmounts (synchronous notify
 *     from the unregister path) — preview-video slot is released the
 *     same tick the card disappears, no leak.
 *   - `false` during fast scroll if the card is fully off-screen by
 *     the next 200ms tick. The cap-3 LRU in `lib/previewConcurrency.ts`
 *     handles the "many cards briefly visible" stress case.
 */
import { useEffect, useState, type RefObject } from "react";
import type { View } from "react-native";
import {
  registerCardForViewability,
  subscribeViewability,
} from "@/lib/onScreenViewability";

export function useOnScreenViewability(
  productId: string,
  ref: RefObject<View | null>,
): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const unregister = registerCardForViewability(productId, ref);
    const unsubscribe = subscribeViewability(productId, setVisible);
    return () => {
      unsubscribe();
      unregister();
    };
  }, [productId, ref]);

  return visible;
}
