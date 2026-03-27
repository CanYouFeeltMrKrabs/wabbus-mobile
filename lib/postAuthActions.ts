/**
 * Post-auth actions: merge guest cart + stitch anonymous session.
 * Port of web's postAuthActions.ts using AsyncStorage-based tracker.
 */

import { mergeGuestCart } from "./mergeGuestCart";
import { getSessionId } from "./tracker";
import { API_BASE } from "./config";

export async function runPostAuthActions(): Promise<void> {
  try {
    await mergeGuestCart();
  } catch {
    /* best-effort */
  }

  try {
    const sessionId = await getSessionId();
    if (sessionId) {
      fetch(`${API_BASE}/events/stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}
