/**
 * Centralized query key factory for TanStack Query.
 * Mirrors the web's queryKeys.ts for consistency.
 *
 * Hierarchical keys enable granular invalidation:
 *   queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() })
 * invalidates both the order list and all individual order details.
 *
 * Every key is a function returning a readonly tuple so TypeScript
 * enforces exact key shapes across the codebase.
 */

export const queryKeys = {
  me: () => ["me"] as const,

  products: {
    all: () => ["products"] as const,
    list: (params: Record<string, unknown>) => ["products", "list", params] as const,
    detail: (id: string) => ["products", "detail", id] as const,
  },

  orders: {
    all: () => ["orders"] as const,
    list: (params?: Record<string, unknown>) => ["orders", "list", params] as const,
    detail: (id: string | number) => ["orders", "detail", String(id)] as const,
  },

  returns: {
    all: () => ["returns"] as const,
    list: (params?: Record<string, unknown>) => ["returns", "list", params] as const,
    replacementCheck: (orderItemId: string | number) =>
      ["returns", "replacement-check", orderItemId] as const,
  },

  cart: () => ["cart"] as const,

  addresses: {
    all: () => ["addresses"] as const,
    list: () => ["addresses", "list"] as const,
  },

  messages: {
    all: () => ["messages"] as const,
    conversations: {
      all: () => ["messages", "conversations"] as const,
      list: () => ["messages", "conversations", "list"] as const,
      detail: (id: string | number) => ["messages", "conversations", "detail", id] as const,
    },
    tickets: {
      all: () => ["messages", "tickets"] as const,
      list: () => ["messages", "tickets", "list"] as const,
      detail: (id: string | number) => ["messages", "tickets", "detail", id] as const,
    },
    cases: {
      all: () => ["messages", "cases"] as const,
      list: () => ["messages", "cases", "list"] as const,
      listFlat: () => ["messages", "cases", "listFlat"] as const,
      detail: (caseNumber: string) => ["messages", "cases", "detail", caseNumber] as const,
      messages: (caseNumber: string) => ["messages", "cases", "messages", caseNumber] as const,
      familyMessages: (familyNumber: string) => ["messages", "cases", "familyMessages", familyNumber] as const,
    },
    unread: () => ["messages", "unread"] as const,
  },

  recommendations: {
    all: () => ["recommendations"] as const,
    home: () => ["recommendations", "home"] as const,
    product: (productId: string, type: string) => ["recommendations", "product", productId, type] as const,
    strategy: (strategy: string) => ["recommendations", "strategy", strategy] as const,
    category: (slug: string) => ["recommendations", "category", slug] as const,
    /**
     * Context-scoped personalized recommendations (mirrors web's
     * RecommendedCarousel). Cache key includes contextType + contextId
     * so the same surface used on different pages (e.g. category A vs
     * category B) does not corrupt each other's cache.
     */
    context: (contextType: string, contextId?: string | number | null) =>
      ["recommendations", "context", contextType, contextId == null ? null : String(contextId)] as const,
    postPurchase: (orderId: string | number) => ["recommendations", "post_purchase", String(orderId)] as const,
  },

  categories: {
    all: () => ["categories"] as const,
    detail: (slug: string) => ["categories", "detail", slug] as const,
    products: (slug: string, params?: Record<string, unknown>) => ["categories", slug, "products", params] as const,
    /**
     * Accepts slug (mobile) or numeric id (web parity). Coerced to string
     * so the cache key shape is stable regardless of caller.
     */
    newArrivals: (idOrSlug: string | number) => ["categories", "newArrivals", String(idOrSlug)] as const,
  },

  vendors: {
    detail: (publicId: string) => ["vendors", "detail", publicId] as const,
    products: (publicId: string, params?: Record<string, unknown>) => ["vendors", publicId, "products", params] as const,
    reviews: (publicId: string) => ["vendors", publicId, "reviews"] as const,
  },

  paymentMethods: () => ["payment-methods"] as const,

  storeCredit: () => ["store-credit"] as const,
} as const;
