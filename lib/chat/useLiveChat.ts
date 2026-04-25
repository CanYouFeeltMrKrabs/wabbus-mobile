/**
 * useLiveChat — all socket + state logic for customer live chat.
 *
 * Port of the web's ChatBubble.tsx logic into a pure hook so the
 * UI layer (chat tab screen) stays declarative. Every socket event
 * name, conversation state transition, and safety guard mirrors the
 * web implementation exactly.
 *
 * Constants live in lib/constants.ts (CHAT) and are kept in sync with
 * the web app.
 */

import { useCallback, useEffect, useRef, useState, useMemo, type RefObject } from "react";
import { AppState, type AppStateStatus, type TextInput } from "react-native";
import { io, type Socket } from "socket.io-client";
import * as Sentry from "@sentry/react-native";
import { useAuth } from "@/lib/auth";
import { customerFetch, FetchError } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { PAGE_SIZE, MAX_CHAT_MESSAGES, CHAT } from "@/lib/constants";
import { showToast } from "@/lib/toast";
import { pickDocument, type PickedFile } from "@/lib/fileUpload";
import type { UiMsg, ConversationState } from "./types";
import {
  fetchCustomerSocketTicket,
  fetchGuestSocketTicket,
  SocketTicketError,
} from "./socketTicket";

function safeId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } })?.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function trimSeenIds(seen: Set<string>) {
  if (seen.size <= CHAT.MAX_SEEN_IDS) return;
  const arr = Array.from(seen);
  const keep = arr.slice(arr.length - CHAT.MAX_SEEN_IDS);
  seen.clear();
  for (const id of keep) seen.add(id);
}

/**
 * Staged attachment awaiting upload. Displayed in a preview tray
 * above the composer so the user can review / remove before sending.
 */
export type PendingAttachment = {
  id: string;
  file: PickedFile;
  /** `file://` URI for the preview thumbnail, sourced from the picker. */
  previewUri: string;
};

/**
 * Multipart upload of a customer chat image. Mirrors the web's
 * uploadCustomerChatAttachment in components/ChatBubble.tsx exactly:
 * POST /employee-chat/attachments/upload with field "file" + "conversationPublicId".
 *
 * The previous mobile implementation called /attachments/presign + /confirm,
 * which only exist on the employee-side endpoints — those calls always 404'd
 * in production, leaving mobile attachments broken.
 */
async function uploadCustomerChatAttachment(
  conversationPublicId: string,
  file: { uri: string; name: string; mimeType: string },
  signal: AbortSignal,
): Promise<{ messagePublicId: string }> {
  const form = new FormData();
  // React Native FormData accepts the { uri, name, type } shape for files.
  // The cast keeps TypeScript happy without depending on RN-only types here.
  form.append(
    "file",
    {
      uri: file.uri,
      name: file.name || "image",
      type: file.mimeType,
    } as unknown as Blob,
  );
  form.append("conversationPublicId", conversationPublicId);

  return await customerFetch<{ messagePublicId: string }>(
    "/employee-chat/attachments/upload",
    { method: "POST", body: form, headers: {}, signal },
  );
}

export type LiveChatState = {
  msgs: UiMsg[];
  input: string;
  status: "idle" | "connecting" | "connected" | "reconnecting" | "error";
  /** Diagnostic reason for the most recent connection failure (null when healthy). */
  errorReason: string | null;
  conversationState: ConversationState;
  isAgentTyping: boolean;
  startingChat: boolean;
  startCooldown: boolean;
  endingChat: boolean;
  isSpamBlocked: boolean;
  queueFull: boolean;
  canSend: boolean;
  canAttach: boolean;
  showRating: boolean;
  isGuest: boolean;
  hasToken: boolean;
  uploading: boolean;
  /** Staged images awaiting upload, shown in the preview tray. */
  pendingAttachments: PendingAttachment[];

  onInputChange: (v: string) => void;
  onInputBlur: () => void;
  onSend: () => void;
  onStartNewChat: (reason?: string, detail?: string) => void;
  onEndChat: () => void;
  onResetChat: () => void;
  onRetrySend: (msgId: string) => void;
  onSubmitRating: (rating: number, comment: string) => void;
  onDismissRating: () => void;
  /** Opens the picker and stages selected images for preview. */
  onPickAttachments: () => Promise<void>;
  /** Removes a staged image by id before it is uploaded. */
  onRemovePending: (id: string) => void;
  /**
   * Uploads all pending images (batch), then optionally sends the
   * text in the composer. Called by the combined send button.
   */
  onUploadPending: () => Promise<void>;
};

export function useLiveChat(
  t: (key: string, vars?: Record<string, string>) => string,
  composerRef?: RefObject<TextInput | null>,
): LiveChatState {
  const { isLoggedIn } = useAuth();
  const isGuest = !isLoggedIn;

  const [input, _setInput] = useState("");
  const inputRef = useRef("");
  const setInput = useCallback((v: string) => { inputRef.current = v; _setInput(v); }, []);
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [status, setStatus] = useState<LiveChatState["status"]>("idle");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [conversationState, setConversationState] = useState<ConversationState>("NONE");
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [startingChat, setStartingChat] = useState(false);
  const [startCooldown, setStartCooldown] = useState(false);
  const [endingChat, setEndingChat] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [queueFull, setQueueFull] = useState(false);
  const [guestSessionReady, setGuestSessionReady] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [shouldConnect, setShouldConnect] = useState(false);
  const [uploading, setUploading] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const conversationIdRef = useRef<number | null>(null);
  const convPublicIdRef = useRef<string | null>(null);
  const lastTypingPingRef = useRef(0);
  const typingActiveRef = useRef(false);
  const agentTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendQueueRef = useRef<Array<{ id: string; text: string; ts: number }>>([]);
  const flushIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  /**
   * Maps a real attachment publicId (returned by the upload endpoint) to the
   * local placeholder id we showed the user. When the server later echoes the
   * customer's own image via `conversation:message`, we use this map to drop
   * the duplicate cleanly instead of appending a second tile.
   */
  const ownAttachmentIdsRef = useRef<Set<string>>(new Set());

  const hasToken = isLoggedIn || guestSessionReady;
  const hasActiveConversation = conversationState === "WAITING" || conversationState === "OPEN";

  const updateConvId = useCallback((id: number | null, publicId?: string | null) => {
    setConversationId(id);
    conversationIdRef.current = id;
    if (publicId !== undefined) convPublicIdRef.current = publicId ?? null;
  }, []);

  // ── History restoration ──────────────────────────────────────

  const applyHistoryResponse = useCallback((data: {
    conversationId?: number;
    conversationPublicId?: string;
    conversationStatus?: string;
    messages?: Array<{
      id?: number | string;
      publicId?: string;
      body?: string;
      createdAt: string;
      senderType: string;
      eventType?: string;
      attachmentKey?: string | null;
      attachmentMimeType?: string | null;
    }>;
  }) => {
    if ((data.conversationId || data.conversationPublicId) && data.conversationStatus) {
      updateConvId(data.conversationId ?? null, data.conversationPublicId);
      if (data.conversationStatus === "WAITING") setConversationState("WAITING");
      else if (data.conversationStatus === "OPEN") setConversationState("OPEN");
      else if (
        data.conversationStatus === "RESOLVED" ||
        data.conversationStatus === "ABANDONED" ||
        data.conversationStatus === "EXPIRED"
      ) {
        setConversationState("CLOSED");
        setTimeout(() => setShowRating(true), 500);
      } else {
        setConversationState("NONE");
      }

      const history = data?.messages ?? [];
      if (Array.isArray(history) && history.length > 0) {
        const loaded: UiMsg[] = history.map((m) => {
          const id = String(m.publicId || m.id || safeId());
          seenIdsRef.current.add(id);
          return {
            id,
            text: m.body || "",
            ts: new Date(m.createdAt).getTime(),
            side: (m.senderType === "CUSTOMER" || m.senderType === "GUEST")
              ? "me"
              : m.senderType === "SYSTEM"
                ? "system"
                : "them",
            eventType: m.eventType as UiMsg["eventType"],
            attachmentId: m.attachmentKey ? (m.publicId || String(m.id)) : undefined,
          };
        });
        trimSeenIds(seenIdsRef.current);
        setMsgs((prev) => {
          const loadedIds = new Set(loaded.map((l) => l.id));
          const pendingLocal = prev.filter((m) => m.side === "me" && !loadedIds.has(m.id));
          return [...loaded, ...pendingLocal];
        });
      }
    } else {
      setConversationState("NONE");
      setMsgs([]);
      seenIdsRef.current.clear();
      updateConvId(null, null);
    }
  }, [updateConvId]);

  const checkExistingConversation = useCallback(async () => {
    if (!isLoggedIn) return;
    try {
      const data = await customerFetch<Parameters<typeof applyHistoryResponse>[0]>(
        `/employee-chat/customer/history?limit=${PAGE_SIZE.CHAT_HISTORY}`,
      );
      applyHistoryResponse(data);
    } catch {
      setConversationState("NONE");
      setMsgs([]);
      seenIdsRef.current.clear();
      updateConvId(null, null);
    }
  }, [isLoggedIn, updateConvId, applyHistoryResponse]);

  const checkGuestConversation = useCallback(async () => {
    if (isLoggedIn) return;
    try {
      await fetch(`${API_BASE}/employee-chat/guest/session`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const res = await fetch(
        `${API_BASE}/employee-chat/guest/history?limit=${PAGE_SIZE.CHAT_HISTORY}`,
        { credentials: "include" },
      );
      if (!res.ok) return;
      const data = await res.json();
      applyHistoryResponse(data);
      if (data.conversationPublicId && data.conversationStatus) {
        setGuestSessionReady(true);
      }
    } catch { /* guest history unavailable */ }
  }, [isLoggedIn, applyHistoryResponse]);

  // Check for existing conversation on mount
  const convoCheckIdRef = useRef(0);
  useEffect(() => {
    const checkId = ++convoCheckIdRef.current;
    (async () => {
      if (isLoggedIn) await checkExistingConversation();
      else await checkGuestConversation();
      if (checkId !== convoCheckIdRef.current) return;
    })();
  }, [isLoggedIn, checkExistingConversation, checkGuestConversation]);

  // ── Guest session provisioning ───────────────────────────────

  const provisionGuestSession = useCallback(async () => {
    if (isLoggedIn || guestSessionReady) return;
    try {
      await fetch(`${API_BASE}/employee-chat/guest/session`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      setGuestSessionReady(true);
    } catch { /* will retry on connect */ }
  }, [isLoggedIn, guestSessionReady]);

  // ── Lazy socket connect trigger ──────────────────────────────

  /** Call this to open the socket connection. */
  const connect = useCallback(() => {
    setShouldConnect(true);
    if (isGuest && !guestSessionReady) {
      provisionGuestSession();
    }
  }, [isGuest, guestSessionReady, provisionGuestSession]);

  // Auto-connect when an active conversation is detected from history
  useEffect(() => {
    if (hasActiveConversation) setShouldConnect(true);
  }, [hasActiveConversation]);

  // Re-check conversation when app returns to foreground
  useEffect(() => {
    const handler = (nextState: AppStateStatus) => {
      if (nextState === "active" && shouldConnect) {
        if (isLoggedIn) checkExistingConversation();
        else checkGuestConversation();
      }
    };
    const sub = AppState.addEventListener("change", handler);
    return () => sub.remove();
  }, [shouldConnect, isLoggedIn, checkExistingConversation, checkGuestConversation]);

  // ── Socket lifecycle ─────────────────────────────────────────

  useEffect(() => {
    if (isGuest && !guestSessionReady) {
      if (shouldConnect) setStatus("idle");
      return;
    }
    if (!shouldConnect) {
      setStatus("idle");
      return;
    }

    setStatus("connecting");

    /**
     * Mobile uses a separate Socket.IO namespace (`/support-chat-mobile`) that
     * authenticates from `handshake.auth.token` rather than from cookies. RN's
     * WebSocket polyfill drops cookies from WS upgrades, so the cookie path
     * the web client uses (`/support-chat`) is not viable here.
     *
     * The `auth` callback runs on every (re)connect attempt and mints a fresh
     * 60-second JWT ticket via the HTTP cookie jar (which RN does honour for
     * `fetch`). On failure we surface "error" status so the UI shows the
     * correct retry affordance and the user is not stuck on "connecting".
     *
     * `withCredentials` is intentionally NOT set — it is a no-op on RN's
     * polyfill and would be misleading. See `lib/chat/README.md`.
     */
    const s: Socket = io(`${API_BASE}/support-chat-mobile`, {
      transports: ["websocket"],
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
      reconnectionAttempts: 10,
      randomizationFactor: 0.5,
      auth: (cb: (data: { token: string }) => void) => {
        const ticketAbort = new AbortController();
        const ticketPromise = isGuest
          ? fetchGuestSocketTicket(ticketAbort.signal)
          : fetchCustomerSocketTicket(ticketAbort.signal);
        ticketPromise
          .then((ticket) => {
            setErrorReason(null);
            cb({ token: ticket.token });
          })
          .catch((err: unknown) => {
            const reason = err instanceof SocketTicketError
              ? `ticket-${err.status}: ${err.message}`
              : err instanceof Error
                ? err.message
                : "Unknown ticket error";
            console.error("[LiveChat] Socket ticket fetch failed:", reason);
            Sentry.addBreadcrumb({
              category: "chat.ticket",
              level: "error",
              message: reason,
              data: { isGuest, apiBase: API_BASE },
            });
            setErrorReason(reason);
            setStatus("error");
            cb({ token: "" });
          });
      },
    });
    socketRef.current = s;

    // ── connect ──
    s.on("connect", () => {
      setStatus("connected");
      setErrorReason(null);
      setQueueFull(false);

      // Flush offline queue
      const queue = [...sendQueueRef.current];
      if (queue.length === 0) return;
      sendQueueRef.current = [];
      const queuedIds = new Set(queue.map((m) => m.id));

      if (flushIntervalRef.current) clearInterval(flushIntervalRef.current);
      let i = 0;
      flushIntervalRef.current = setInterval(() => {
        if (!s.connected) {
          clearInterval(flushIntervalRef.current!);
          flushIntervalRef.current = null;
          if (i < queue.length) {
            sendQueueRef.current.push(...queue.slice(i));
            setQueueFull(sendQueueRef.current.length >= CHAT.MAX_QUEUED_MSGS);
          }
          const flushedIds = new Set(queue.slice(0, i).map((m) => m.id));
          if (flushedIds.size > 0) {
            setMsgs((prev) => prev.map((m) =>
              m.status === "queued" && flushedIds.has(m.id) ? { ...m, status: undefined } : m
            ));
          }
          return;
        }
        if (i >= queue.length) {
          clearInterval(flushIntervalRef.current!);
          flushIntervalRef.current = null;
          setMsgs((prev) => prev.map((m) => {
            if (m.status !== "queued") return m;
            return queuedIds.has(m.id) ? { ...m, status: undefined } : { ...m, status: "failed" };
          }));
          return;
        }
        s.emit(isGuest ? "guest:message" : "message:send", {
          conversationPublicId: convPublicIdRef.current,
          body: queue[i].text,
        });
        i++;
      }, CHAT.FLUSH_PACE_MS);
    });

    s.on("disconnect", () => setStatus("idle"));

    s.on("connect_error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[LiveChat] connect_error:", msg);
      Sentry.addBreadcrumb({
        category: "chat.socket",
        level: "error",
        message: `connect_error: ${msg}`,
        data: { apiBase: API_BASE, namespace: "/support-chat-mobile" },
      });
      setErrorReason((prev) => prev || msg);
      setStatus("error");
    });

    s.on("chat:error", (e: unknown) => {
      const code = (e as { code?: string })?.code;
      const message = (e as { message?: string })?.message;
      console.error("[LiveChat] chat:error:", code, message);
      Sentry.addBreadcrumb({
        category: "chat.protocol",
        level: "warning",
        message: `chat:error ${code}: ${message}`,
      });
      if (code === "RATE_LIMITED" || code === "CONNECTION_RATE_LIMITED") return;
      if (code === "NOT_OPEN" || code === "NO_CONVERSATION") {
        setConversationState("CLOSED");
        setMsgs((prev) => [...prev, {
          id: safeId(), text: "", ts: Date.now(),
          side: "system" as const, eventType: "CLOSED" as const,
        }].slice(-MAX_CHAT_MESSAGES));
        return;
      }
      setErrorReason(message || code || "Server error");
      setStatus("error");
    });

    s.on("chat:rate_limited", () => {
      setConversationState("NONE");
      setStartingChat(false);
      showToast(t("chat.pleaseTryAgainLater"), "error");
    });

    /**
     * Backend emits `message:send_error` when an inbound `message:send` /
     * `guest:message` could not be persisted. Mark any in-flight optimistic
     * customer message as failed so the user can retry instead of silently
     * losing it.
     */
    s.on("message:send_error", () => {
      showToast(t("chat.messageSendFailed"), "error");
      setMsgs((prev) => {
        for (let i = prev.length - 1; i >= 0; i--) {
          const m = prev[i];
          if (m.side !== "me") break;
          if (!m.status && !m.attachmentId) {
            const next = [...prev];
            next[i] = { ...m, status: "failed" };
            return next;
          }
        }
        return prev;
      });
    });

    // ── Reconnection ──
    s.io.on("reconnect_attempt", () => setStatus("reconnecting"));
    s.io.on("reconnect", () => {
      setStatus("connected");
      if (isGuest) checkGuestConversation();
      else checkExistingConversation();
    });
    s.io.on("reconnect_failed", () => {
      console.error("[LiveChat] reconnect_failed — all retries exhausted");
      setErrorReason("Reconnection failed");
      setStatus("error");
    });

    // ── Conversation lifecycle ──
    s.on("conversation:queued", (data: { conversationPublicId?: string; conversationId?: number }) => {
      updateConvId(data.conversationId ?? null, data.conversationPublicId);
      setConversationState("WAITING");
    });

    s.on("conversation:active", (data: {
      conversationPublicId?: string;
      conversationId?: number;
      agentName?: string;
      isReassignment?: boolean;
    }) => {
      const matchesCurrent =
        (data.conversationPublicId && data.conversationPublicId === convPublicIdRef.current) ||
        (data.conversationId && data.conversationId === conversationIdRef.current) ||
        (!convPublicIdRef.current && !conversationIdRef.current);
      if (matchesCurrent) {
        updateConvId(
          data.conversationId ?? conversationIdRef.current,
          data.conversationPublicId ?? convPublicIdRef.current,
        );
        setConversationState("OPEN");
        if (!data.isReassignment) {
          const name = data.agentName || undefined;
          setMsgs((prev) => {
            if (name && prev.some((m) => m.eventType === "AGENT_JOINED" && m.agentName === name)) return prev;
            return [...prev, {
              id: safeId(), text: "", ts: Date.now(),
              side: "system" as const, eventType: "AGENT_JOINED" as const, agentName: name,
            }].slice(-MAX_CHAT_MESSAGES);
          });
        }
      }
    });

    s.on("conversation:resolved", (data: {
      conversationPublicId?: string;
      conversationId?: number;
    }) => {
      const matches =
        (data.conversationPublicId && data.conversationPublicId === convPublicIdRef.current) ||
        (data.conversationId && data.conversationId === conversationIdRef.current);
      if (matches) {
        setConversationState("CLOSED");
        setTimeout(() => setShowRating(true), 500);
      }
    });

    s.on("chat:rated", () => setShowRating(false));

    s.on("conversation:expired", (data: {
      conversationPublicId?: string;
      conversationId?: number;
      message?: string;
    }) => {
      const matches =
        (data.conversationPublicId && data.conversationPublicId === convPublicIdRef.current) ||
        (data.conversationId && data.conversationId === conversationIdRef.current);
      if (matches) {
        if (data.message) {
          setMsgs((prev) => [...prev, {
            id: safeId(), text: data.message!, ts: Date.now(), side: "system" as const,
          }].slice(-MAX_CHAT_MESSAGES));
        }
        setConversationState("CLOSED");
      }
    });

    s.on("conversation:ended", (data: {
      conversationPublicId?: string;
      conversationId?: number;
      message?: string;
    }) => {
      const matches =
        (data.conversationPublicId && data.conversationPublicId === convPublicIdRef.current) ||
        (data.conversationId && data.conversationId === conversationIdRef.current);
      if (matches) {
        if (data.message) {
          setMsgs((prev) => [...prev, {
            id: safeId(), text: data.message!, ts: Date.now(), side: "system" as const,
          }].slice(-MAX_CHAT_MESSAGES));
        }
        setConversationState("CLOSED");
        setTimeout(() => setShowRating(true), 500);
      }
    });

    // ── Messages ──
    s.on("conversation:message", (msg: {
      id?: number | string;
      publicId?: string;
      body?: string;
      createdAt?: string;
      senderType?: string;
      attachmentKey?: string | null;
    }) => {
      const id = msg?.id ? String(msg.id) : safeId();
      if (seenIdsRef.current.has(id)) return;

      const senderType = msg?.senderType;
      const publicId = msg?.publicId ? String(msg.publicId) : "";

      // Customer/guest echo of an attachment they just uploaded — we already
      // have the local placeholder, just mark seen and skip to avoid a dupe.
      if (
        (senderType === "CUSTOMER" || senderType === "GUEST") &&
        publicId &&
        ownAttachmentIdsRef.current.has(publicId)
      ) {
        ownAttachmentIdsRef.current.delete(publicId);
        seenIdsRef.current.add(id);
        trimSeenIds(seenIdsRef.current);
        return;
      }

      // Other own-message echoes — already rendered optimistically.
      if (senderType === "CUSTOMER" || senderType === "GUEST") {
        seenIdsRef.current.add(id);
        trimSeenIds(seenIdsRef.current);
        return;
      }

      seenIdsRef.current.add(id);
      trimSeenIds(seenIdsRef.current);

      const side: UiMsg["side"] = senderType === "SYSTEM" ? "system" : "them";
      const text = msg?.body ? String(msg.body) : "";
      const ts = msg?.createdAt ? new Date(msg.createdAt).getTime() : Date.now();
      const attachmentId = msg?.attachmentKey ? (publicId || String(msg.id)) : undefined;

      setMsgs((prev) => [...prev, { id, text, ts, side, attachmentId }].slice(-MAX_CHAT_MESSAGES));

      if (senderType === "EMPLOYEE") {
        setConversationState("OPEN");
        setIsAgentTyping(false);
        if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
      }
    });

    s.on("system:warning", (data: { message?: string }) => {
      showToast(data?.message || t("chat.actionNotAllowed"), "error");
    });

    // ── Typing (correct event name: conversation:typing) ──
    s.on("conversation:typing", (data: { typing?: boolean }) => {
      if (data?.typing === false) {
        setIsAgentTyping(false);
        if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
      } else {
        setIsAgentTyping(true);
        if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
        agentTypingTimeoutRef.current = setTimeout(() => setIsAgentTyping(false), CHAT.TYPING_TTL_MS);
      }
    });

    return () => {
      try {
        s.removeAllListeners();
        s.io.removeAllListeners();
        s.disconnect();
      } catch { /* cleanup */ }
      if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
      if (flushIntervalRef.current) {
        clearInterval(flushIntervalRef.current);
        flushIntervalRef.current = null;
      }
      uploadAbortRef.current?.abort();
      uploadAbortRef.current = null;
      socketRef.current = null;
      setStatus("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, isGuest, guestSessionReady, shouldConnect, checkExistingConversation, checkGuestConversation, updateConvId]);

  // Auto-connect on mount (tab is always "open" on mobile)
  useEffect(() => { connect(); }, [connect]);

  // ── Start new chat ──────────────────────────────────────────

  const onStartNewChat = useCallback((reason?: string, detail?: string) => {
    if (startingChat || startCooldown) return;
    const s = socketRef.current;
    if (!s || !s.connected) return;

    setStartingChat(true);
    setMsgs([]);
    seenIdsRef.current.clear();
    sendQueueRef.current = [];
    setQueueFull(false);

    try {
      const payload: Record<string, string> = {};
      if (reason) payload.reason = reason;
      if (detail) payload.detail = detail;
      s.emit(isGuest ? "guest:start_chat" : "chat:start", { ...payload, reasonDetail: detail });
      setConversationState("WAITING");
      setMsgs((prev) => [...prev, {
        id: safeId(), text: t("chat.thanksReachingOut"), ts: Date.now(), side: "system" as const,
      }].slice(-MAX_CHAT_MESSAGES));

      setStartCooldown(true);
      if (startCooldownTimerRef.current) clearTimeout(startCooldownTimerRef.current);
      startCooldownTimerRef.current = setTimeout(() => setStartCooldown(false), CHAT.START_COOLDOWN_MS);
    } finally {
      setStartingChat(false);
    }
  }, [startingChat, startCooldown, isGuest, t]);

  // ── End chat ─────────────────────────────────────────────────

  const onEndChat = useCallback(() => {
    if (endingChat) return;
    setEndingChat(true);
    uploadAbortRef.current?.abort();
    uploadAbortRef.current = null;
    try {
      const s = socketRef.current;
      if (s?.connected) {
        s.emit(isGuest ? "guest:close" : "chat:close", {
          conversationPublicId: convPublicIdRef.current,
        });
      }
      setConversationState("CLOSED");
      setMsgs((prev) => [...prev, {
        id: safeId(), text: "", ts: Date.now(),
        side: "system" as const, eventType: "CLOSED" as const,
      }].slice(-MAX_CHAT_MESSAGES));
      setTimeout(() => setShowRating(true), 500);
    } finally {
      setEndingChat(false);
    }
  }, [endingChat, isGuest]);

  // ── Reset chat ───────────────────────────────────────────────

  const onResetChat = useCallback(() => {
    setConversationState("NONE");
    updateConvId(null, null);
    setMsgs([]);
    seenIdsRef.current.clear();
    sendQueueRef.current = [];
    setQueueFull(false);
    setInput("");
    setShowRating(false);
    ownAttachmentIdsRef.current.clear();
    setPendingAttachments([]);
  }, [updateConvId, setInput]);

  // ── Rating ───────────────────────────────────────────────────

  const onSubmitRating = useCallback((rating: number, comment: string) => {
    const s = socketRef.current;
    if (!s?.connected) return;
    s.emit(isGuest ? "guest:rate" : "chat:rate", {
      conversationPublicId: convPublicIdRef.current,
      rating,
      feedback: comment,
    });
  }, [isGuest]);

  const onDismissRating = useCallback(() => setShowRating(false), []);

  // ── Typing ───────────────────────────────────────────────────

  const emitTypingPing = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingPingRef.current < CHAT.TYPING_THROTTLE_MS) return;
    lastTypingPingRef.current = now;
    typingActiveRef.current = true;
    const s = socketRef.current;
    if (s?.connected) {
      s.emit(isGuest ? "guest:typing_ping" : "typing:start", {
        conversationPublicId: convPublicIdRef.current,
      });
    }
  }, [isGuest]);

  /**
   * Emits typing:stop so the agent's UI clears its "customer typing"
   * indicator promptly. Called when the input is cleared, the user blurs
   * the composer, or the message is sent. Guests have no inverse event
   * server-side, so we throttle by typingActiveRef to avoid noise.
   */
  const emitTypingStop = useCallback(() => {
    if (!typingActiveRef.current) return;
    typingActiveRef.current = false;
    lastTypingPingRef.current = 0;
    if (isGuest) return;
    const s = socketRef.current;
    if (s?.connected) {
      s.emit("typing:stop", { conversationPublicId: convPublicIdRef.current });
    }
  }, [isGuest]);

  const clearingInputRef = useRef(false);

  const onInputChange = useCallback((value: string) => {
    if (clearingInputRef.current) return;
    setInput(value.slice(0, CHAT.MAX_MSG_LENGTH));
    if (value.trim()) emitTypingPing();
    else emitTypingStop();
  }, [emitTypingPing, emitTypingStop, setInput]);

  const onInputBlur = useCallback(() => {
    emitTypingStop();
  }, [emitTypingStop]);

  // ── Spam protection ──────────────────────────────────────────

  const outstandingCount = useMemo(() => {
    let count = 0;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].side === "me") count++;
      else if (msgs[i].side === "them") break;
    }
    return count;
  }, [msgs]);

  const isSpamBlocked = outstandingCount >= CHAT.MAX_OUTSTANDING_MSGS;

  // ── Send ─────────────────────────────────────────────────────

  const onSend = useCallback(() => {
    const text = inputRef.current.trim().slice(0, CHAT.MAX_MSG_LENGTH);
    if (!text || isSpamBlocked) return;

    const s = socketRef.current;
    const id = safeId();
    const ts = Date.now();

    seenIdsRef.current.add(id);
    trimSeenIds(seenIdsRef.current);

    clearingInputRef.current = true;
    composerRef?.current?.blur();
    setInput("");
    composerRef?.current?.clear();
    setTimeout(() => { clearingInputRef.current = false; }, 150);

    emitTypingStop();

    if (!s || !s.connected) {
      const isOverflow = sendQueueRef.current.length >= CHAT.MAX_QUEUED_MSGS;
      if (!isOverflow) sendQueueRef.current.push({ id, text, ts });
      setMsgs((prev) => [...prev, {
        id, text, ts, side: "me" as const,
        status: isOverflow ? "overflow" as const : "queued" as const,
      }].slice(-MAX_CHAT_MESSAGES));
      if (isOverflow) setQueueFull(true);
      return;
    }

    setMsgs((prev) => [...prev, { id, text, ts, side: "me" as const }].slice(-MAX_CHAT_MESSAGES));
    if (conversationState === "NONE") setConversationState("WAITING");
    s.emit(isGuest ? "guest:message" : "message:send", {
      conversationPublicId: convPublicIdRef.current,
      body: text,
    });
  }, [isSpamBlocked, isGuest, conversationState, setInput, composerRef, emitTypingStop]);

  // ── Retry failed ─────────────────────────────────────────────

  const onRetrySend = useCallback((msgId: string) => {
    const s = socketRef.current;
    if (!s || !s.connected) return;

    setMsgs((prev) => {
      const msg = prev.find((m) => m.id === msgId);
      if (!msg || msg.side !== "me") return prev;
      queueMicrotask(() => {
        s.emit(isGuest ? "guest:message" : "message:send", {
          conversationPublicId: convPublicIdRef.current,
          body: msg.text,
        });
      });
      return prev.map((m) => (m.id === msgId ? { ...m, status: undefined } : m));
    });
  }, [isGuest]);

  // ── Attachments (batch, with pending preview tray) ──────

  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  const canAttach = !isGuest && isLoggedIn &&
    hasActiveConversation &&
    status === "connected";

  /**
   * Opens the document picker and stages valid images.
   * Does NOT upload — the user reviews the preview tray first.
   */
  const onPickAttachments = useCallback(async () => {
    if (isGuest || uploading) return;

    const remaining = CHAT.MAX_PENDING_IMAGES - pendingAttachments.length;
    if (remaining <= 0) {
      showToast(t("chat.maxImagesReached"), "error");
      return;
    }

    const file = await pickDocument({ type: [...CHAT.ALLOWED_IMAGE_TYPES] });
    if (!file) return;

    if (!(CHAT.ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimeType)) {
      showToast(t("chat.onlyJpegPngWebp"), "error");
      return;
    }
    if (file.size > CHAT.MAX_IMAGE_SIZE) {
      showToast(t("chat.fileTooLarge"), "error");
      return;
    }

    setPendingAttachments((prev) => [
      ...prev,
      { id: safeId(), file, previewUri: file.uri },
    ]);
  }, [isGuest, uploading, pendingAttachments.length, t]);

  /** Remove a staged image before it is uploaded. */
  const onRemovePending = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /**
   * Batch-upload all pending images, then optionally send the text
   * message in the composer. Mirrors the web's `handleCombinedSend`.
   */
  const onUploadPending = useCallback(async () => {
    const hasText = !!inputRef.current.trim();
    const hasImages = pendingAttachments.length > 0;
    if (!hasImages && !hasText) return;
    if (!convPublicIdRef.current || isGuest) return;

    // Grab the current pending list and clear the tray immediately
    const toUpload = [...pendingAttachments];
    setPendingAttachments([]);

    if (hasImages) {
      uploadAbortRef.current?.abort();
      const ac = new AbortController();
      uploadAbortRef.current = ac;
      const { signal } = ac;

      setUploading(true);

      // Create placeholder messages for each image
      const placeholderIds = toUpload.map(() => safeId());
      setMsgs((prev) => [
        ...prev,
        ...placeholderIds.map((pid) => ({
          id: pid,
          text: "",
          ts: Date.now(),
          side: "me" as const,
          uploadProgress: "uploading" as const,
        })),
      ].slice(-MAX_CHAT_MESSAGES));

      let failCount = 0;

      for (let i = 0; i < toUpload.length; i++) {
        if (signal.aborted) break;
        const att = toUpload[i];
        const placeholderId = placeholderIds[i];

        try {
          const result = await uploadCustomerChatAttachment(
            convPublicIdRef.current!,
            att.file,
            signal,
          );

          const realId = result.messagePublicId;
          ownAttachmentIdsRef.current.add(realId);
          seenIdsRef.current.add(realId);
          trimSeenIds(seenIdsRef.current);

          setMsgs((prev) => prev.map((m) =>
            m.id === placeholderId
              ? { ...m, id: realId, attachmentId: realId, uploadProgress: undefined }
              : m
          ));
        } catch (err: unknown) {
          if (signal.aborted) break;
          failCount++;
          const errMsg = err instanceof Error ? err.message : String((err as { message?: string })?.message || "");
          const errStatus = err instanceof FetchError ? err.status : 0;
          const isConvGone = errStatus === 403 || /no active conversation/i.test(errMsg);
          if (isConvGone) {
            const remainingIds = new Set(placeholderIds.slice(i));
            setMsgs((prev) => [
              ...prev.filter((m) => !remainingIds.has(m.id)),
              { id: safeId(), text: "", ts: Date.now(), side: "system" as const, eventType: "CLOSED" as const },
            ].slice(-MAX_CHAT_MESSAGES));
            setConversationState("CLOSED");
            break;
          }
          setMsgs((prev) => prev.map((m) =>
            m.id === placeholderId ? { ...m, uploadProgress: "error" } : m
          ));
        }
      }

      if (!signal.aborted) {
        setUploading(false);
        if (failCount > 0 && failCount < toUpload.length) {
          showToast(t("chat.someImagesFailed"), "error");
        } else if (failCount === toUpload.length) {
          showToast(t("chat.failedToUpload"), "error");
        }
      }
    }

    // After images are uploaded, send any text in the composer
    if (hasText) {
      queueMicrotask(() => {
        const text = inputRef.current.trim().slice(0, CHAT.MAX_MSG_LENGTH);
        if (!text || isSpamBlocked) return;

        const s = socketRef.current;
        const id = safeId();
        const ts = Date.now();

        seenIdsRef.current.add(id);
        trimSeenIds(seenIdsRef.current);

        clearingInputRef.current = true;
        composerRef?.current?.blur();
        setInput("");
        composerRef?.current?.clear();
        setTimeout(() => { clearingInputRef.current = false; }, 150);

        emitTypingStop();

        if (!s || !s.connected) {
          const isOverflow = sendQueueRef.current.length >= CHAT.MAX_QUEUED_MSGS;
          if (!isOverflow) sendQueueRef.current.push({ id, text, ts });
          setMsgs((prev) => [...prev, {
            id, text, ts, side: "me" as const,
            status: isOverflow ? "overflow" as const : "queued" as const,
          }].slice(-MAX_CHAT_MESSAGES));
          if (isOverflow) setQueueFull(true);
          return;
        }

        setMsgs((prev) => [...prev, { id, text, ts, side: "me" as const }].slice(-MAX_CHAT_MESSAGES));
        if (conversationState === "NONE") setConversationState("WAITING");
        s.emit(isGuest ? "guest:message" : "message:send", {
          conversationPublicId: convPublicIdRef.current,
          body: text,
        });
      });
    }
  }, [pendingAttachments, isGuest, isSpamBlocked, conversationState, setInput, composerRef, emitTypingStop, t]);

  // ── Derived state ────────────────────────────────────────────

  const canSend =
    hasToken &&
    !!input.trim() &&
    !isSpamBlocked &&
    (isGuest
      ? (status === "connected" && conversationState === "OPEN")
      : (status === "connected" || conversationState === "WAITING" || conversationState === "OPEN"));

  return {
    msgs,
    input,
    status,
    errorReason,
    conversationState,
    isAgentTyping,
    startingChat,
    startCooldown,
    endingChat,
    isSpamBlocked,
    queueFull,
    canSend,
    canAttach,
    showRating,
    isGuest,
    hasToken,
    uploading,
    pendingAttachments,
    onInputChange,
    onInputBlur,
    onSend,
    onStartNewChat,
    onEndChat,
    onResetChat,
    onRetrySend,
    onSubmitRating,
    onDismissRating,
    onPickAttachments,
    onRemovePending,
    onUploadPending,
  };
}
