/**
 * Mobile-only socket ticket fetcher.
 *
 * React Native's WebSocket polyfill drops cookies from the WS upgrade
 * request. The web client (`Wabbus/src/components/ChatBubble.tsx`) does
 * NOT need this module — browsers attach cookies natively to WS upgrades.
 *
 * This calls `POST /mobile-chat/{customer,guest}/socket-ticket` over plain
 * `fetch`. RN's HTTP layer DOES attach cookies to `fetch`, so the
 * `customer_access` / `guest_chat_session` cookie reaches the backend and
 * the controller can mint a short-lived JWT ticket. The hook then attaches
 * that ticket to `socket.handshake.auth.token`.
 *
 * The backend ticket payload carries a `purpose` claim
 * (`'support-chat-mobile-socket'`) that prevents replay against any other
 * endpoint that happens to verify a `CUSTOMER_JWT_SECRET` token. See
 * `wabbus-backend/src/mobile-chat/socket-ticket.utils.ts`.
 */

import { customerFetch, FetchError } from "@/lib/api";
import { API_BASE } from "@/lib/config";

export interface SocketTicket {
  token: string;
  /** Seconds until the ticket expires server-side. Refresh BEFORE this. */
  expiresIn: number;
}

export class SocketTicketError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SocketTicketError";
    this.status = status;
  }
}

/**
 * Mints a customer ticket. The customer cookie jar must already be
 * established (login succeeded). Throws `SocketTicketError` on transport
 * or auth failure so the caller can surface a typed reconnect path.
 */
export async function fetchCustomerSocketTicket(
  signal?: AbortSignal,
): Promise<SocketTicket> {
  try {
    return await customerFetch<SocketTicket>(
      "/mobile-chat/customer/socket-ticket",
      { method: "POST", signal },
    );
  } catch (err) {
    if (err instanceof FetchError) {
      throw new SocketTicketError(
        err.message || "Failed to mint customer socket ticket",
        err.status,
      );
    }
    throw new SocketTicketError(
      err instanceof Error ? err.message : "Failed to mint customer socket ticket",
      0,
    );
  }
}

/**
 * Mints a guest ticket. The `guest_chat_session` cookie must already be
 * present (provisioned via `POST /employee-chat/guest/session`). Uses
 * raw `fetch` rather than `customerFetch` to avoid the latter's 401
 * refresh hook — guest sessions cannot be refreshed.
 */
export async function fetchGuestSocketTicket(
  signal?: AbortSignal,
): Promise<SocketTicket> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/mobile-chat/guest/socket-ticket`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      signal,
    });
  } catch (err) {
    throw new SocketTicketError(
      err instanceof Error ? err.message : "Network error fetching guest ticket",
      0,
    );
  }

  if (!res.ok) {
    let message = `Guest ticket request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) message = body.message;
    } catch {
      /* response was not JSON; keep default message */
    }
    throw new SocketTicketError(message, res.status);
  }

  const body = (await res.json()) as Partial<SocketTicket>;
  if (!body || typeof body.token !== "string" || typeof body.expiresIn !== "number") {
    throw new SocketTicketError("Malformed guest ticket response", 0);
  }
  return { token: body.token, expiresIn: body.expiresIn };
}
