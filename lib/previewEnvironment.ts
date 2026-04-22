/**
 * Async environment gate for preview-video autoplay.
 *
 * Returns false (gate closed → render static image only) when ANY of:
 *   - User has Reduce Motion enabled (iOS Settings → Accessibility → Motion;
 *     Android Settings → Accessibility → Remove animations)
 *   - Connection is expensive AND cellular (conservative default — mobile
 *     users on metered cellular plans care about data)
 *   - Connection is 2g — bandwidth too low for any video to play smoothly
 *
 * All checks are feature-detected. Anything we can't read is treated as
 * permissive (default allow). Cached after first resolve — environment
 * conditions don't change frequently within a session, and re-checking
 * on every card mount is wasteful.
 *
 * Mirror of the web equivalent at `Wabbus/src/lib/previewEnvironment.ts`,
 * adapted to RN's async APIs (AccessibilityInfo + NetInfo). Web uses
 * `prefers-reduced-motion` + `navigator.connection.saveData`; the
 * semantics are the same.
 */

import { AccessibilityInfo } from "react-native";
import NetInfo from "@react-native-community/netinfo";

let cached: boolean | null = null;
let pending: Promise<boolean> | null = null;

export async function isPreviewEnvironmentPermitted(): Promise<boolean> {
  if (cached !== null) return cached;
  if (pending) return pending;

  pending = (async () => {
    try {
      const reduceMotion = await AccessibilityInfo.isReduceMotionEnabled();
      if (reduceMotion) {
        cached = false;
        return false;
      }
    } catch {
      // AccessibilityInfo throwing is exotic; fall through and check network.
    }

    try {
      const state = await NetInfo.fetch();

      // `isConnectionExpensive` is iOS-only (Android always returns false).
      // Block only when the connection is BOTH expensive AND cellular —
      // home Wi-Fi reporting "expensive" alone is not a strong enough signal.
      if (
        state.type === "cellular" &&
        state.details &&
        "isConnectionExpensive" in state.details &&
        state.details.isConnectionExpensive === true
      ) {
        cached = false;
        return false;
      }

      if (
        state.type === "cellular" &&
        state.details &&
        "cellularGeneration" in state.details &&
        state.details.cellularGeneration === "2g"
      ) {
        cached = false;
        return false;
      }
    } catch {
      // Permissive fail — if NetInfo throws, we don't want to brick the feature.
    }

    cached = true;
    return true;
  })();

  try {
    return await pending;
  } finally {
    pending = null;
  }
}

/** Test-only helper. */
export function _resetPreviewEnvironmentCacheForTests(): void {
  cached = null;
  pending = null;
}
