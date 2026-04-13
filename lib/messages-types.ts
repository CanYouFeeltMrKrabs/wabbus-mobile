export type SupportTicketMessage = {
  id?: number;
  publicId?: string;
  senderType: string;
  body: string;
  eventType?: string | null;
  attachmentKey?: string | null;
  attachmentFileName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSize?: number | null;
  attachmentVerified?: boolean | null;
  createdAt: string;
};

export type SupportTicket = {
  id?: number;
  publicId?: string;
  ticketNumber?: string | null;
  subject?: string | null;
  body: string;
  category?: string | null;
  status: "OPEN" | "CLOSED";
  orderNumber?: string | null;
  caseNumber?: string | null;
  openedBy?: string | null;
  agentName?: string | null;
  closedAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  messages?: SupportTicketMessage[] | null;
  _count?: { messages: number } | null;
  lastMessage?: SupportTicketMessage | null;
};

export type CustomerCaseItem = {
  id?: number;
  publicId?: string;
  qtyAffected: number;
  reasonCode: string;
  orderItem: {
    publicId?: string;
    quantity: number;
    productVariant?: {
      title?: string | null;
      sku?: string | null;
      product?: { title?: string | null } | null;
    } | null;
  };
};

export type LinkedTicketRef = {
  publicId: string;
  ticketNumber: string | null;
};

export type CustomerCase = {
  caseNumber: string;
  status: string;
  resolutionIntent: string;
  resolutionFinal?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    publicId?: string;
    orderNumber?: string | null;
    createdAt?: string | null;
  };
  caseFamily?: { id: number; familyNumber: string } | null;
  linkedTicketPublicId?: string | null;
  linkedTickets?: LinkedTicketRef[];
  items: CustomerCaseItem[];
};

export type CustomerCaseDetail = {
  id: string;
  status: string;
  resolutionIntent: string;
  resolutionFinal?: string | null;
  linkedTicketPublicId?: string | null;
  linkedTicketNumber?: string | null;
  linkedTickets?: LinkedTicketRef[];
  createdAt: string;
  updatedAt: string;
  note: string | null;
  order: {
    publicId?: string;
    orderNumber?: string | null;
    createdAt?: string | null;
  };
  items: Array<{
    publicId?: string;
    quantity: number;
    orderItem: {
      publicId?: string;
      quantity: number;
      unitPrice?: string | number | null;
      productVariant?: {
        title?: string | null;
        sku?: string | null;
        product?: { title?: string | null } | null;
      } | null;
    };
  }>;
  refund: {
    status: string;
    amountCents: number;
    createdAt: string;
  } | null;
};

/**
 * Unified sidebar entry: either a standalone ticket, a standalone case,
 * or a case+ticket combo (one entry, case is primary).
 */
export type UnifiedEntry =
  | { kind: "ticket"; ticket: SupportTicket; sortDate: string; linkedCaseNumber?: string | null }
  | { kind: "case"; case_: CustomerCase; linkedTicket: SupportTicket | null; sortDate: string };

export type MainTab = "tickets" | "messages";
export type FilterTab = "active" | "archived";

/** Conversation type for seller messages */
export type Conversation = {
  id?: number;
  publicId?: string;
  subject?: string;
  status?: "OPEN" | "CLOSED";
  escalatedAt?: string | null;
  archivedAt?: string | null;
  lastMessageAt?: string | null;
  unreadCount?: number;
  order?: {
    publicId?: string;
    orderNumber?: string | null;
    createdAt?: string | null;
    status?: string | null;
  } | null;
  vendor?: {
    publicId?: string;
    slug?: string | null;
    name?: string | null;
    logoUrl?: string | null;
  } | null;
  lastMessage?: {
    publicId?: string;
    senderType: "CUSTOMER" | "VENDOR" | "ADMIN";
    body: string;
    createdAt: string;
  } | null;
};

/** Stable identifier for a ticket or conversation, preferring publicId. */
export function entityId(e: { publicId?: string; id?: number }): string {
  return e.publicId ?? String(e.id ?? "");
}

export function titleCaseEnum(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
