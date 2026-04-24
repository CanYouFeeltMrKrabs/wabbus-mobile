import "@/i18n";
import { initSentry } from "@/lib/sentry";

initSentry();

import { useCallback, useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
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
import OTAUpdatePrompt from "@/components/OTAUpdatePrompt";

try { SplashScreen.preventAutoHideAsync(); } catch { }

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
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const onLayoutReady = useCallback(() => {
    if (fontsLoaded || fontError) {
      try { SplashScreen.hideAsync(); } catch { }
    }
  }, [fontsLoaded, fontError]);

  // Safety net: if onLayout doesn't fire (or fires before fonts load),
  // useEffect guarantees we still hide the splash once fonts resolve.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      try { SplashScreen.hideAsync(); } catch { }
    }
  }, [fontsLoaded, fontError]);

  // Do NOT render the tree until fonts are ready. This ensures onLayout
  // fires AFTER fontsLoaded is true, so the splash hides on first layout.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }} onLayout={onLayoutReady}>
      <ErrorBoundary>
        <QueryProvider>
          <NetworkProvider>
            <SafeAreaProvider>
              <StripeProvider
                publishableKey={STRIPE_KEY}
                merchantIdentifier="merchant.com.wabbus.mobile"
                urlScheme="wabbus"
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
                      <Stack.Screen name="shop" />
                      <Stack.Screen name="search" />
                      <Stack.Screen name="(auth)" options={{ presentation: "modal" }} />
                      <Stack.Screen name="checkout" options={{ presentation: "fullScreenModal" }} />
                      <Stack.Screen name="order-complete" />
                      {__DEV__ && <Stack.Screen name="impersonate" options={{ headerShown: false }} />}
                    </Stack>
                    <OTAUpdatePrompt />
                    <ToastProvider />
                    <OfflineBanner />
                  </CartProvider>
                </AuthProvider>
              </StripeProvider>
            </SafeAreaProvider>
          </NetworkProvider>
        </QueryProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
