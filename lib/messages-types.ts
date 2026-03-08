export type SupportTicketMessage = {
  id?: number;
  publicId?: string;
  senderType: string;
  body: string;
  eventType?: string | null;
  createdAt: string;
};

export type SupportTicket = {
  id?: number;
  publicId?: string;
  ticketNumber?: string | null;
  body: string;
  category?: string | null;
  status: "OPEN" | "CLOSED";
  orderNumber?: string | null;
  caseNumber?: string | null;
  closedAt?: string | null;
  createdAt: string;
  messages?: SupportTicketMessage[] | null;
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
  items: CustomerCaseItem[];
};

export type CustomerCaseDetail = {
  id: string;
  status: string;
  resolutionIntent: string;
  resolutionFinal?: string | null;
  linkedTicketPublicId?: string | null;
  linkedTicketNumber?: string | null;
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
