import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";
import * as Notifications from "expo-notifications";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { NetworkProvider } from "@/lib/network";
import { STRIPE_KEY } from "@/lib/config";
import { colors } from "@/lib/theme";
import { parseNotificationRoute, registerForPushNotifications } from "@/lib/notifications";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import OfflineBanner from "@/components/ui/OfflineBanner";
import ToastProvider from "@/components/ui/ToastProvider";
import ChatFab from "@/components/ui/ChatFab";

function NotificationHandler() {
  const router = useRouter();
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    registerForPushNotifications();

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        const route = parseNotificationRoute(data);
        if (route) {
          router.push(route.screen as any);
        }
      },
    );

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <NetworkProvider>
        <SafeAreaProvider>
          <StripeProvider
            publishableKey={STRIPE_KEY}
            merchantIdentifier="merchant.com.wabbus.mobile"
          >
            <AuthProvider>
              <CartProvider>
                <NotificationHandler />
                <StatusBar style="dark" />
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: "slide_from_right",
                  }}
                >
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
                  <Stack.Screen name="checkout" options={{ presentation: "fullScreenModal" }} />
                  <Stack.Screen name="order-complete" />
                  <Stack.Screen name="impersonate" options={{ headerShown: false }} />
                </Stack>
                <ChatFab />
                <ToastProvider />
                <OfflineBanner />
              </CartProvider>
            </AuthProvider>
          </StripeProvider>
        </SafeAreaProvider>
      </NetworkProvider>
    </ErrorBoundary>
  );
}
