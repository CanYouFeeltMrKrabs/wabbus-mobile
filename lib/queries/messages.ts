/**
 * Messages domain — sealed query layer.
 *
 * This module is the single owner of the 'messages' query keys (every key
 * tuple beginning with the literal "messages"). Every read, write, and
 * invalidation for the conversations / tickets / cases / unread sub-namespaces
 * MUST flow through one of the typed hooks (or `invalidate.messages.*`) exported
 * here. The rest of the app does not know the messages keys exist.
 *
 * See .cursor/plans/sealed_query_layer_c4f8a2b1.plan.md §0 (rule), §3.1
 * (per-domain choreography), and `.cursor/handoff-sealed-query-layer.md` §E.2
 * (per-call-site inventory + the *one* explicit behavior change at the end of
 * the migration: removing the read-side `useMemo(() => unwrapList(raw))`
 * belt-and-suspenders in `app/account/messages.tsx`).
 *
 * Migration status (Step A): typed read hooks + schemas + invalidate helpers
 * shipped. Zero callers migrated. Existing `useQuery({ queryKey:
 * queryKeys.messages.* })` call sites continue to function; they share the
 * cache entry with this module via Rule A (byte-identical keys).
 *
 * Sub-namespaces:
 *   - conversations: customer ↔ vendor messaging (one cache key per conversation)
 *   - tickets:       customer ↔ support tickets (one cache key per ticket)
 *   - cases:         customer claims / refunds / replacements (5 keys per case)
 *   - unread:        a single tally key — invalidated by mutations elsewhere,
 *                    NOT read by any caller today (no read hook is exported)
 */

import * as v from "valibot";

import { customerFetch, unwrapList } from "@/lib/api";

import { getQueryClient } from "./_client";
import { useQuery, type UseQueryResult } from "./_internal/react-query";
import { parseOrThrow } from "./_validate";

// ─── Schemas ──────────────────────────────────────────────────────────────
//
// Mirror the existing TypeScript shapes in lib/messages-types.ts (and the
// inline types each call site declares) as faithfully as the runtime allows.
//
// IMPORTANT — every object schema uses `v.looseObject`, NOT `v.object`.
//
// In Valibot v1, `v.object` STRIPS unknown keys from the parsed output. That
// would silently delete any backend field we haven't enumerated here, which
// would change behavior for every caller that reads a non-canonical field.
// The whole point of this migration is to fix structural correctness without
// changing behavior, so we use `v.looseObject` to preserve every key the
// backend sends.
//
// Schemas describe the LOWER BOUND of the canonical contract: "if it's in the
// cache, at minimum these fields exist with these shapes." Backend additions
// pass through harmlessly. Callers that read fields outside this lower bound
// are still on their own for typing those fields, exactly as they were before
// this layer existed.
//
// Nullable + optional everywhere because the legacy `lib/messages-types.ts`
// types are equally permissive (every field is `?` and most are `| null`) —
// see plan §3.2 "schema-as-contract" rule.

const NullishString = v.optional(v.nullable(v.string()));
const NullishNumber = v.optional(v.nullable(v.number()));
const NullishBoolean = v.optional(v.nullable(v.boolean()));

// ─── Tickets ──────────────────────────────────────────────────────────────

const SupportTicketMessageSchema = v.looseObject({
  id: NullishNumber,
  publicId: NullishString,
  senderType: v.string(),
  body: v.string(),
  eventType: NullishString,
  attachmentKey: NullishString,
  attachmentFileName: NullishString,
  attachmentMimeType: NullishString,
  attachmentSize: NullishNumber,
  attachmentVerified: NullishBoolean,
  createdAt: v.string(),
});

// Compact summary of the most recent message — used by the tickets list to
// drive preview snippets without forcing a full message fetch. Distinct from
// SupportTicketMessageSchema because the backend strips attachment metadata
// from the summary form.
const TicketLastMessageSchema = v.looseObject({
  publicId: NullishString,
  senderType: v.string(),
  body: v.string(),
  createdAt: v.string(),
});

const SupportTicketSchema = v.looseObject({
  id: NullishNumber,
  publicId: NullishString,
  ticketNumber: NullishString,
  subject: NullishString,
  body: v.string(),
  category: NullishString,
  status: v.string(),
  orderNumber: NullishString,
  caseNumber: NullishString,
  openedBy: NullishString,
  agentName: NullishString,
  closedAt: NullishString,
  archivedAt: NullishString,
  createdAt: v.string(),
  updatedAt: NullishString,
  messages: v.optional(v.nullable(v.array(SupportTicketMessageSchema))),
  _count: v.optional(
    v.nullable(
      v.looseObject({
        messages: v.number(),
      }),
    ),
  ),
  lastMessage: v.optional(v.nullable(TicketLastMessageSchema)),
});

// The customer-facing `GET /support/tickets/:publicId` endpoint strips
// `messages` from the response — they are fetched separately via the
// `/messages` sub-route. Keep the field optional so `parseOrThrow` doesn't
// reject the payload. The screen already falls back: `ticket.messages || []`.
const SupportTicketDetailSchema = v.looseObject({
  ...SupportTicketSchema.entries,
  messages: v.optional(v.nullable(v.array(SupportTicketMessageSchema))),
});

// ─── Conversations ────────────────────────────────────────────────────────

const ConversationLastMessageSchema = v.looseObject({
  publicId: NullishString,
  senderType: v.string(),
  body: v.string(),
  createdAt: v.string(),
});

const ConversationVendorSchema = v.looseObject({
  publicId: NullishString,
  slug: NullishString,
  name: NullishString,
  logoUrl: NullishString,
});

const ConversationOrderRefSchema = v.looseObject({
  publicId: NullishString,
  orderNumber: NullishString,
  createdAt: NullishString,
  status: NullishString,
});

const ConversationSchema = v.looseObject({
  id: NullishNumber,
  publicId: NullishString,
  subject: NullishString,
  status: NullishString,
  escalatedAt: NullishString,
  archivedAt: NullishString,
  lastMessageAt: NullishString,
  unreadCount: NullishNumber,
  order: v.optional(v.nullable(ConversationOrderRefSchema)),
  vendor: v.optional(v.nullable(ConversationVendorSchema)),
  lastMessage: v.optional(v.nullable(ConversationLastMessageSchema)),
});

// In-conversation message — distinct from ConversationLastMessageSchema
// because the full message includes optional attachment metadata that the
// list summary intentionally drops.
const ConvoMessageSchema = v.looseObject({
  publicId: NullishString,
  body: v.string(),
  senderType: v.string(),
  createdAt: v.string(),
  attachment: v.optional(
    v.nullable(
      v.looseObject({
        url: NullishString,
        key: NullishString,
      }),
    ),
  ),
});

const ConversationDetailSchema = v.looseObject({
  publicId: v.string(),
  subject: v.string(),
  status: v.string(),
  messages: v.array(ConvoMessageSchema),
});

// ─── Cases ────────────────────────────────────────────────────────────────

const LinkedTicketRefSchema = v.looseObject({
  publicId: v.string(),
  ticketNumber: v.nullable(v.string()),
});

const CaseOrderRefSchema = v.looseObject({
  publicId: NullishString,
  orderNumber: NullishString,
  createdAt: NullishString,
});

const CustomerCaseItemSchema = v.looseObject({
  id: NullishNumber,
  publicId: NullishString,
  qtyAffected: v.number(),
  reasonCode: v.string(),
  orderItem: v.looseObject({
    publicId: NullishString,
    quantity: v.number(),
    productVariant: v.optional(
      v.nullable(
        v.looseObject({
          title: NullishString,
          sku: NullishString,
          product: v.optional(
            v.nullable(
              v.looseObject({
                title: NullishString,
              }),
            ),
          ),
        }),
      ),
    ),
  }),
});

const CustomerCaseSchema = v.looseObject({
  caseNumber: v.string(),
  status: v.string(),
  resolutionIntent: v.optional(v.nullable(v.string())),
  resolutionFinal: NullishString,
  resolvedAt: NullishString,
  closedAt: NullishString,
  createdAt: v.string(),
  updatedAt: v.string(),
  order: CaseOrderRefSchema,
  caseFamily: v.optional(
    v.nullable(
      v.looseObject({
        id: v.number(),
        familyNumber: v.string(),
      }),
    ),
  ),
  linkedTicketPublicId: NullishString,
  linkedTickets: v.optional(v.array(LinkedTicketRefSchema)),
  items: v.array(CustomerCaseItemSchema),
});

// `cases.detail` is a *different* shape than the list-form `CustomerCase` —
// it has `id` (not `caseNumber`), an optional `note`, optional `refund`,
// and a richer items array. Keep them as separate schemas; the runtime
// shapes are genuinely different responses.
const CustomerCaseDetailSchema = v.looseObject({
  id: v.string(),
  status: v.string(),
  resolutionIntent: v.optional(v.nullable(v.string())),
  resolutionFinal: NullishString,
  linkedTicketPublicId: NullishString,
  linkedTicketNumber: NullishString,
  linkedTickets: v.optional(v.array(LinkedTicketRefSchema)),
  createdAt: v.string(),
  updatedAt: v.string(),
  note: v.nullable(v.string()),
  order: CaseOrderRefSchema,
  items: v.array(
    v.looseObject({
      publicId: NullishString,
      quantity: v.number(),
      orderItem: v.looseObject({
        publicId: NullishString,
        quantity: v.number(),
        unitPrice: v.optional(
          v.nullable(v.union([v.string(), v.number()])),
        ),
        productVariant: v.optional(
          v.nullable(
            v.looseObject({
              title: NullishString,
              sku: NullishString,
              product: v.optional(
                v.nullable(
                  v.looseObject({
                    title: NullishString,
                  }),
                ),
              ),
            }),
          ),
        ),
      }),
    }),
  ),
  refund: v.nullable(
    v.looseObject({
      status: v.string(),
      amountCents: v.number(),
      createdAt: v.string(),
    }),
  ),
});

const CaseMessageSchema = v.looseObject({
  publicId: NullishString,
  body: v.string(),
  senderType: v.string(),
  createdAt: v.string(),
  attachmentKey: NullishString,
  attachmentFileName: NullishString,
});

// ─── List canonical shape ─────────────────────────────────────────────────
//
// All four list endpoints (`/messages/conversations`, `/support/tickets`,
// `/cases/mine?limit=50`, `/cases/mine?limit=200`) currently land in the
// cache as bare arrays — every legacy caller pipes the response through
// `unwrapList()` (lib/api.ts) which collapses both bare-array and `{ data }`
// envelope responses to a flat array. ZERO callers today read pagination
// metadata (`nextCursor`, `hasMore`) from any of these responses.
//
// Per §B.2 (behavior preservation), the canonical shape stored in the cache
// matches the runtime today: bare arrays. The fetcher unwraps the envelope
// defensively before validating, mirroring `unwrapList` exactly.
//
// IMPORTANT divergence from the orders pattern: orders.ts canonicalises the
// list as an envelope `{ data, nextCursor, hasMore }` because the orders
// screen drives a load-more UI off those fields. Messages does not have
// that consumer today. If/when one of these list endpoints starts driving
// pagination UI, switch THAT endpoint's canonical shape to an envelope and
// migrate its callers to read `.data` — exactly as we did for orders Step D.
// `v.looseObject` keeps unknown fields anyway, so the upgrade path is open.
//
// See .cursor/handoff-sealed-query-layer.md §F.9 ("Paginated endpoints —
// model the envelope") and §F.10 ("Read both legacy queryKey AND legacy URL")
// for the rules.

// ─── Inferred canonical types ────────────────────────────────────────────
//
// These are the types app code receives from the typed hooks. They are
// structurally compatible with the legacy `SupportTicket` / `Conversation` /
// `CustomerCase` / `CustomerCaseDetail` types in lib/messages-types.ts.

export type SupportTicketMessage = v.InferOutput<typeof SupportTicketMessageSchema>;
export type SupportTicket = v.InferOutput<typeof SupportTicketSchema>;
export type SupportTicketDetail = v.InferOutput<typeof SupportTicketDetailSchema>;
export type Conversation = v.InferOutput<typeof ConversationSchema>;
export type ConvoMessage = v.InferOutput<typeof ConvoMessageSchema>;
export type ConversationDetail = v.InferOutput<typeof ConversationDetailSchema>;
export type LinkedTicketRef = v.InferOutput<typeof LinkedTicketRefSchema>;
export type CustomerCaseItem = v.InferOutput<typeof CustomerCaseItemSchema>;
export type CustomerCase = v.InferOutput<typeof CustomerCaseSchema>;
export type CustomerCaseDetail = v.InferOutput<typeof CustomerCaseDetailSchema>;
export type CaseMessage = v.InferOutput<typeof CaseMessageSchema>;

// ─── Keys (private) ───────────────────────────────────────────────────────
//
// Byte-identical to the legacy `queryKeys.messages.*` factory entries. Keeping
// the same keys means the legacy `useQuery` callers and the new typed hooks
// share the cache entry during the migration window — see plan §3.1 Rule A.
//
// NOTE: detail keys do NOT wrap their id parameter with `String(...)`. The
// legacy factory accepts `string | number` and inserts the value as-is; every
// observed caller already passes a string (router params), so byte-identical
// match means accept-and-pass-through, not coerce. If a future numeric caller
// appears, it will produce a different cache entry (matching legacy behavior).

const keys = {
  all: () => ["messages"] as const,
  conversations: {
    all: () => ["messages", "conversations"] as const,
    list: () => ["messages", "conversations", "list"] as const,
    detail: (id: string | number) =>
      ["messages", "conversations", "detail", id] as const,
  },
  tickets: {
    all: () => ["messages", "tickets"] as const,
    list: () => ["messages", "tickets", "list"] as const,
    detail: (id: string | number) =>
      ["messages", "tickets", "detail", id] as const,
  },
  cases: {
    all: () => ["messages", "cases"] as const,
    list: () => ["messages", "cases", "list"] as const,
    listFlat: () => ["messages", "cases", "listFlat"] as const,
    detail: (caseNumber: string) =>
      ["messages", "cases", "detail", caseNumber] as const,
    messages: (caseNumber: string) =>
      ["messages", "cases", "messages", caseNumber] as const,
    familyMessages: (familyNumber: string) =>
      ["messages", "cases", "familyMessages", familyNumber] as const,
  },
  unread: () => ["messages", "unread"] as const,
};

// ─── Per-hook options ─────────────────────────────────────────────────────
//
// `enabled` and `refetchInterval` are TanStack Query observer options —
// they affect *when* the observer fires, never the queryFn or the cache
// key. Exposing them is safe under the single-writer invariant: the
// queryFn is identical for every caller of a given key, regardless of
// these flags.
//
// `enabled`         — gate the observer (legacy `enabled: !!id` patterns).
// `refetchInterval` — polling for live-update detail screens (30_000 in
//                     the conversation/case/ticket detail callers).
//
// IMPORTANT — these two are the ONLY observer options exposed. Anything
// that influences cache *content* (different fetch path, different shape,
// alternate writer) — `queryFn`, `select`, `initialData`, `placeholderData`,
// `queryKey` — WOULD violate the single-writer invariant. Anything that
// influences cache *policy* — `staleTime`, `gcTime` — is also OFF the
// callable surface, but for a different reason: cache policy is a
// data-consistency concern owned by the hook, not a UI concern owned by
// the caller. Two hooks under the same key MUST agree on `staleTime`, and
// the easiest way to guarantee that is to bake it into the hook itself
// (see `useCasesListFlat` below for the worked example — 5-minute policy
// hardcoded inside the hook, not a knob).
//
// If a future caller needs different cache freshness behavior for the same
// underlying data, the answer is a separate hook with a different key
// (`useCasesListFlatRealtime`, etc.), not a runtime knob.
//
// See .cursor/handoff-sealed-query-layer.md §F.12 for the full rationale.

type QueryOpts = {
  enabled?: boolean;
  /** Polling interval in ms. Pass `false` (or omit) to disable polling. */
  refetchInterval?: number | false;
};

/**
 * Cache-freshness policy for the case-linkage badges read by the orders
 * screen. The badges are not latency-critical — refreshing every 5 minutes
 * (vs the QueryClient default of 60 s) cuts background fetches by 5× while
 * still feeling fresh in the UI.
 *
 * Hard-coded inside `useCasesListFlat` and NOT exposed via QueryOpts: the
 * single-writer invariant means a key's freshness policy is a property of
 * the data, not the caller — see the §QueryOpts comment block above.
 */
const CASES_LIST_FLAT_STALE_TIME_MS = 5 * 60_000;

// ─── Internal queryFns (the single write path) ──────────────────────────
//
// Every cache-write for messages flows through these functions. They:
//   1. fetch the raw response,
//   2. normalize either-or envelope shapes (bare array vs `{ data }`,
//      bare object vs `{ data | ticket }` envelope, multi-step fetches)
//      once at write time,
//   3. validate against the canonical schema (parseOrThrow self-heals on
//      mismatch by evicting the cache entry and re-throwing),
//   4. return the canonical shape.

async function fetchConversationsList(): Promise<Conversation[]> {
  // Legacy URL drift note: the legacy callers hit `?limit=50` explicitly.
  // The cache key is `["messages", "conversations", "list"]` (no params), so
  // the URL difference is invisible to the cache. Preserving the explicit
  // `?limit=50` matches what the backend sees today; relying on
  // customerFetch's auto-append default would be a behavior change.
  const raw = await customerFetch<unknown>("/messages/conversations?limit=50");
  const list = unwrapList<unknown>(raw);
  return parseOrThrow(
    v.array(ConversationSchema),
    list,
    keys.conversations.list(),
  );
}

async function fetchConversationDetail(id: string): Promise<ConversationDetail> {
  // Two-step fetch preserved verbatim from
  // `app/account/messages/conversation/[id].tsx`: if the detail response
  // omits `messages`, fall back to the dedicated messages endpoint and
  // splice the result in. Keeping this inside the fetcher (not the call
  // site) is the whole point of the sealed layer — every consumer of the
  // conversation detail key gets the same fully-populated shape.
  const detail = await customerFetch<{
    publicId: string;
    subject: string;
    status: string;
    messages?: unknown[] | null;
  }>(`/messages/conversations/${id}`);

  let messages: unknown[];
  if (Array.isArray(detail.messages)) {
    messages = detail.messages;
  } else {
    const msgs = await customerFetch<unknown>(
      `/messages/conversations/${id}/messages`,
    );
    // The fallback endpoint may return either a bare array, `{ data }`, or
    // `{ messages }`. Mirror the legacy `msgs.data || msgs.messages || []`
    // unwrap.
    if (Array.isArray(msgs)) {
      messages = msgs;
    } else if (msgs && typeof msgs === "object") {
      const obj = msgs as { data?: unknown; messages?: unknown };
      if (Array.isArray(obj.data)) {
        messages = obj.data;
      } else if (Array.isArray(obj.messages)) {
        messages = obj.messages;
      } else {
        messages = [];
      }
    } else {
      messages = [];
    }
  }

  return parseOrThrow(
    ConversationDetailSchema,
    { ...detail, messages },
    keys.conversations.detail(id),
  );
}

async function fetchTicketsList(): Promise<SupportTicket[]> {
  const raw = await customerFetch<unknown>("/support/tickets?limit=50");
  const list = unwrapList<unknown>(raw);
  return parseOrThrow(
    v.array(SupportTicketSchema),
    list,
    keys.tickets.list(),
  );
}

async function fetchTicketDetail(id: string): Promise<SupportTicketDetail> {
  // Backend may return the bare ticket, `{ data: ticket }`, or `{ ticket }`.
  // Centralising the unwrap here means every consumer of the ticket-detail
  // key sees the same canonical shape.
  const raw = await customerFetch<unknown>(`/support/tickets/${id}`);
  const candidate =
    raw && typeof raw === "object"
      ? "data" in raw && (raw as { data?: unknown }).data !== undefined
        ? (raw as { data: unknown }).data
        : "ticket" in raw
          ? (raw as { ticket: unknown }).ticket
          : raw
      : raw;

  const ticket =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : {};

  // The customer-facing detail endpoint strips `messages` — they live on a
  // separate paginated sub-route. Fetch and splice them in, mirroring the
  // two-step approach used by `fetchConversationDetail`.
  let messages: unknown[] = [];
  if (Array.isArray(ticket.messages)) {
    messages = ticket.messages;
  } else {
    const msgsRaw = await customerFetch<unknown>(
      `/support/tickets/${id}/messages?limit=200`,
    );
    if (Array.isArray(msgsRaw)) {
      messages = msgsRaw;
    } else if (msgsRaw && typeof msgsRaw === "object") {
      const obj = msgsRaw as { data?: unknown; messages?: unknown };
      if (Array.isArray(obj.data)) {
        messages = obj.data;
      } else if (Array.isArray(obj.messages)) {
        messages = obj.messages;
      }
    }
  }

  // Backend returns messages newest-first; the screen renders chronologically
  // (oldest at top, scrolls to newest). Reverse once at write time.
  messages.reverse();

  return parseOrThrow(
    SupportTicketDetailSchema,
    { ...ticket, messages },
    keys.tickets.detail(id),
  );
}

async function fetchCasesList(): Promise<CustomerCase[]> {
  const raw = await customerFetch<unknown>("/cases/mine?limit=50");
  const list = unwrapList<unknown>(raw);
  return parseOrThrow(v.array(CustomerCaseSchema), list, keys.cases.list());
}

async function fetchCasesListFlat(): Promise<CustomerCase[]> {
  // NOTE: `cases.listFlat` and `cases.familyMessages` both hit
  // `/cases/mine?limit=200` but live under separate cache keys (because
  // their post-processing differs). That means the same backend payload is
  // fetched twice if both are mounted simultaneously — a duplication cost
  // explicitly preserved per §B.2 (behavior preservation, not optimization).
  // If/when these are unified, do it as a deliberate behavior change behind
  // a typed helper, not a drive-by inside this migration.
  const raw = await customerFetch<unknown>("/cases/mine?limit=200");
  const list = unwrapList<unknown>(raw);
  return parseOrThrow(
    v.array(CustomerCaseSchema),
    list,
    keys.cases.listFlat(),
  );
}

async function fetchCaseDetail(caseNumber: string): Promise<CustomerCaseDetail> {
  const raw = await customerFetch<unknown>(`/cases/by-id/${caseNumber}`);
  return parseOrThrow(
    CustomerCaseDetailSchema,
    raw,
    keys.cases.detail(caseNumber),
  );
}

async function fetchCaseMessages(caseNumber: string): Promise<CaseMessage[]> {
  // Legacy queryFn unwraps `{ messages }` first, then falls back to bare
  // array. Preserve that order exactly (an envelope `{ messages }` response
  // also passes `Array.isArray(data)` if `data` happened to be an array,
  // hence the precedence matters).
  const raw = await customerFetch<unknown>(
    `/cases/by-id/${caseNumber}/messages`,
  );
  let list: unknown[];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as { messages?: unknown };
    list = Array.isArray(obj.messages) ? obj.messages : [];
  } else if (Array.isArray(raw)) {
    list = raw;
  } else {
    list = [];
  }
  return parseOrThrow(
    v.array(CaseMessageSchema),
    list,
    keys.cases.messages(caseNumber),
  );
}

async function fetchFamilyCases(familyNumber: string): Promise<CustomerCase[]> {
  // Same backend endpoint as `cases.listFlat` (`/cases/mine?limit=200`) but
  // post-filtered by familyNumber. Mirrors the legacy queryFn in
  // `app/account/messages/family/[familyNumber].tsx` exactly.
  const raw = await customerFetch<unknown>("/cases/mine?limit=200");
  const list = unwrapList<unknown>(raw);
  const validated = parseOrThrow(
    v.array(CustomerCaseSchema),
    list,
    keys.cases.familyMessages(familyNumber),
  );
  return validated.filter(
    (c) => c.caseFamily?.familyNumber === familyNumber,
  );
}

// ─── Public read hooks (the only legal read path for messages) ──────────

/**
 * Read the customer's seller-conversations list. Returns `Conversation[]`
 * — bare array, sorted by the caller (the typed hook does NOT sort; existing
 * callers do their own sort/filter).
 *
 * Cache key: `["messages", "conversations", "list"]` — byte-identical to the
 * legacy `queryKeys.messages.conversations.list()`.
 */
export function useConversationsList(
  options?: QueryOpts,
): UseQueryResult<Conversation[], Error> {
  return useQuery({
    queryKey: keys.conversations.list(),
    queryFn: fetchConversationsList,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read a single conversation by public id, including its full message
 * history. The fetcher transparently performs the two-step fetch (detail,
 * then dedicated `/messages` endpoint as fallback) so callers always receive
 * a populated `messages` array.
 *
 * Cache key: `["messages", "conversations", "detail", id]` — byte-identical
 * to legacy `queryKeys.messages.conversations.detail(id)`.
 */
export function useConversationDetail(
  id: string | undefined,
  options?: QueryOpts,
): UseQueryResult<ConversationDetail, Error> {
  return useQuery({
    queryKey: keys.conversations.detail(id ?? "__none__"),
    queryFn: () => fetchConversationDetail(id!),
    enabled: (options?.enabled ?? true) && !!id,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read the customer's support-tickets list. Returns `SupportTicket[]`.
 *
 * Cache key: `["messages", "tickets", "list"]` — byte-identical to legacy
 * `queryKeys.messages.tickets.list()`.
 */
export function useTicketsList(
  options?: QueryOpts,
): UseQueryResult<SupportTicket[], Error> {
  return useQuery({
    queryKey: keys.tickets.list(),
    queryFn: fetchTicketsList,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read a single support ticket by public id, with its full message thread.
 * The fetcher centralises the `res.data ?? res.ticket ?? res` envelope
 * unwrap — every consumer sees the canonical `SupportTicketDetail` shape.
 *
 * Cache key: `["messages", "tickets", "detail", id]` — byte-identical to
 * legacy `queryKeys.messages.tickets.detail(id)`.
 */
export function useTicketDetail(
  id: string | undefined,
  options?: QueryOpts,
): UseQueryResult<SupportTicketDetail, Error> {
  return useQuery({
    queryKey: keys.tickets.detail(id ?? "__none__"),
    queryFn: () => fetchTicketDetail(id!),
    enabled: (options?.enabled ?? true) && !!id,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read the customer's cases list (limit=50 form). Returns `CustomerCase[]`.
 *
 * Cache key: `["messages", "cases", "list"]` — byte-identical to legacy
 * `queryKeys.messages.cases.list()`.
 */
export function useCasesList(
  options?: QueryOpts,
): UseQueryResult<CustomerCase[], Error> {
  return useQuery({
    queryKey: keys.cases.list(),
    queryFn: fetchCasesList,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read the customer's cases list (limit=200 form, used by the orders screen
 * to look up case linkage). Returns `CustomerCase[]`.
 *
 * Distinct cache key from `useCasesList` — both hit `/cases/mine` but the
 * legacy callers wrote to separate cache entries (`cases.list` vs
 * `cases.listFlat`). Preserved verbatim per §B.2.
 *
 * Cache policy: 5-minute `staleTime` baked in (see
 * `CASES_LIST_FLAT_STALE_TIME_MS` above). Hard-coded inside the hook
 * rather than exposed via `QueryOpts` because cache-freshness policy is a
 * property of the data + cache key, not of the caller. If a future caller
 * needs realtime semantics for the same backend payload, the answer is a
 * separate hook with its own key (e.g. `useCasesListFlatRealtime`), not a
 * staleTime knob — see the §QueryOpts comment block above for the rule.
 *
 * Cache key: `["messages", "cases", "listFlat"]` — byte-identical to legacy
 * `queryKeys.messages.cases.listFlat()`.
 */
export function useCasesListFlat(
  options?: QueryOpts,
): UseQueryResult<CustomerCase[], Error> {
  return useQuery({
    queryKey: keys.cases.listFlat(),
    queryFn: fetchCasesListFlat,
    staleTime: CASES_LIST_FLAT_STALE_TIME_MS,
    enabled: options?.enabled ?? true,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read a single case detail by case number. Returns `CustomerCaseDetail`
 * (a different shape than the list-form `CustomerCase` — id-keyed, with
 * optional note + refund + richer items array).
 *
 * Cache key: `["messages", "cases", "detail", caseNumber]` — byte-identical
 * to legacy `queryKeys.messages.cases.detail(caseNumber)`.
 */
export function useCaseDetail(
  caseNumber: string | undefined,
  options?: QueryOpts,
): UseQueryResult<CustomerCaseDetail, Error> {
  return useQuery({
    queryKey: keys.cases.detail(caseNumber ?? "__none__"),
    queryFn: () => fetchCaseDetail(caseNumber!),
    enabled: (options?.enabled ?? true) && !!caseNumber,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read the message thread for a single case. Returns `CaseMessage[]`.
 *
 * Cache key: `["messages", "cases", "messages", caseNumber]` — byte-identical
 * to legacy `queryKeys.messages.cases.messages(caseNumber)`.
 */
export function useCaseMessages(
  caseNumber: string | undefined,
  options?: QueryOpts,
): UseQueryResult<CaseMessage[], Error> {
  return useQuery({
    queryKey: keys.cases.messages(caseNumber ?? "__none__"),
    queryFn: () => fetchCaseMessages(caseNumber!),
    enabled: (options?.enabled ?? true) && !!caseNumber,
    refetchInterval: options?.refetchInterval,
  });
}

/**
 * Read every case belonging to a single case-family. The fetcher hits the
 * shared `/cases/mine?limit=200` endpoint and post-filters in memory,
 * mirroring the legacy queryFn in `app/account/messages/family/[familyNumber].tsx`.
 *
 * Cache key: `["messages", "cases", "familyMessages", familyNumber]` —
 * byte-identical to legacy `queryKeys.messages.cases.familyMessages(...)`.
 */
export function useFamilyCases(
  familyNumber: string | undefined,
  options?: QueryOpts,
): UseQueryResult<CustomerCase[], Error> {
  return useQuery({
    queryKey: keys.cases.familyMessages(familyNumber ?? "__none__"),
    queryFn: () => fetchFamilyCases(familyNumber!),
    enabled: (options?.enabled ?? true) && !!familyNumber,
    refetchInterval: options?.refetchInterval,
  });
}

// NOTE: NO `useUnreadCount` hook is exported. The `messages.unread()` key is
// invalidated by three call sites (ticket-detail, ticket-create, conversation
// detail) but is NOT read by any caller in the codebase today. Per single-
// writer hygiene, we expose only the invalidate helper — adding a read hook
// without a consumer would create a phantom writer for a key with no reader.
// When (if) a consumer is added, the read hook + schema land here at the
// same time.

// ─── Invalidation (the only legal write surface for messages) ────────────
//
// Mutations elsewhere in the app must mark messages cache entries stale via
// these helpers — never via direct `queryClient.invalidateQueries({ queryKey:
// queryKeys.messages.* })` calls. Centralising here keeps every cache write
// surface (refetch trigger, optimistic update, manual setQueryData) inside
// the single-writer module that owns the schema.
//
// Note: `invalidateQueries` is a SAFE write surface (it just marks entries
// stale and triggers a refetch through `queryFn` — which is itself defended
// by `parseOrThrow`). The dangerous write surfaces (`setQueryData`,
// `client.fetchQuery` with raw queryFn) are intentionally NOT exposed; if a
// caller ever needs them, they must be added as named, schema-validated
// helpers in this file — never executed inline.

export const invalidateMessages = {
  /**
   * Nuclear option — invalidates every entry under ['messages', ...] (every
   * sub-namespace). Used by mutations whose effect spans conversations,
   * tickets, AND cases simultaneously — e.g. cross-domain mutations after a
   * return is created (`app/orders/[id]/return.tsx` invalidates
   * `messages.cases.all()` today; this is the typed equivalent if a caller
   * needs the broader sweep).
   */
  all: () => getQueryClient().invalidateQueries({ queryKey: keys.all() }),

  conversations: {
    /** Invalidate every entry under ['messages', 'conversations', ...]. */
    all: () =>
      getQueryClient().invalidateQueries({
        queryKey: keys.conversations.all(),
      }),
    /** Invalidate the conversations list. */
    list: () =>
      getQueryClient().invalidateQueries({
        queryKey: keys.conversations.list(),
      }),
    /** Invalidate a single conversation's detail entry. */
    detail: (id: string | number) =>
      getQueryClient().invalidateQueries({
        queryKey: keys.conversations.detail(id),
      }),
  },

  tickets: {
    /** Invalidate every entry under ['messages', 'tickets', ...]. */
    all: () =>
      getQueryClient().invalidateQueries({ queryKey: keys.tickets.all() }),
    /** Invalidate the tickets list. */
    list: () =>
      getQueryClient().invalidateQueries({ queryKey: keys.tickets.list() }),
    /** Invalidate a single ticket's detail entry. */
    detail: (id: string | number) =>
      getQueryClient().invalidateQueries({
        queryKey: keys.tickets.detail(id),
      }),
  },

  cases: {
    /** Invalidate every entry under ['messages', 'cases', ...]. */
    all: () =>
      getQueryClient().invalidateQueries({ queryKey: keys.cases.all() }),
    /** Invalidate the limit=50 cases list. */
    list: () =>
      getQueryClient().invalidateQueries({ queryKey: keys.cases.list() }),
    /** Invalidate the limit=200 cases list. */
    listFlat: () =>
      getQueryClient().invalidateQueries({
        queryKey: keys.cases.listFlat(),
      }),
    /** Invalidate a single case's detail entry. */
    detail: (caseNumber: string) =>
      getQueryClient().invalidateQueries({
        queryKey: keys.cases.detail(caseNumber),
      }),
    /** Invalidate a single case's message thread. */
    messages: (caseNumber: string) =>
      getQueryClient().invalidateQueries({
        queryKey: keys.cases.messages(caseNumber),
      }),
    /** Invalidate a single case-family's grouped cases list. */
    familyMessages: (familyNumber: string) =>
      getQueryClient().invalidateQueries({
        queryKey: keys.cases.familyMessages(familyNumber),
      }),
  },

  /**
   * Invalidate the unread-count tally. No read hook consumes this key today;
   * the helper exists so legacy `invalidateQueries({ queryKey:
   * queryKeys.messages.unread() })` call sites have a typed replacement
   * during their per-call-site migration.
   */
  unread: () =>
    getQueryClient().invalidateQueries({ queryKey: keys.unread() }),
} as const;
