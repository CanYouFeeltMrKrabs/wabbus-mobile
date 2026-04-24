/**
 * Public surface of the sealed query layer.
 *
 * App code MUST import server-state hooks and cache helpers from this module
 * only. Direct imports of '@tanstack/react-query', 'lib/queries/_internal/*',
 * or any 'lib/queries/<domain>' module are forbidden by the ESLint
 * 'no-restricted-imports' rule (eslint.config.mjs) and the CI grep check
 * (scripts/check-query-imports.sh).
 *
 * Currently exports:
 *   - invalidate: typed cache-coordination helpers
 *   - orders: useOrderDetail, useOrdersList + Order/OrderItem types
 *   - messages: useConversationsList, useConversationDetail, useTicketsList,
 *     useTicketDetail, useCasesList, useCasesListFlat, useCaseDetail,
 *     useCaseMessages, useFamilyCases + canonical types
 *
 * Domain hooks for the remaining domains will appear here as each domain is
 * migrated. See lib/queries/_internal/react-query.ts for the single bridge
 * to TanStack Query.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §2 (file layout).
 */

export { invalidate } from "./invalidate";

// ─── Orders domain ────────────────────────────────────────────────────────
export { useOrderDetail, useOrdersList } from "./orders";
export type {
  Order,
  OrderItem,
  OrdersListParams,
  OrdersListResponse,
} from "./orders";

// ─── Messages domain ──────────────────────────────────────────────────────
export {
  useConversationsList,
  useConversationDetail,
  useTicketsList,
  useTicketDetail,
  useCasesList,
  useCasesListFlat,
  useCaseDetail,
  useCaseMessages,
  useFamilyCases,
} from "./messages";
export type {
  Conversation,
  ConvoMessage,
  ConversationDetail,
  SupportTicket,
  SupportTicketMessage,
  SupportTicketDetail,
  CustomerCase,
  CustomerCaseDetail,
  CustomerCaseItem,
  CaseMessage,
  LinkedTicketRef,
} from "./messages";

// ─── Recommendations domain ──────────────────────────────────────────────
export {
  useRecommendationsHome,
  useRecommendationsStrategy,
  useTrendingCategories,
  useRecommendationsContext,
  useRecommendationsProduct,
  useRecommendationsPostPurchase,
  useRecommendationsCart,
} from "./recommendations";
export type {
  HomeRecommendations,
  PublicProductReco,
  TrendingCategoryRow,
} from "./recommendations";

// ─── Products domain ─────────────────────────────────────────────────────
export { useProductsList, useProductDetail } from "./products";
export type {
  PublicProduct as PublicProductCanonical,
  ProductDetail,
  ProductsListParams,
} from "./products";

// ─── Categories domain ────────────────────────────────────────────────────
export { useCategoriesAll, useCategoryProducts, useCategoryNewArrivals } from "./categories";
export type {
  CategoryLink as CategoryLinkCanonical,
  CategoriesProductsParams,
} from "./categories";

// ─── Vendors domain ──────────────────────────────────────────────────────
export {
  useVendorDetail,
  useVendorProducts,
  useVendorMoreProducts,
  useVendorReviews,
  useVendorReviewsSummary,
} from "./vendors";
export type {
  VendorProfile,
  VendorReview,
  VendorReviewSummary,
  VendorProductsResponse,
  VendorProductsParams,
} from "./vendors";

// ─── Reviews domain (user's own reviews + PDP summary) ───────────────────
export { useMyProductReviews, useReviewSummary } from "./reviews";
export type { MyReview, ReviewSummary } from "./reviews";

// ─── Cases domain (order-scoped cases — distinct from messages) ──────────
export { useMyCases, useCaseDetail as useOrderCaseDetail } from "./cases";
export type { CaseSummary, CaseDetail as OrderCaseDetail } from "./cases";

// ─── Returns domain ──────────────────────────────────────────────────────
export { useReturnsList, useReplacementCheck } from "./returns";
export type { ReturnRequestCanonical, ReplacementCheck } from "./returns";

// ─── Addresses domain ────────────────────────────────────────────────────
export { useAddressesList } from "./addresses";
export type { Address } from "./addresses";

// ─── Payment Methods domain ──────────────────────────────────────────────
export { usePaymentMethods } from "./paymentMethods";
export type { PaymentMethod } from "./paymentMethods";

// ─── Store Credit domain ─────────────────────────────────────────────────
export { useStoreCreditBalance } from "./storeCredit";
export type { StoreCreditBalance } from "./storeCredit";
