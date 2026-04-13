/**
 * Messages helpers — ported from the web app's helpers.ts.
 *
 * Provides relative time formatting, message preview sanitization,
 * conversation helpers, and the unified ticket+case entry builder.
 */

import type {
  SupportTicket,
  CustomerCase,
  UnifiedEntry,
  Conversation,
} from "@/lib/messages-types";
import { entityId, titleCaseEnum } from "@/lib/messages-types";

type TFn = (key: string, values?: Record<string, any>) => string;

/* ── Date / time ─────────────────────────────────────────────── */

export function relativeTime(iso: string | null | undefined, t: TFn): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const seconds = (Date.now() - d.getTime()) / 1000;
  if (seconds < 60) return t("messages.justNow");
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 172800) return t("messages.yesterday");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Text preview ────────────────────────────────────────────── */

function truncate(s: string, max = 100): string {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function collapseRepeatedListTokens(s: string): string {
  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length < 4) return s;
  const first = tokens[0];
  if (tokens.every((x) => x === first)) return `${first}…`;
  return s;
}

function collapseWholeStringRepetition(s: string): string {
  const t = s.trim();
  if (t.length < 9) return s;
  const maxUnit = Math.min(32, Math.floor(t.length / 3));
  for (let len = maxUnit; len >= 2; len--) {
    const unit = t.slice(0, len);
    if (!unit.trim()) continue;
    let pos = 0;
    while (pos + len <= t.length && t.slice(pos, pos + len) === unit) pos += len;
    if (pos === t.length && pos >= len * 3) {
      return `${unit.replace(/\s+$/u, "")}…`;
    }
  }
  return s;
}

/**
 * Sidebar / list preview: readable one-liner without markdown noise.
 */
export function messageListPreview(raw: string, maxLen = 100): string {
  let s = (raw ?? "").replace(/\r\n?/g, "\n");

  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  s = s.replace(/#{1,6}\s*/g, "");
  s = s.replace(/\*\*?|__|\\*|_/g, "");

  s = s.replace(/\s+/g, " ").trim();
  s = collapseRepeatedListTokens(s);
  s = collapseWholeStringRepetition(s);
  try {
    s = s.replace(/(.)\\1{7,}/gu, "$1$1$1…");
  } catch {
    s = s.replace(/(.)\\1{7,}/g, "$1$1$1…");
  }
  s = s.replace(/\s+/g, " ").trim();
  return truncate(s, maxLen);
}

/* ── Conversation helpers ────────────────────────────────────── */

export function convoTitle(c: Conversation, t: TFn): string {
  const vendor = c.vendor?.name?.trim();
  if (vendor) return vendor;
  return t("messages.sellerConversation");
}

export function convoStatus(c: Conversation): "ACTIVE" | "LOCKED" {
  if (c.status === "CLOSED" || c.escalatedAt) return "LOCKED";
  return "ACTIVE";
}

/* ── Ticket helpers ──────────────────────────────────────────── */

export function ticketCategoryLabel(ticket: SupportTicket, t: TFn): string {
  const labels: Record<string, string> = {
    ORDER_SUPPORT: t("messages.categoryOrderSupport"),
    TECHNICAL: t("messages.categoryTechnical"),
    BILLING: t("messages.categoryBilling"),
    ACCOUNT: t("messages.categoryAccount"),
    OTHER: t("messages.categoryOther"),
  };
  return labels[ticket.category ?? ""] ?? (ticket.category ? titleCaseEnum(ticket.category) : t("messages.supportTicketFallback"));
}

/* ── Case helpers ────────────────────────────────────────────── */

export function caseStatusLabel(status: string, t: TFn): string {
  const labels: Record<string, string> = {
    OPEN: t("messages.statusInReview"),
    RESOLVED: t("messages.statusResolved"),
    CLOSED: t("messages.statusClosed"),
  };
  return labels[status] ?? t("messages.statusInReview");
}

export function isCaseActive(status: string): boolean {
  return status !== "CLOSED" && status !== "RESOLVED";
}

export function resolutionIntentLabel(intent: string, t: TFn): string {
  const labels: Record<string, string> = {
    REFUND: t("messages.resolutionRefund"),
    STORE_CREDIT: t("messages.resolutionStoreCredit"),
    REPLACEMENT: t("messages.resolutionReplacement"),
    RETURN: t("messages.resolutionReturn"),
    MISSING_PACKAGE: t("messages.resolutionMissingPackage"),
  };
  return labels[intent] ?? titleCaseEnum(intent);
}

export function caseItemSummary(c: CustomerCase, t: TFn): string {
  if (!c.items || c.items.length === 0) return t("messages.noItems");
  const first = c.items[0];
  const title =
    first.orderItem?.productVariant?.product?.title ||
    first.orderItem?.productVariant?.title ||
    `Item #${first.orderItem?.publicId ?? "?"}`;
  if (c.items.length === 1) return title;
  return `${title} +${c.items.length - 1} more`;
}

/* ── Unified entries ─────────────────────────────────────────── */

/**
 * Merge tickets and cases into a unified, deduplicated, date-sorted list.
 * - Tickets with a caseNumber matching a case → absorbed into the case entry
 * - Tickets without a matching case → standalone ticket entries
 * - Cases without a matching ticket → standalone case entries
 */
export function buildUnifiedEntries(
  tickets: SupportTicket[],
  cases: CustomerCase[],
): UnifiedEntry[] {
  const ticketByCaseNumber = new Map<string, SupportTicket>();
  const unmatchedTickets: SupportTicket[] = [];

  for (const t of tickets) {
    if (t.caseNumber) {
      const existing = ticketByCaseNumber.get(t.caseNumber);
      if (!existing || (t.updatedAt ?? t.createdAt) > (existing.updatedAt ?? existing.createdAt)) {
        if (existing) unmatchedTickets.push(existing);
        ticketByCaseNumber.set(t.caseNumber, t);
      } else {
        unmatchedTickets.push(t);
      }
    } else {
      unmatchedTickets.push(t);
    }
  }

  const entries: UnifiedEntry[] = [];
  const linkedTicketEntries: UnifiedEntry[] = [];

  for (const c of cases) {
    const linkedTicket = ticketByCaseNumber.get(c.caseNumber) ?? null;
    if (linkedTicket) {
      ticketByCaseNumber.delete(c.caseNumber);
      linkedTicketEntries.push({
        kind: "ticket",
        ticket: linkedTicket,
        sortDate: linkedTicket.updatedAt ?? linkedTicket.createdAt,
        linkedCaseNumber: c.caseNumber,
      });
    }
    const sortDate = linkedTicket
      ? [c.updatedAt, linkedTicket.updatedAt ?? linkedTicket.createdAt].sort().pop()!
      : c.updatedAt;
    entries.push({ kind: "case", case_: c, linkedTicket, sortDate });
  }

  for (const t of ticketByCaseNumber.values()) {
    unmatchedTickets.push(t);
  }

  for (const t of unmatchedTickets) {
    entries.push({ kind: "ticket", ticket: t, sortDate: t.updatedAt ?? t.createdAt });
  }

  entries.push(...linkedTicketEntries);
  entries.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  return entries;
}

/* ── Status priority for family aggregation ──────────────────── */

const STATUS_PRIORITY: Record<string, number> = {
  OPEN: 0,
  RESOLVED: 1,
  CLOSED: 2,
};

export function mostUrgentStatus(cases: CustomerCase[]): string {
  let best = cases[0]?.status ?? "OPEN";
  let bestPriority = STATUS_PRIORITY[best] ?? 99;
  for (const c of cases) {
    const p = STATUS_PRIORITY[c.status] ?? 99;
    if (p < bestPriority) {
      best = c.status;
      bestPriority = p;
    }
  }
  return best;
}
