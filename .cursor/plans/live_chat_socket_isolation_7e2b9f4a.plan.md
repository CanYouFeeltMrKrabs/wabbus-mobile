# Mobile Live Chat — Socket Isolation Plan (`7e2b9f4a`)

> **Status:** PLANNED — awaiting execution.
> **Scope:** `wabbus-mobile/` (client) and `wabbus-backend/src/mobile-chat/` (new module) + minimal append-only edit to `wabbus-backend/src/employee-chat/support-chat.gateway.ts`.
> **Out of scope:** `Wabbus/src/` (web frontend), `wabbus-vendor-frontend/`, `wabbus-admin/`, `wabbus-support/`. None of these directories will be opened during execution.

---

## §0 — Problem statement and non-negotiables

### Problem

`wabbus-mobile/lib/chat/useLiveChat.ts` opens `io(${API_BASE}/support-chat, { transports: ["websocket","polling"], withCredentials: true })`. The backend gateway at `wabbus-backend/src/employee-chat/support-chat.gateway.ts` authenticates exclusively from the cookie header on the WebSocket handshake.

React Native's WebSocket polyfill does not attach cookies from the native cookie jar (NSHTTPCookieStorage / OkHttp `CookieManager`) to the WS upgrade. `withCredentials: true` is a no-op in RN. Result: gateway sees no cookie → `socket.disconnect(true)` → mobile shows "Connection error". Web works only because browsers attach cookies to WS upgrades automatically.

### Non-negotiables

1. **Web (`/wabbus`) live chat behavior must not change.** Verifiable by reading `git diff` on `support-chat.gateway.ts` and confirming all edits are append-only after preserved original lines.
2. **No "comments-as-separation."** The new mobile path is structurally separated across filesystem, NestJS module, namespace, route prefix, auth method, in-memory state, and handler logic.
3. **No shortcuts.** Production-grade ticket auth (short-lived JWT, purpose-tagged, refreshed every reconnect via socket.io v4 `auth` callback). Polling-first transport reordering is rejected as fragile.
4. **No drift between mobile and web message protocol.** The mobile gateway's handlers MUST emit the exact same socket events with the exact same payload shapes as the web gateway. Verified by handler-by-handler review during execution.
5. **Mobile attachment uploads stay on the existing HTTP endpoint** (`POST /employee-chat/attachments/upload`). HTTP `fetch` on RN uses the native cookie jar, so cookie auth works there. No need to fork the attachment surface.

---

## §1 — Architecture overview

### Four-dimensional separation

| Dimension                    | Web (`/wabbus`)                                              | Mobile                                                       |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| **Filesystem (backend)**     | `wabbus-backend/src/employee-chat/`                          | `wabbus-backend/src/mobile-chat/` (sibling, parallel)        |
| **Filesystem (client)**      | `Wabbus/src/components/ChatBubble.tsx`                       | `wabbus-mobile/app/(tabs)/chat.tsx` + `wabbus-mobile/lib/chat/` |
| **NestJS module**            | `EmployeeChatModule`                                         | `MobileChatModule` (independent provider graph, own DI tree) |
| **Socket.io namespace**      | `/support-chat`                                              | `/support-chat-mobile`                                       |
| **Connection auth**          | Cookies (`handshake.headers.cookie` → `CUSTOMER_ACCESS_COOKIE` / `GUEST_CHAT_SESSION_COOKIE`) | Ticket JWT (`handshake.auth.token`). Cookies never read.     |
| **HTTP route prefix (NEW)**  | n/a — auth uses existing cookie-issuing endpoints            | `/mobile-chat/customer/socket-ticket`, `/mobile-chat/guest/socket-ticket` |
| **In-memory state**          | `socketToCustomer`, `socketTimers`, `rateLimits`, `chatCreationLimits`, `disconnectGraceTimers` on `SupportChatGateway` | OWN copies on `SupportChatMobileGateway` + `MobileChatRateLimitService`. Independent counters per §0 decision 3. |
| **Handler logic**            | `@SubscribeMessage` methods on `SupportChatGateway` (lines 361–1113) | `@SubscribeMessage` methods on `SupportChatMobileGateway`, delegating to `MobileChatProtocolService` (parallel implementation, same wire protocol) |
| **Cross-direction fan-out**  | Web emits via its own `server.to(room).emit(…)` (unchanged)  | Mobile broadcaster subscribes to a one-way `ChatEventBus` and emits on `/support-chat-mobile` rooms |

A grep for `support-chat-mobile` returns only mobile files. A grep for `MobileChat*` returns only the new module. The string `mobile` does not appear in `support-chat.gateway.ts`. Web and mobile share **zero** mutable state.

### The single touch point (and why it's safe)

The only data that must flow web → mobile is server-emitted events to a customer/guest who is connected via mobile (e.g., agent reply, conversation status change, typing indicator from agent). Today, `supportChatGw.emitToCustomer/emitToGuest/emitToConversation` are called from the following places:

- `routing/chat-router.service.ts` — 6 callsites
- `routing/expiry-sweep.service.ts` — 4 callsites
- `livechat-attachment.controller.ts` — 1 callsite
- `employee-chat.controller.ts` — 7 callsites
- `employee-chat.gateway.ts` — 2 callsites
- `support-chat.gateway.ts` itself — internal

Hooking the bus at the four `emit*` methods themselves means every existing caller automatically fans out to mobile sockets with zero changes to those callers. This is the smallest possible diff with the largest possible coverage.

The exact diff to `support-chat.gateway.ts` is shown in §3.1 — three appended lines plus one optional constructor injection. Original lines unchanged.

---

## §2 — New files (12 total)

All files are clearly labeled with `mobile` in the filename or live under a `mobile-chat/` directory.

### Backend — `wabbus-backend/src/mobile-chat/` (new module, 8 files)

#### 2.1 `mobile-chat.module.ts`

Nest module declaration. Imports `PrismaModule`, `RedisModule`, `AuthModule`, `EmployeeChatModule` (for `ChatRouterService`, `EmployeeChatService`, `TranslationService` re-use), `ChatEventsModule` (for the bus), `ConfigModule`, `ThrottlerModule` for rate-limited ticket endpoints.

Providers:

- `SupportChatMobileGateway`
- `MobileChatProtocolService`
- `MobileChatRateLimitService`
- `MobileChatBroadcasterService`
- `SocketTicketService` (wraps `socket-ticket.utils.ts` with `ConfigService` for the secret)

Controllers:

- `MobileChatAuthController`

Exports: `SupportChatMobileGateway` (for diagnostics), `SocketTicketService` (for testing).

#### 2.2 `support-chat-mobile.gateway.ts`

```ts
@WebSocketGateway({ namespace: '/support-chat-mobile', cors: gatewayCorsConfig })
export class SupportChatMobileGateway implements OnGatewayConnection, OnGatewayDisconnect { … }
```

Class-level JSDoc:

> **React Native client only.** Authenticates via `handshake.auth.token` (short-lived ticket JWT). Cookies are never read here. Browser clients use `wabbus-backend/src/employee-chat/support-chat.gateway.ts` instead. See `wabbus-backend/src/mobile-chat/README.md`.

Owns its own state (no shared maps with web gateway):

- `private socketToCustomer = new Map<string, number>()`
- `private socketTimers = new Map<string, NodeJS.Timeout>()`
- `private disconnectGraceTimers = new Map<string, NodeJS.Timeout>()`
- Rate limiting delegated to `MobileChatRateLimitService` (independent from web per §0.3).

Implements:

- `handleConnection(socket)` — reads `socket.handshake.auth?.token`, calls `SocketTicketService.verify(token)`, branches on `kind` (`'customer'` | `'guest'`), then runs the connection setup (room joins, presence notification via `EmployeeChatService.notifyAgentOfCustomerPresence` — re-using the existing service, NOT duplicating it). If no ticket or invalid → `socket.disconnect(true)`.
- `handleDisconnect(socket)` — mirrors the web gateway's grace-timer + cleanup behavior using mobile's own state maps. Calls into shared services (`ChatRouterService`, `EmployeeChatService`) for any cross-cutting effects.
- `@SubscribeMessage('chat:start' | 'message:send' | 'chat:close' | 'typing:start' | 'typing:stop' | 'chat:rate' | 'guest:start_chat' | 'guest:message' | 'guest:typing_ping' | 'guest:close' | 'guest:rate')` — eleven thin handlers, each a one-liner that calls into `MobileChatProtocolService.<handlerName>(socket, body)`. Handler bodies live in the protocol service (§2.3) so the gateway file stays scannable.

Public emit methods (used by `MobileChatBroadcasterService` only):

- `emitToCustomer(customerId, event, data)` — `this.server.to('customer:' + customerId).emit(event, data)`. Note: this `server` is bound to `/support-chat-mobile` namespace.
- `emitToGuest(guestSessionId, event, data)` — same, `guest:` room.
- `emitToConversation(conversationId, event, data)` — same, `conversation:` room.

These mobile emit methods do NOT call the event bus — that would create an infinite loop. The bus is a one-way channel: web emits → bus → mobile emits.

#### 2.3 `mobile-chat-protocol.service.ts`

The eleven handler implementations, parallel to `support-chat.gateway.ts`:361–1113. Each method takes `(socket, body)` and replicates the web handler's logic, calling into the same shared services (`PrismaService`, `ChatRouterService`, `CapacityLeaseService`, `GuestRateLimitService`, `TranslationService`, `EmployeeChatService`, `UrlAlertService`, `AuthValidationService`).

Why duplicate instead of delegating to `SupportChatGateway`'s handlers:

- Web handler bodies operate on web gateway's private state (`this.socketToCustomer`, `this.rateLimits`, etc.). Calling them from mobile would mutate web state with mobile sockets → coupling.
- Per §0 decision 1 (signed off), the duplication cost is acceptable. Most handler logic is service calls; the duplicated surface is shallow (mostly orchestration, validation, sanitization).

Drift mitigation:

- Handler-by-handler PR review during execution: each `MobileChatProtocolService` method is reviewed side-by-side with its `SupportChatGateway` counterpart. Differences are intentional and documented inline.
- Both files reference `SOCKET_PROTOCOL_VERSION = 1` constant from `wabbus-backend/src/employee-chat/socket-protocol.ts` (created if not present) — bump on any wire change to force reviewer attention.
- Optional follow-up (NOT in this plan): extract a shared `ChatProtocolService` and migrate web to use it. Out of scope for this plan because it would require touching `support-chat.gateway.ts` handler bodies.

Class-level JSDoc:

> Mobile-only. Mirrors `wabbus-backend/src/employee-chat/support-chat.gateway.ts` `@SubscribeMessage` handlers. Wire protocol must match exactly. Bump `SOCKET_PROTOCOL_VERSION` on any change and update the web gateway in lockstep.

#### 2.4 `mobile-chat-rate-limit.service.ts`

Independent rate-limit Maps (per §0 decision 3):

- `private rateLimits = new Map<number, RateLimitEntry>()` — per-customer message rate limit
- `private chatCreationLimits = new Map<number, { count, resetAt }>()` — per-customer chat creation rate limit

Constants identical to web (`RATE_LIMIT_MAX = 50`, `CHAT_CREATION_MAX = 5`, etc.) imported from a shared `wabbus-backend/src/employee-chat/chat-limits.constants.ts` (extracted from `support-chat.gateway.ts` constants if not already present — pure constant extraction is the only candidate touch to that file beyond §3.1; if extraction is risky, duplicate the constants in `mobile-chat/` instead).

Provides cleanup interval matching the web gateway (5-minute sweep).

Methods: `isRateLimited(customerId)`, `isChatCreationLimited(customerId)`, `onModuleDestroy()` to clear the timer.

Class-level JSDoc:

> Mobile-only rate limiter. Independent from web gateway's counters by design — a user connected on both web and mobile gets two separate quotas. This is intentional architectural separation, not a bug.

#### 2.5 `mobile-chat-broadcaster.service.ts`

Subscribes to `ChatEventBus`. On each event, re-emits to the corresponding room on `/support-chat-mobile` namespace via `SupportChatMobileGateway`'s emit methods.

```ts
@Injectable()
export class MobileChatBroadcasterService implements OnModuleInit {
  constructor(
    private readonly mobileGw: SupportChatMobileGateway,
    private readonly bus: ChatEventBus,
  ) {}

  onModuleInit() {
    this.bus.onChatToCustomer(({ customerId, event, data }) =>
      this.mobileGw.emitToCustomer(customerId, event, data),
    );
    this.bus.onChatToGuest(({ guestSessionId, event, data }) =>
      this.mobileGw.emitToGuest(guestSessionId, event, data),
    );
    this.bus.onChatToConversation(({ conversationId, event, data }) =>
      this.mobileGw.emitToConversation(conversationId, event, data),
    );
  }
}
```

Class-level JSDoc:

> One-way fan-out: web gateway publishes → mobile gateway re-emits. Mobile-side emissions do NOT publish back to the bus (would loop).

#### 2.6 `socket-ticket.utils.ts`

Pure functions (no Nest deps):

```ts
export type SocketTicketKind = 'customer' | 'guest';
export interface SocketTicketPayload {
  sub: string;            // customerId (string) or guestSessionId
  kind: SocketTicketKind;
  purpose: 'support-chat-mobile-socket';
  iat: number;
  exp: number;
}
export function mintSocketTicket(sub: string, kind: SocketTicketKind, secret: string): string;
export function verifySocketTicket(token: string, secret: string):
  | { ok: true; payload: SocketTicketPayload }
  | { ok: false; reason: 'malformed' | 'expired' | 'wrong-purpose' | 'invalid-signature' };
```

JWT signed with `CUSTOMER_JWT_SECRET`, `exp = iat + 60s`. The `purpose` claim prevents the ticket from being misused as an HTTP access token; the `kind` claim picks the auth branch on the gateway.

`SocketTicketService` (in §2.1 module providers list) is a thin Nest-injectable wrapper that pulls the secret from `ConfigService` and exposes `mint(sub, kind)` / `verify(token)`.

#### 2.7 `mobile-chat-auth.controller.ts`

```ts
@Controller('mobile-chat')
export class MobileChatAuthController { … }
```

Endpoints:

- `POST /mobile-chat/customer/socket-ticket` — `@UseGuards(CustomerJwtGuard)`, `@UseGuards(UserThrottlerGuard)`, `@Throttle({ default: { limit: 30, ttl: 60_000 } })`. Returns `{ token, expiresIn: 60 }`. Reads `customerUserId` from the validated JWT payload.
- `POST /mobile-chat/guest/socket-ticket` — `@UseGuards(UserThrottlerGuard)`, `@Throttle({ default: { limit: 30, ttl: 60_000 } })`. Reads `GUEST_CHAT_SESSION_COOKIE` from request, validates via `verifyGuestSessionId(rawCookie, hmacSecret)`, returns `{ token, expiresIn: 60 }` where `token.sub === guestSessionId` and `kind === 'guest'`. If cookie missing/invalid → `401 Unauthorized`.

Class-level JSDoc:

> **Mobile clients only.** Web does not call these endpoints — browsers attach cookies to WebSocket handshakes natively. Removing these endpoints requires also removing the ticket auth path in `support-chat-mobile.gateway.ts`.

#### 2.8 `README.md`

Architecture documentation. Sections:

1. **Why this module exists** — the RN WebSocket cookie problem in 3 paragraphs.
2. **Namespace map** — diagram showing `/support-chat` (web) vs `/support-chat-mobile` (mobile), with auth method, state ownership, and handler files.
3. **The event bus** — sequence diagram showing agent reply → router → web gateway emit → bus publish → mobile broadcaster → mobile gateway emit. Explicitly notes the bus is one-way (web → mobile).
4. **Adding a new chat event** — step-by-step: add handler in `MobileChatProtocolService`, add `@SubscribeMessage` shell in `SupportChatMobileGateway`, mirror the same in `SupportChatGateway`, bump `SOCKET_PROTOCOL_VERSION`, update both clients.
5. **Removing this module** — what to delete, what to revert in `support-chat.gateway.ts` (the 4 appended lines), and how to verify nothing else references mobile-chat.
6. **Drift watch** — the protocol service / web gateway pair is the highest drift risk. Reviewer checklist for any change.

### Backend — `wabbus-backend/src/chat-events/` (new shared module, 2 files)

#### 2.9 `chat-events.module.ts`

```ts
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20, verboseMemoryLeak: true })],
  providers: [ChatEventBus],
  exports: [ChatEventBus],
})
export class ChatEventsModule {}
```

Note: `EventEmitterModule.forRoot()` should be called only once globally. If the project already initializes it in `app.module.ts` (verify during execution — `vendor-support` and `notifications` modules already use `@nestjs/event-emitter`), this module just provides `ChatEventBus` and does not re-register. This will be checked in step 1 of execution.

#### 2.10 `chat-event-bus.ts`

Typed wrapper around `EventEmitter2`:

```ts
export interface ChatToCustomerEvent { customerId: number; event: string; data: any; }
export interface ChatToGuestEvent    { guestSessionId: string; event: string; data: any; }
export interface ChatToConversationEvent { conversationId: number; event: string; data: any; }

@Injectable()
export class ChatEventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  publishToCustomer(customerId: number, event: string, data: any) {
    this.emitter.emit('chat.toCustomer', { customerId, event, data });
  }
  publishToGuest(guestSessionId: string, event: string, data: any) {
    this.emitter.emit('chat.toGuest', { guestSessionId, event, data });
  }
  publishToConversation(conversationId: number, event: string, data: any) {
    this.emitter.emit('chat.toConversation', { conversationId, event, data });
  }

  onChatToCustomer(handler: (e: ChatToCustomerEvent) => void) { this.emitter.on('chat.toCustomer', handler); }
  onChatToGuest(handler: (e: ChatToGuestEvent) => void)       { this.emitter.on('chat.toGuest', handler); }
  onChatToConversation(handler: (e: ChatToConversationEvent) => void) { this.emitter.on('chat.toConversation', handler); }
}
```

Class-level JSDoc:

> One-way bus from `SupportChatGateway` (web) → mobile broadcaster. Web is the only publisher. Mobile is the only subscriber (today). If a future client (CLI, desktop) needs the same fan-out, add another subscriber — never publish from a subscriber.

### Mobile — `wabbus-mobile/lib/chat/` (2 files)

#### 2.11 `socketTicket.ts`

```ts
export interface SocketTicket { token: string; expiresIn: number; }

export async function fetchCustomerSocketTicket(signal?: AbortSignal): Promise<SocketTicket>;
export async function fetchGuestSocketTicket(signal?: AbortSignal): Promise<SocketTicket>;
```

Uses `customerFetch` from `@/lib/api` (which already handles cookies via the native fetch jar). Throws on non-2xx with a typed error so `useLiveChat.ts` can render a clear failure UI.

File-level JSDoc:

> **Mobile only.** Fetches a short-lived JWT used to authenticate the socket.io handshake on `/support-chat-mobile`. The web client (`Wabbus/src/components/ChatBubble.tsx`) does not need this — browsers attach cookies to WS upgrades natively.

#### 2.12 `README.md`

Brief mobile-side companion doc:

- Why mobile uses ticket auth (1 paragraph).
- Pointer to `wabbus-backend/src/mobile-chat/README.md` for the full picture.
- Connection lifecycle: ticket fetch → `io(URL, { auth: callback })` → reconnect re-fetches via the same callback.
- Where to look if "Connection error" reappears (transports, ticket endpoint reachability, JWT secret mismatch).

---

## §3 — Modified files (3 total)

### 3.1 `wabbus-backend/src/employee-chat/support-chat.gateway.ts` — APPEND-ONLY (4 lines)

The only edits are inside three existing methods plus one constructor parameter. Original code lines remain bit-for-bit identical.

**Constructor change:**

```ts
constructor(
  private readonly prisma: PrismaService,
  private readonly router: ChatRouterService,
  private readonly leaseManager: CapacityLeaseService,
  private readonly guestRateLimit: GuestRateLimitService,
  private readonly configService: ConfigService,
  private readonly authValidation: AuthValidationService,
  private readonly urlAlert: UrlAlertService,
  private readonly translation: TranslationService,
  @Inject(forwardRef(() => EmployeeChatGateway))
  private readonly employeeChatGw: EmployeeChatGateway,
  @Inject(REDIS_CLIENT) private readonly redis: Redis,
  @Optional() private readonly chatEvents?: ChatEventBus,   // ← NEW, optional injection
) { … }
```

The `@Optional()` decorator means if `ChatEventsModule` is not loaded, `chatEvents` is `undefined` and the bus is silently skipped. Web continues to work standalone. (Class JSDoc updated — see §6.)

**Method body changes (3 lines, all appended after original emit, all guarded with `?.`):**

```ts
emitToCustomer(customerId: number, event: string, data: any) {
  this.server.to(`customer:${customerId}`).emit(event, data);
  this.chatEvents?.publishToCustomer(customerId, event, data);   // ← APPENDED
}

emitToGuest(guestSessionId: string, event: string, data: any) {
  this.server.to(`guest:${guestSessionId}`).emit(event, data);
  this.chatEvents?.publishToGuest(guestSessionId, event, data);  // ← APPENDED
}

emitToConversation(conversationId: number, event: string, data: any) {
  this.server.to(`conversation:${conversationId}`).emit(event, data);
  this.chatEvents?.publishToConversation(conversationId, event, data);  // ← APPENDED
}
```

**Class-level JSDoc appended (one sentence):**

> **Browser clients only.** React Native clients use `wabbus-backend/src/mobile-chat/support-chat-mobile.gateway.ts` (different namespace, ticket auth, independent state). The four `emit*` methods publish to `ChatEventBus` so mobile broadcaster can fan out the same payload to mobile sockets.

**Properties of this diff:**

- Original `this.server.to(…).emit(…)` line runs first, on the same `Server`, with the exact same args, in the exact same order. Wire output to web sockets is byte-identical.
- New line is fire-and-forget, synchronous, optional via `?.`. No new branching, no new awaits, no new errors propagated.
- If `ChatEventBus` ever throws (it shouldn't — `EventEmitter2.emit` is sync and swallows listener errors by default), it would not affect the original web emit because that already happened on the previous line.
- If the bus is not registered, the chained `?.` short-circuits to `undefined` and nothing happens. Web works either way.
- Snapshot test (§7.4) confirms `(room, event, data)` triple recorded by mocked `Server.to().emit()` is identical before and after the change.

### 3.2 `wabbus-backend/src/app.module.ts`

Add two imports:

```ts
import { ChatEventsModule } from './chat-events/chat-events.module';
import { MobileChatModule } from './mobile-chat/mobile-chat.module';
```

Add to `imports: [ … ]`:

```ts
ChatEventsModule,
MobileChatModule,
```

If `EventEmitterModule.forRoot()` is already imported globally (via existing `vendor-support` or `notifications` usage — verify in step 1), `ChatEventsModule` does not need its own `forRoot` and just exports `ChatEventBus`.

### 3.3 `wabbus-mobile/lib/chat/useLiveChat.ts`

Replace the `io(...)` invocation block (lines ~308–313) with the ticket-based version:

```ts
setStatus("connecting");

const s: Socket = io(`${API_BASE}/support-chat-mobile`, {
  transports: ["websocket", "polling"],
  // auth callback runs on every (re)connect attempt — always fetches a fresh ticket
  auth: (cb) => {
    const ticketPromise = isGuest
      ? fetchGuestSocketTicket()
      : fetchCustomerSocketTicket();
    ticketPromise
      .then(({ token }) => cb({ token }))
      .catch((err) => {
        // Surfacing as `connect_error` keeps existing UI status flow intact
        cb({ token: "" });
        // Optional: log via existing telemetry
        if (__DEV__) console.warn("[useLiveChat] socket-ticket fetch failed:", err);
      });
  },
});
```

Other small edits:

- Drop `withCredentials: true` (was a no-op on RN; removing makes "we don't depend on cookies" intent obvious).
- Add file-level comment block above the `io(...)` call documenting the namespace difference and pointing to `mobile-chat/README.md` and `Wabbus/src/components/ChatBubble.tsx` for the web equivalent.
- Consider an explicit `connect_error` listener that special-cases `err.message === 'auth-ticket-failed'` (or whatever the gateway disconnects with) to show a clearer UI message — but the existing `setStatus("error")` flow already handles this acceptably. Decide during execution.

No changes to:
- The 11 `s.emit(...)` calls (event names and payload shapes are unchanged — protocol is identical).
- The 11+ `s.on(...)` listeners (server-side events are unchanged).
- The offline queue, attachment upload, rating UI, presence handling, reconnect logic. All wire protocol stays identical.

---

## §4 — Untouched files (containment proof)

The following files MUST have a zero-byte diff after execution. CI / pre-commit verification: `git diff --stat` against these paths produces no output.

```
Wabbus/src/components/ChatBubble.tsx
Wabbus/src/                                   (entire directory — web frontend)
wabbus-backend/src/employee-chat/employee-chat.gateway.ts
wabbus-backend/src/employee-chat/employee-chat.module.ts
wabbus-backend/src/employee-chat/employee-chat.controller.ts
wabbus-backend/src/employee-chat/employee-chat.service.ts
wabbus-backend/src/employee-chat/customer-support.controller.ts
wabbus-backend/src/employee-chat/guest-session.controller.ts
wabbus-backend/src/employee-chat/livechat-attachment.controller.ts
wabbus-backend/src/employee-chat/livechat-attachment.service.ts
wabbus-backend/src/employee-chat/routing/                (entire directory — chat-router, expiry-sweep, capacity-lease, etc.)
wabbus-backend/src/employee-chat/dto/                    (entire directory)
wabbus-backend/src/customer-auth/                        (entire directory — no new endpoints there)
wabbus-vendor-frontend/                                  (entire repo)
wabbus-admin/                                            (entire repo)
wabbus-support/                                          (entire repo)
```

Possible exception (decide during execution): if extracting `RATE_LIMIT_MAX`, `CHAT_CREATION_MAX`, `DISCONNECT_GRACE_MS`, `CUSTOMER_REAUTH_INTERVAL_MS` into a shared `chat-limits.constants.ts` is preferred over duplicating constants, that is the ONLY acceptable additional touch to `support-chat.gateway.ts` — pure constant move with imports rewired. If even that feels risky, just duplicate the constants in `mobile-chat/`.

---

## §5 — Naming and labeling conventions

Every new file and new symbol carries `mobile` (or `MobileChat`) somewhere in its name so a future developer cannot confuse it with the web path:

| Layer            | Pattern                                | Examples                                                     |
| ---------------- | -------------------------------------- | ------------------------------------------------------------ |
| Backend folder   | `src/mobile-chat/`                     | (the entire new module)                                      |
| Backend file     | `*-mobile.*` or `mobile-chat-*.*`      | `support-chat-mobile.gateway.ts`, `mobile-chat-protocol.service.ts`, `mobile-chat-broadcaster.service.ts` |
| Backend class    | `*Mobile*` or `MobileChat*`            | `SupportChatMobileGateway`, `MobileChatProtocolService`, `MobileChatBroadcasterService`, `MobileChatAuthController`, `MobileChatRateLimitService` |
| Backend module   | `MobileChatModule`                     | (singular)                                                   |
| Socket namespace | `/support-chat-mobile`                 | (singular)                                                   |
| HTTP route       | `/mobile-chat/...`                     | `/mobile-chat/customer/socket-ticket`, `/mobile-chat/guest/socket-ticket` |
| Mobile file      | (in `wabbus-mobile/lib/chat/`)         | `socketTicket.ts`                                            |
| Shared bus       | `ChatEventBus` in `src/chat-events/`   | (not labeled "mobile" because it is a generic primitive — only the SUBSCRIBER is mobile-specific) |

Search invariants after execution:

- `rg "support-chat-mobile"` → matches only files in `wabbus-backend/src/mobile-chat/`, `wabbus-mobile/`, and tests. Never `Wabbus/src/`.
- `rg "MobileChat"` → matches only `wabbus-backend/src/mobile-chat/` and tests.
- `rg "support-chat[^-]"` (no hyphen-mobile) → matches only `Wabbus/src/`, `wabbus-backend/src/employee-chat/`, and tests. Never `wabbus-backend/src/mobile-chat/`.
- `rg "mobile" wabbus-backend/src/employee-chat/support-chat.gateway.ts` → zero matches except in the appended class JSDoc.

---

## §6 — Documentation requirements

Structure does most of the work, but these documentation artifacts are mandatory:

1. **`wabbus-backend/src/mobile-chat/README.md`** — full architecture doc per §2.8.
2. **`wabbus-mobile/lib/chat/README.md`** — mobile-side companion per §2.12.
3. **Class JSDoc** on every new class explicitly stating "Mobile-only" / "Browser clients only" / "One-way fan-out" as appropriate (see §2.x for exact wording).
4. **One-sentence JSDoc append** to `SupportChatGateway` class header per §3.1.
5. **Inline JSDoc above the appended `chatEvents?.publish*` lines** — short, e.g. `// Fan-out for mobile sockets. See src/mobile-chat/README.md.`
6. **Inline comment block above `io(...)` in `useLiveChat.ts`** — per §3.3.
7. **`wabbus-mobile/CLAUDE.md`** — append a one-line note under a new "Live Chat" subsection: *Mobile authenticates the support-chat WebSocket via short-lived JWT tickets on the `/support-chat-mobile` namespace; web uses cookies on `/support-chat`. Architecture: `wabbus-backend/src/mobile-chat/README.md`.*
8. **No CLAUDE.md edits in `Wabbus/src/`** — out of scope per §0.

---

## §7 — Implementation order

To be tracked via TodoWrite during execution. Each step has a verification checkpoint.

### Step 1 — Pre-flight checks (no code changes)

- `rg "EventEmitterModule.forRoot"` in `wabbus-backend/src/` to determine if it's already initialized globally. If yes, `ChatEventsModule` skips `forRoot`. If no, add it there once.
- Verify `@nestjs/event-emitter` is in `package.json` (already confirmed: v3.0.1).
- Verify `CustomerJwtGuard` and `UserThrottlerGuard` are exportable from their modules (already confirmed for both).
- Verify `verifyGuestSessionId` is importable from `auth/cookie.utils` (already confirmed — used by `support-chat.gateway.ts` and `guest-session.controller.ts`).
- Verify `gatewayCorsConfig` is importable (already confirmed — used by `support-chat.gateway.ts`).
- Decide constants: extract to shared file OR duplicate in mobile-chat. Default: duplicate (zero risk to web).

### Step 2 — Shared bus

- Create `wabbus-backend/src/chat-events/chat-event-bus.ts`.
- Create `wabbus-backend/src/chat-events/chat-events.module.ts`.
- Verify it compiles standalone: `cd wabbus-backend && npx tsc --noEmit`.

### Step 3 — Append bus calls to web gateway (Step 3 IS the web touch)

- Edit `support-chat.gateway.ts`: add `@Optional() chatEvents?: ChatEventBus` constructor param, three appended `chatEvents?.publish*(...)` lines, class JSDoc one-sentence append.
- Run web's existing chat e2e (if any) to confirm no behavior change.
- Run snapshot test (§7.4) to confirm wire output to web sockets is byte-identical.

### Step 4 — Ticket utilities

- Create `wabbus-backend/src/mobile-chat/socket-ticket.utils.ts`.
- Create unit tests covering: mint round-trip verify success; expired token; wrong purpose; malformed token; tampered signature.

### Step 5 — Ticket controller

- Create `wabbus-backend/src/mobile-chat/mobile-chat-auth.controller.ts`.
- Test: unauthenticated request → 401; authenticated customer → returns ticket; valid guest cookie → returns guest ticket; invalid guest cookie → 401; rate limit triggers at 31st request.

### Step 6 — Mobile rate-limit service

- Create `wabbus-backend/src/mobile-chat/mobile-chat-rate-limit.service.ts`.
- Unit test counter behavior + timer cleanup.

### Step 7 — Mobile protocol service

- Create `wabbus-backend/src/mobile-chat/mobile-chat-protocol.service.ts` with all 11 handler methods.
- During implementation, each handler reviewed against its `support-chat.gateway.ts` counterpart line-by-line. Any intentional divergence noted in inline comment.
- Unit test handler-by-handler with mocked socket and mocked downstream services.

### Step 8 — Mobile gateway

- Create `wabbus-backend/src/mobile-chat/support-chat-mobile.gateway.ts`.
- `handleConnection` reads `socket.handshake.auth?.token`, verifies via `SocketTicketService`, sets `socket.data.role/customerId/guestSessionId`, joins rooms, calls existing `EmployeeChatService.notifyAgentOfCustomerPresence` (re-use, do not duplicate).
- `handleDisconnect` mirrors web cleanup using mobile state.
- 11 `@SubscribeMessage` shells delegating to protocol service.
- Public emit methods bound to `/support-chat-mobile` namespace.

### Step 9 — Mobile broadcaster

- Create `wabbus-backend/src/mobile-chat/mobile-chat-broadcaster.service.ts` with bus subscriptions in `onModuleInit`.

### Step 10 — Mobile module wiring

- Create `wabbus-backend/src/mobile-chat/mobile-chat.module.ts`.
- Update `wabbus-backend/src/app.module.ts` with two imports (`ChatEventsModule`, `MobileChatModule`).
- Build: `cd wabbus-backend && npm run build`. Must pass.

### Step 11 — Mobile docs

- Create `wabbus-backend/src/mobile-chat/README.md` per §2.8.
- Create `wabbus-mobile/lib/chat/README.md` per §2.12.
- Append "Live Chat" subsection to `wabbus-mobile/CLAUDE.md`.

### Step 12 — Mobile client

- Create `wabbus-mobile/lib/chat/socketTicket.ts`.
- Edit `wabbus-mobile/lib/chat/useLiveChat.ts` per §3.3.
- TypeScript check: `cd wabbus-mobile && npx tsc --noEmit`.

### Step 13 — End-to-end smoke test

- Backend running locally with both web and mobile clients connected as the same customer.
- Send a message from agent in `wabbus-support` → verify both web and mobile receive it.
- Send a message from web client → verify backend receives + agent receives + mobile receives the agent's reply.
- Send a message from mobile client → verify backend receives + agent receives + web receives the agent's reply.
- Disconnect mobile, send agent reply → verify web still receives (proves mobile fan-out doesn't block web).
- Force ticket endpoint to return 500 → verify mobile shows "Connection error", web unaffected.
- Run full mobile chat regression: pre-chat picker → start → message → typing indicators → close → rate.

### Step 14 — Cleanup verification

- `git diff --stat Wabbus/src/` → zero output.
- `git diff wabbus-backend/src/employee-chat/support-chat.gateway.ts` → exactly 4 added lines + class JSDoc, original lines unchanged.
- `git diff --stat wabbus-vendor-frontend/ wabbus-admin/ wabbus-support/` → zero output.
- All search invariants from §5 hold.

---

## §8 — Test plan

### 8.1 Unit tests (new)

- `socket-ticket.utils.spec.ts` — mint/verify round-trip; expired (set system time forward 61s); wrong purpose; malformed; tampered signature.
- `mobile-chat-auth.controller.spec.ts` — endpoints with mocked guards and ticket service.
- `mobile-chat-rate-limit.service.spec.ts` — counter, reset window, cleanup timer.
- `mobile-chat-protocol.service.spec.ts` — one test per handler, mirror existing `support-chat.gateway.spec.ts` patterns if they exist.
- `chat-event-bus.spec.ts` — publish/subscribe wiring.

### 8.2 Integration tests (new)

- `mobile-chat.e2e-spec.ts` — boot Nest app with `MobileChatModule`, open a socket.io client to `/support-chat-mobile`, send through the full lifecycle (start → message → close → rate). Use a real JWT signed with the test secret.
- Bus fan-out test: connect mobile socket as customer X. Trigger `supportChatGw.emitToCustomer(X, 'message:new', {…})`. Assert mobile socket receives the event.
- Bus does NOT loop test: trigger `mobileGw.emitToCustomer(X, 'message:new', {…})`. Assert web bus subscriber count for that customer's room does not grow / no reflexive emit observed.

### 8.3 Web regression (existing tests + new snapshot)

- Run `wabbus-vendor-frontend/e2e/chat/live-chat.spec.ts` and any existing web chat tests — must pass unchanged.
- New snapshot test in `support-chat.gateway.spec.ts`: mock `Server.to().emit()`, call `emitToCustomer/Guest/Conversation`, capture `(room, event, JSON.stringify(data))`. Snapshot must match committed baseline. Run BEFORE and AFTER §3.1 edits to prove byte equivalence to web sockets.

### 8.4 Mobile manual QA

- Logged-in customer: open chat, send message, receive agent reply. Disconnect WiFi mid-chat, reconnect — auto-reconnect mints a fresh ticket and resumes.
- Guest: same flow with no account.
- Force JWT secret rotation on backend during a session → mobile reconnect should fail cleanly with "Connection error" and recover when secret stabilizes.
- App backgrounded for 2 minutes → resume → reconnect attempt fetches fresh ticket (old one would be expired anyway).

---

## §9 — Rollback strategy

The design supports a graceful kill-switch and a clean revert.

### Kill switch (no deploy needed)

- Add a feature flag `MOBILE_CHAT_ENABLED` (env var, default `true`). In `MobileChatModule`, gate the gateway and broadcaster registration on the flag.
- Setting to `false` and restarting the backend disables mobile sockets entirely. Web is unaffected because:
  - `support-chat.gateway.ts`'s appended `chatEvents?.publish*()` lines remain, but with no subscribers, the events go nowhere (no error).
  - Mobile clients receive a clean disconnect on `/support-chat-mobile` and surface "Connection error".

### Full revert (if disastrous)

1. Revert §3.3 (mobile client to old `/support-chat` URL).
2. Mobile is back to broken-but-not-worse-than-today.
3. Web is unaffected (no edits to revert beyond §3.1).
4. Optional: revert §3.1 by deleting the 4 appended lines and constructor param. Web continues to work — those lines were no-ops in the absence of subscribers anyway.
5. Optional: delete `mobile-chat/` and `chat-events/` directories and remove their imports from `app.module.ts`.

Reversibility is the design goal — every new artifact is in a clearly-named directory and the touch to existing code is so small that diff-review confirms the revert is complete.

---

## §10 — Open questions resolved (per user sign-off)

| Question                                                     | Decision                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| Mobile gateway has its own protocol service vs. delegating to web gateway's handlers? | **Own protocol service.** Duplication accepted as price of separation. Drift mitigated via reviewer checklist + `SOCKET_PROTOCOL_VERSION`. |
| Event bus acceptable as one fan-out mechanism?               | **Yes**, if necessary — and it is necessary because direct cross-namespace emission from web gateway would require web to know mobile's namespace name (worse coupling). |
| Mobile rate limits independent or shared?                    | **Independent.** A user on web AND mobile gets two separate quotas. Cleaner architecture, no shared mutable state. |

---

## §11 — Definition of done

- [ ] All 12 new files created with the exact paths listed in §2.
- [ ] `support-chat.gateway.ts` shows exactly 4 added lines (1 constructor param + 3 emit appends) + 1 JSDoc sentence; original lines unchanged.
- [ ] `app.module.ts` has 2 added imports.
- [ ] `useLiveChat.ts` connects to `/support-chat-mobile` with `auth: callback` form; `withCredentials` removed.
- [ ] All §4 untouched files have zero diff.
- [ ] All §5 search invariants hold.
- [ ] All §8 tests pass (web regression + new mobile suites + snapshot).
- [ ] Manual QA per §8.4 passes on iOS simulator (Android if available).
- [ ] Two README.md files written (`mobile-chat/`, `lib/chat/`) and `wabbus-mobile/CLAUDE.md` updated.
- [ ] Backend builds clean: `cd wabbus-backend && npm run build` exits 0.
- [ ] Mobile typechecks clean: `cd wabbus-mobile && npx tsc --noEmit` exits 0.
- [ ] Backend lints clean: `cd wabbus-backend && npm run lint` exits 0.
- [ ] Mobile lints clean: `cd wabbus-mobile && npm run lint` exits 0.

---

## §12 — Risks and mitigations

| Risk                                                         | Likelihood | Impact | Mitigation                                                   |
| ------------------------------------------------------------ | ---------- | ------ | ------------------------------------------------------------ |
| Bus listener throws and corrupts event loop                  | Low        | Medium | `EventEmitter2` swallows listener errors by default; broadcaster wraps each handler in try/catch + logs. Web emit happens BEFORE bus publish, so any bus failure cannot affect web. |
| Mobile protocol drifts from web                              | Medium     | High   | Reviewer checklist in `mobile-chat/README.md`; `SOCKET_PROTOCOL_VERSION` constant bumped on any wire change; integration tests assert payload shapes. |
| `EventEmitterModule.forRoot()` double-registered             | Low        | Low    | Pre-flight check in step 1 of execution.                     |
| Optional `@Optional()` injection silently fails to wire      | Low        | Medium | Backend boot logs "ChatEventBus wired into SupportChatGateway" if injection succeeded. Smoke test in §7.4 verifies fan-out works end-to-end. |
| Ticket endpoint becomes a DoS surface                        | Low        | Medium | `@Throttle` at 30 req/min per user; `CustomerJwtGuard` for the customer endpoint; cookie validation for the guest endpoint. |
| JWT secret rotation breaks in-flight tickets                 | Low        | Low    | 60s TTL means the impact window is one minute; reconnect callback fetches fresh ticket on next attempt. |
| Mobile sockets accumulate in mobile gateway state on app crash | Medium     | Low    | Mobile `handleDisconnect` mirrors web's grace-timer cleanup. socket.io's own ping/pong detects dead connections within ~25s. |
| `socket.io-client` v4 `auth: callback` form behaves differently than expected on RN | Low        | Medium | Verified pattern in socket.io v4 docs; smoke test in §7.4 explicitly exercises reconnect to confirm callback re-fires. |
| Future dev adds a new `emit*` method to web gateway and forgets the bus publish | Medium     | Medium | Add a brief `// REMINDER: any new emit*-style helper here MUST also publish to chatEvents — see src/mobile-chat/README.md` comment above the existing emit methods. |

---

## §13 — Execution standby

This plan is complete and ready for execution. On the user's go-ahead, execution starts at §7 step 1 (pre-flight) and proceeds in numbered order, with TodoWrite tracking progress and verification checkpoints between steps.

No code is written until the user says "execute."
