# lib/chat — mobile support-chat client

This folder hosts the mobile support-chat client that pairs with `wabbus-backend/src/mobile-chat/` (see `wabbus-backend/src/mobile-chat/README.md` for the backend-side architecture). Together they implement the **mobile-only** authentication path that bypasses React Native's WebSocket cookie limitation.

## File map

| File              | Purpose                                                                     |
| ----------------- | --------------------------------------------------------------------------- |
| `useLiveChat.ts`  | React hook: connects to `/support-chat-mobile`, manages messages and state. |
| `socketTicket.ts` | Mints a fresh JWT ticket via `POST /mobile-chat/{customer,guest}/socket-ticket` and returns it for use as `handshake.auth.token`. |
| `types.ts`        | Shared TS types for chat messages, status, and reasons.                     |
| `chat-reasons.ts` | i18n keys for the chat-reason picker.                                       |

## Why this exists

React Native's WebSocket polyfill does not attach cookies to the WS upgrade request. The web client (`Wabbus/src/components/ChatBubble.tsx`) authenticates by relying on the browser to attach `customer_access` / `guest_chat_session` cookies to the upgrade — that path is not viable on mobile.

Instead, the mobile client:

1. Calls `socketTicket.ts` which `POST`s to `/mobile-chat/customer/socket-ticket` (or guest variant). The HTTP cookie jar attaches the customer cookie to that request because it's a regular `fetch`, not a WS upgrade. The backend mints a 60-second JWT ticket.
2. Opens a Socket.IO connection to `/support-chat-mobile` with the ticket on `socket.io({ auth: { token } })`.
3. The backend gateway (`SupportChatMobileGateway`) reads the ticket from `handshake.auth.token`, verifies it, and treats the connection as authenticated.

`withCredentials` is **not** set on the mobile socket — it does nothing on RN's polyfill and would be misleading.

## Reference

- Backend gateway: `wabbus-backend/src/mobile-chat/support-chat-mobile.gateway.ts`
- Ticket endpoints: `wabbus-backend/src/mobile-chat/mobile-chat-auth.controller.ts`
- Architecture docs: `wabbus-backend/src/mobile-chat/README.md`
- Web counterpart (do not modify in lockstep without coordination): `Wabbus/src/components/ChatBubble.tsx`
