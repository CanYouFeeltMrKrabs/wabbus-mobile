import "@/i18n";
import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { NetworkProvider } from "@/lib/network";
import { STRIPE_KEY } from "@/lib/config";
import { colors } from "@/lib/theme";
import {
  parseNotificationRoute,
  registerForPushNotifications,
  addResponseListener,
} from "@/lib/notifications";
import QueryProvider from "@/components/QueryProvider";
import CustomerTrackingProvider from "@/components/CustomerTrackingProvider";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import OfflineBanner from "@/components/ui/OfflineBanner";
import ToastProvider from "@/components/ui/ToastProvider";
import ChatFab from "@/components/ui/ChatFab";

function NotificationHandler() {
  const router = useRouter();
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    registerForPushNotifications();

    cleanupRef.current = addResponseListener((data) => {
      const route = parseNotificationRoute(data);
      if (route) {
        router.push(route.screen as any);
      }
    });

    return () => {
      cleanupRef.current?.();
    };
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <NetworkProvider>
          <SafeAreaProvider>
            <StripeProvider
              publishableKey={STRIPE_KEY}
              merchantIdentifier="merchant.com.wabbus.mobile"
            >
              <AuthProvider>
                <CartProvider>
                <NotificationHandler />
                <CustomerTrackingProvider />
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
      </QueryProvider>
    </ErrorBoundary>
  );
}
