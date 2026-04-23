/**
 * Typed invalidation namespace — the single, audited surface for marking
 * cache entries stale from inside mutations and post-action handlers.
 *
 * Why this exists: the user explicitly flagged that locking down read paths
 * while still allowing ad-hoc `queryClient.invalidateQueries({ queryKey:
 * queryKeys.* })` calls leaves a side door wide open — a developer can
 * always import the legacy keys and operate on the cache directly. By
 * routing every invalidation through this namespace, we close that door:
 * callers cannot reach into another domain's keys, and the keys themselves
 * remain private to each domain module.
 *
 * Each domain registers its own invalidate helpers (see e.g.
 * `lib/queries/orders.ts → invalidateOrders`) and they are aggregated here
 * under the corresponding namespace. App code imports only this object via
 * the public barrel:
 *
 *   import { invalidate } from "@/lib/queries";
 *   await invalidate.orders.detail(orderId);
 *
 * Plan reference: §3.2 Step E (orders), and equivalent steps for every
 * subsequent domain.
 */

import { invalidateAddresses } from "./addresses";
import { invalidateCart } from "./cart";
import { invalidateCases } from "./cases";
import { invalidateCategories } from "./categories";
import { invalidateMessages } from "./messages";
import { invalidateOrders } from "./orders";
import { invalidatePaymentMethods } from "./paymentMethods";
import { invalidateProducts } from "./products";
import { invalidateRecommendations } from "./recommendations";
import { invalidateReturns } from "./returns";
import { invalidateReviews } from "./reviews";
import { invalidateStoreCredit } from "./storeCredit";
import { invalidateVendors } from "./vendors";

export const invalidate = {
  cart: invalidateCart,
  cases: invalidateCases,
  orders: invalidateOrders,
  messages: invalidateMessages,
  products: invalidateProducts,
  categories: invalidateCategories,
  recommendations: invalidateRecommendations,
  addresses: invalidateAddresses,
  paymentMethods: invalidatePaymentMethods,
  returns: invalidateReturns,
  reviews: invalidateReviews,
  storeCredit: invalidateStoreCredit,
  vendors: invalidateVendors,
} as const;
