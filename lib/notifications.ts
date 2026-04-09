/**
 * Push notifications — register for tokens, send to backend, handle incoming.
 *
 * Uses expo-notifications + expo-device when native modules are available.
 * Gracefully degrades to no-ops when running in Expo Go or environments
 * without the native module (e.g. simulator without dev client).
 */

import { Platform } from "react-native";
import { customerFetch } from "./api";
import { ROUTES } from "./routes";

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

let Notifications: NotificationsModule | null = null;
let Device: DeviceModule | null = null;

try {
  Notifications = require("expo-notifications");
  Device = require("expo-device");
} catch {
  if (__DEV__) console.warn("expo-notifications native module unavailable — push disabled");
}

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowInForeground: true,
    }),
  });
}

let cachedToken: string | null = null;

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications || !Device) return null;

  if (!Device.isDevice) {
    if (__DEV__) console.log("Push notifications require a physical device");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2d4ecf",
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  cachedToken = tokenData.data;
  return cachedToken;
}

export async function sendTokenToBackend(): Promise<void> {
  const token = cachedToken ?? (await registerForPushNotifications());
  if (!token) return;

  try {
    await customerFetch("/customer-devices/register", {
      method: "POST",
      body: JSON.stringify({
        token,
        platform: Platform.OS,
        deviceType: "EXPO_PUSH",
      }),
    });
  } catch {
    /* best-effort — backend may not have this endpoint yet */
  }
}

export async function deregisterToken(): Promise<void> {
  if (!cachedToken) return;

  try {
    await customerFetch("/customer-devices/deregister", {
      method: "POST",
      body: JSON.stringify({ token: cachedToken }),
    });
  } catch {
    /* best-effort */
  }
  cachedToken = null;
}

export type NotificationRoute = {
  screen: string;
  params?: Record<string, string>;
};

/**
 * Parse a notification's data payload into an in-app route.
 * The backend should send { type, orderId?, ticketId?, conversationId? }.
 */
export function parseNotificationRoute(
  data: Record<string, unknown> | undefined,
): NotificationRoute | null {
  if (!data?.type) return null;

  switch (data.type) {
    case "ORDER_UPDATE":
    case "ORDER_SHIPPED":
    case "ORDER_DELIVERED":
      if (data.orderId) {
        return { screen: ROUTES.orderDetail(String(data.orderId)) };
      }
      return { screen: ROUTES.orders };

    case "ORDER_TRACKING":
      if (data.orderId) {
        return { screen: ROUTES.orderTracking(String(data.orderId)) };
      }
      return { screen: ROUTES.orders };

    case "CHAT_MESSAGE":
      return { screen: ROUTES.supportLiveChat };

    case "CONVERSATION_MESSAGE":
      if (data.conversationId) {
        return { screen: ROUTES.accountConversation(String(data.conversationId)) };
      }
      return { screen: ROUTES.accountMessages };

    case "SUPPORT_TICKET":
      return { screen: ROUTES.accountMessages };

    case "CASE_UPDATE":
      if (data.caseNumber) {
        return { screen: ROUTES.accountCase(String(data.caseNumber)) };
      }
      return { screen: ROUTES.accountMessages };

    case "PROMOTION":
    default:
      return null;
  }
}

/**
 * Subscribe to notification tap responses. Returns a cleanup function.
 * No-ops when the native module is unavailable.
 */
export function addResponseListener(
  callback: (data: Record<string, unknown> | undefined) => void,
): () => void {
  if (!Notifications) return () => {};

  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      callback(data);
    },
  );

  return () => subscription.remove();
}
