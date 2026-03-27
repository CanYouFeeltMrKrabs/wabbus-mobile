/**
 * Merge the guest cart (stored in AsyncStorage) into the user's server cart.
 * Uses customerFetch (cookie-based auth).
 *
 * Called after login/register to unify guest browsing with the authenticated session.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { customerFetch } from "./api";

const GUEST_CART_KEY = "guest_cart";

export async function mergeGuestCart(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(GUEST_CART_KEY);
  if (!raw) return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return false;

  const items = parsed
    .filter(
      (it: any) =>
        typeof it?.variantPublicId === "string" && it.variantPublicId.length > 0,
    )
    .map((it: Record<string, unknown>) => ({
      variantPublicId: it.variantPublicId as string,
      quantity: Number(it?.quantity ?? 1),
    }))
    .filter((it) => Number.isFinite(it.quantity) && it.quantity >= 1);

  if (items.length === 0) return false;

  try {
    await customerFetch("/cart/merge", {
      method: "POST",
      body: JSON.stringify({ items }),
    });

    await AsyncStorage.removeItem(GUEST_CART_KEY);
    return true;
  } catch {
    return false;
  }
}
