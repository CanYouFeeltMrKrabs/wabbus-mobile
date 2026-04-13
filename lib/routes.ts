/**
 * Routes — single source of truth for all in-app navigation paths.
 *
 * Every router.push / router.replace / href MUST use these constants.
 * Never hardcode path strings in component files.
 */

export const ROUTES = {
  // Tabs
  home: "/(tabs)" as const,
  homeFeed: "/" as const,
  chatTab: "/(tabs)/chat" as const,
  cart: "/(tabs)/cart" as const,
  accountTab: "/(tabs)/account" as const,
  search: "/search" as const,
  searchWithSort: (sort: string) => `/search?sort=${sort}` as const,
  categories: "/(tabs)/categories" as const,
  category: (slug: string) => `/(tabs)/category/${slug}` as const,
  product: (id: string) => `/(tabs)/product/${id}` as const,

  // Auth
  login: "/(auth)/login" as const,
  register: "/(auth)/register" as const,
  forgotPassword: "/(auth)/forgot-password" as const,

  // Checkout flow
  checkout: "/checkout" as const,
  orderComplete: (orderId: string | number) =>
    `/order-complete?orderId=${encodeURIComponent(String(orderId))}` as const,

  // Orders
  orders: "/orders" as const,
  orderDetail: (id: string | number) => `/orders/${id}` as const,
  orderTracking: (id: string | number) => `/orders/${id}/tracking` as const,
  orderCancel: (id: string | number) => `/orders/${id}/cancel` as const,
  orderReturn: (id: string | number) => `/orders/${id}/return` as const,
  orderReview: (id: string | number) => `/orders/${id}/review` as const,
  orderMissing: (id: string | number) => `/orders/${id}/missing` as const,
  orderCase: (id: string | number, issueId: string) =>
    `/orders/${id}/case?issueId=${encodeURIComponent(issueId)}` as const,

  // Account
  accountDetails: "/account/details" as const,
  accountChangePassword: "/account/change-password" as const,
  accountChangeEmail: "/account/change-email" as const,
  accountAddresses: "/account/addresses" as const,
  accountPaymentMethods: "/account/payment-methods" as const,
  accountDeleteAccount: "/account/delete-account" as const,
  accountWishlist: "/account/wishlist" as const,
  accountMessages: "/account/messages" as const,
  accountConversation: (id: string | number) =>
    `/account/messages/conversation/${id}` as const,
  accountCase: (caseNumber: string) =>
    `/account/messages/case/${caseNumber}` as const,
  accountFamily: (familyNumber: string) =>
    `/account/messages/family/${familyNumber}` as const,

  // Support
  support: "/support" as const,
  supportTicket: "/support/ticket" as const,
  supportTicketDetail: (ticketId: string) =>
    `/support/ticket-detail/${ticketId}` as const,
  supportLiveChat: "/(tabs)/chat" as const,
  supportMessageSeller: (orderId: string | number) =>
    `/support/message-seller/${orderId}` as const,
  supportMessageSellerAll: "/support/message-seller/all" as const,

  // Vendor
  vendor: (id: string) => `/vendor/${id}` as const,
  vendorReviews: (id: string) => `/vendor/${id}/reviews` as const,

  // Product redirect (internal id → public)
  productRedirect: (id: string | number) => `/product-redirect/${id}` as const,

  // Impersonation
  impersonate: "/impersonate" as const,

  recommended: "/recommended" as const,

  // Legal
  terms: "/terms" as const,
  privacy: "/privacy" as const,
  contact: "/contact" as const,

  accessibility: "/accessibility" as const,
} as const;
