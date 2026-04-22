# Handoff — Mobile Live Chat Socket Isolation

**Status:** Plan complete, not started. Ready to execute.

## The plan

Read this in full BEFORE writing any code:

```
/Users/jonathan/Desktop/wabbascus/wabbascus2/wabbus-mobile/.cursor/plans/live_chat_socket_isolation_7e2b9f4a.plan.md
```

The plan is self-contained — every file, every diff, every test, every verification step is in there. You should not need any other doc to execute. This handoff exists only to flag the things you're most likely to mess up.

## What this fixes (2-line version)

Mobile users see "Connection error" on the support live-chat tab. Root cause: React Native's WebSocket polyfill doesn't attach cookies to the WS handshake, so the cookie-only auth on the backend gateway disconnects the socket immediately. Fix: a parallel mobile-only socket namespace with short-lived JWT ticket auth, structurally isolated from the working web path.

## Cross-repo scope

Two repos, in this order:

1. **`wabbus-backend/`** — new module `src/mobile-chat/` (8 files), new module `src/chat-events/` (2 files), append-only edit to `src/employee-chat/support-chat.gateway.ts` (4 lines), 2 imports added to `src/app.module.ts`.
2. **`wabbus-mobile/`** — new file `lib/chat/socketTicket.ts`, edit `lib/chat/useLiveChat.ts`.

Out of scope, do NOT open: `Wabbus/src/` (web frontend), `wabbus-vendor-frontend/`, `wabbus-admin/`, `wabbus-support/`. Plan §4 lists every path that must show zero diff.

## Critical things you WILL get wrong if you don't read carefully

1. **The web gateway file (`support-chat.gateway.ts`) gets EXACTLY 4 added lines plus a one-sentence JSDoc append.** Constructor: `@Optional() private readonly chatEvents?: ChatEventBus`. Three method bodies: append `this.chatEvents?.publishToCustomer/Guest/Conversation(...)` AFTER the existing `this.server.to(...).emit(...)` line. The original lines stay byte-identical. If your diff to that file shows anything else — new branching, extracted methods, modified existing lines, anything — you've gone off the plan. Stop and re-read §3.1.

2. **DO NOT extract code from the web gateway's `handleConnection`.** A previous agent's plan tried this and the user explicitly rejected it. Web's connection auth path is untouched.

3. **DO NOT add new endpoints to `customer-auth.controller.ts` or `guest-session.controller.ts`.** The two ticket endpoints live in the new `mobile-chat-auth.controller.ts` under the `/mobile-chat/...` prefix. Plan §2.7.

4. **DO NOT call into the web gateway from the mobile gateway.** Mobile gets its own protocol service (`MobileChatProtocolService`) with the 11 handler bodies duplicated. The user signed off on this duplication explicitly — it's the price of true separation. Drift mitigation is the reviewer checklist + `SOCKET_PROTOCOL_VERSION` constant. Plan §2.3 + §10.

5. **The event bus is ONE-WAY: web → mobile.** `SupportChatGateway.emit*` publishes to the bus. `MobileChatBroadcasterService` subscribes and re-emits on `/support-chat-mobile` rooms. The mobile gateway's own `emit*` methods do NOT publish to the bus — that would create an infinite loop. Plan §2.5, §2.10.

6. **Mobile rate limits are independent (per user sign-off §10).** Don't try to share state with the web gateway's `rateLimits` / `chatCreationLimits` Maps. Mobile gets its own `MobileChatRateLimitService` with its own counters. A user on web AND mobile gets two separate quotas. This is intentional.

7. **`@Optional()` on the `chatEvents` injection is non-negotiable.** It guarantees that if `ChatEventsModule` ever fails to load, the web gateway still works standalone (the `?.` short-circuits to `undefined`). Plan §3.1, §9.

8. **socket.io v4 `auth` callback form is REQUIRED on mobile.** Use `auth: (cb) => fetchTicket().then(({ token }) => cb({ token }))`. The callback fires on every (re)connect attempt, so tickets are always fresh. Do NOT pass a static `auth: { token }` — the second connect would use a stale/expired token. Plan §3.3.

9. **Attachment uploads stay on the existing HTTP endpoint** (`POST /employee-chat/attachments/upload`). HTTP `fetch` on RN uses the native cookie jar, so cookie auth works there. Do NOT fork the attachment surface. Plan §0 non-negotiable 5.

10. **Class JSDocs are mandatory and have specific wording.** Each new class gets "Mobile-only" / "Browser clients only" / "One-way fan-out" labels. The exact wording is in §2.x of the plan — don't paraphrase, copy it. This is the user-visible separation that prevents future devs from cross-wiring web and mobile.

## User's hard rules (from `CLAUDE.local.md`)

- **NEVER commit, push, or modify git state without explicit approval.**
- **NEVER suggest shortcuts or "easy" solutions.** The user already rejected the polling-first transport reorder as a shortcut. The ticket auth path is the production answer; don't propose alternatives.
- **All user-facing strings via `useTranslations()`** — there are no new user-facing strings in this plan, but if you find yourself adding one, route it through i18n.
- **Routes via `ROUTES` constants** in any client code (no new routes added in this plan).
- **Run lint before suggesting a commit.**

## Recommended execution order

Follow §7 of the plan top-to-bottom. The 14 steps are already in dependency order:

1. **Pre-flight checks** — verify `EventEmitterModule.forRoot()` is/isn't already global; if it is, `ChatEventsModule` skips its own `forRoot`. Verify guards/utils are importable. No code changes in this step.
2. **Shared bus** — create `chat-events/chat-event-bus.ts` and `chat-events.module.ts`. `npx tsc --noEmit` to verify standalone compile.
3. **Append bus calls to web gateway** — the §3.1 surgical edit. After this step, run the snapshot test (§8.3) to prove byte-identical wire output to web sockets.
4. **Ticket utilities** — `socket-ticket.utils.ts` + unit tests covering all failure modes (expired, wrong purpose, malformed, tampered).
5. **Ticket controller** — `mobile-chat-auth.controller.ts` with both endpoints + throttling.
6. **Mobile rate-limit service** — independent counters.
7. **Mobile protocol service** — the 11 handler bodies. Implement each one side-by-side with its `support-chat.gateway.ts` counterpart; document any intentional divergence inline.
8. **Mobile gateway** — `support-chat-mobile.gateway.ts` with ticket auth in `handleConnection`, 11 thin `@SubscribeMessage` shells delegating to the protocol service.
9. **Mobile broadcaster** — bus subscriptions in `onModuleInit`.
10. **Mobile module wiring** — `mobile-chat.module.ts` + 2 imports in `app.module.ts`. `npm run build` must pass.
11. **Mobile docs** — `mobile-chat/README.md`, `wabbus-mobile/lib/chat/README.md`, `wabbus-mobile/CLAUDE.md` append.
12. **Mobile client** — `socketTicket.ts` + edit `useLiveChat.ts`. `npx tsc --noEmit` must pass.
13. **End-to-end smoke test** — see §7 step 13 for the full matrix (web + mobile same customer, agent reply reaches both, mobile crash doesn't kill web, etc.).
14. **Cleanup verification** — run all the §5 search invariants and §4 zero-diff assertions.

Use `TodoWrite` to track progress against these 14 steps.

## How to verify the web didn't change

This is the primary user fear. Two checks:

1. **Diff inspection:** `git diff wabbus-backend/src/employee-chat/support-chat.gateway.ts` must show ONLY:
   - 1 added constructor parameter line (`@Optional() private readonly chatEvents?: ChatEventBus,`)
   - 3 added method-body lines (one per `emit*` method, all `this.chatEvents?.publish*(...)` form)
   - 1 added class JSDoc sentence
   - Zero modifications to existing lines.

2. **Snapshot test:** `support-chat.gateway.spec.ts` (created in step 3) mocks `Server.to().emit()`, calls `emitToCustomer/Guest/Conversation`, snapshots the `(room, event, JSON.stringify(data))` triple. Run BEFORE the §3.1 edit to capture baseline; run AFTER to confirm equivalence. Both runs must produce identical snapshots.

If either check fails, the web path has been altered — STOP and revert.

## Search invariants (run these after step 10 and again at step 14)

```sh
# Mobile-named symbols only in mobile files:
rg "support-chat-mobile" wabbus-backend/src wabbus-mobile      # only mobile-chat/, wabbus-mobile/, tests
rg "MobileChat"          wabbus-backend/src                     # only mobile-chat/ + tests
rg "support-chat[^-]"    wabbus-backend/src                     # only employee-chat/, never mobile-chat/

# Web gateway free of mobile bleed:
rg "mobile" wabbus-backend/src/employee-chat/support-chat.gateway.ts   # only the JSDoc one-sentence
```

If any of these return unexpected matches, the separation has leaked and you need to find/fix it before continuing.

## Files to read for context BEFORE coding

- The plan itself (mandatory, end-to-end).
- `wabbus-backend/src/employee-chat/support-chat.gateway.ts` — the web gateway you must NOT modify beyond §3.1.
- `wabbus-backend/src/employee-chat/employee-chat.module.ts` — pattern reference for how the existing module is wired.
- `wabbus-backend/src/employee-chat/guest-session.controller.ts` — pattern reference for guest cookie validation + throttling decorators (mirror the same patterns in the new `mobile-chat-auth.controller.ts`).
- `wabbus-backend/src/customer-auth/customer-jwt.guard.ts` — guard you'll use on the customer ticket endpoint.
- `wabbus-backend/src/employee-chat/routing/chat-router.service.ts` — to confirm the router calls go through `supportChatGw.emit*` (which means the bus fan-out covers them automatically).
- `wabbus-mobile/lib/chat/useLiveChat.ts` — the client hook you'll edit. Read all ~870 lines once so you know what you're touching.
- `wabbus-mobile/app/(tabs)/chat.tsx` — for context on what the hook drives. Do not edit this file.

## Build / install reminders

- Backend: no new npm dependencies. `@nestjs/event-emitter@3.0.1` is already in `package.json`.
- Mobile: no new npm dependencies. socket.io-client v4 is already installed and supports the `auth: callback` form natively.
- Backend rebuild: `cd wabbus-backend && npm run build` after step 10 and again after step 12.
- Mobile typecheck: `cd wabbus-mobile && npx tsc --noEmit` after step 12.
- Backend lint: `cd wabbus-backend && npm run lint` before claiming done.
- Mobile lint: `cd wabbus-mobile && npm run lint` before claiming done.

## How to verify you're done

The plan has explicit acceptance criteria in §11 — go through it as a literal checklist:

- All 12 new files present at the exact paths in §2.
- The §3.1 diff is exactly 4 added lines + 1 JSDoc sentence; no existing lines modified.
- §4 untouched files all show zero diff.
- All §5 search invariants pass.
- Snapshot test confirms web wire output unchanged.
- §8 tests all pass (unit + integration + web regression).
- §7 step 13 manual smoke test passes on iOS simulator.
- Both READMEs written and `wabbus-mobile/CLAUDE.md` updated.
- Backend builds clean. Mobile typechecks clean. Both lint clean.

Most likely-to-regress checks:

- Disconnect WiFi mid-chat on mobile, reconnect → fresh ticket fetched, session resumes.
- Force ticket endpoint to 500 → mobile shows clean "Connection error", web unaffected.
- Same customer connected on web + mobile → agent reply reaches BOTH simultaneously.
- Kill mobile gateway entirely (env flag from §9) → web continues working.

## Conversation history summary

The user reviewed a previous agent's plan that proposed extracting methods from `support-chat.gateway.ts`, adding `setMobileGateway()` for bidirectional coupling, and modifying `emitToCustomer/Guest`'s implementations. They rejected it as "convergent into existing routes" and demanded true structural separation.

User explicitly approved (do not re-litigate):

1. **Mobile gets its own `MobileChatProtocolService`** with handler bodies duplicated from the web gateway. Drift accepted as the price of separation.
2. **Event bus is permitted** because the alternative (cross-namespace emit from web gateway) is worse coupling. The bus is one-way (web → mobile), append-only on the web side, fully testable.
3. **Mobile rate limits are independent** from web. A user on both gets two separate quotas. Architectural separation > theoretical user-facing fairness.

User's exact framing: *"all of these files should be clearly labeled like you did. Write up a plan first with all of these details and standby for execution."*

The plan was written. The user asked for a different agent to execute it. Don't re-design — execute as written.

## When you start

1. Open the plan file. Read cover to cover. Don't skim §3.1 — that's the entire risk surface.
2. Run `TodoWrite` with the 14 steps from §7 as todo IDs.
3. Start with step 1 (pre-flight, no code changes).
4. After step 3 (the §3.1 web edit), STOP and run the snapshot test before continuing. If snapshot diverges, revert and figure out why.
5. Surface any ambiguity to the user immediately. Do not invent. The plan is meant to leave nothing to interpretation; if it does, that's a bug in the plan and the user needs to clarify.

If the user asks "where are we" mid-execution, point them at the TodoWrite list and the plan path at the top of this handoff.
