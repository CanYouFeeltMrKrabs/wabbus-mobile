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
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { NetworkProvider } from "@/lib/network";
import { STRIPE_KEY, API_BASE } from "@/lib/config";
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

const AFFILIATE_CODE_KEY = "wabbus_affiliate_code";
const AFFILIATE_CODE_SET_AT_KEY = "wabbus_affiliate_code_set_at";
const AFFILIATE_CODE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const AFFILIATE_REF_RE = /^[A-Z0-9]{4,20}$/;

function extractRefCode(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const ref = parsed.queryParams?.ref;
    if (typeof ref !== "string") return null;
    const upper = ref.toUpperCase();
    return AFFILIATE_REF_RE.test(upper) ? upper : null;
  } catch {
    return null;
  }
}

async function captureAffiliateCode(code: string): Promise<void> {
  try {
    const existingSetAt = await AsyncStorage.getItem(AFFILIATE_CODE_SET_AT_KEY);
    if (existingSetAt) {
      const age = Date.now() - parseInt(existingSetAt, 10);
      if (age < AFFILIATE_CODE_MAX_AGE_MS) return;
    }

    await AsyncStorage.setItem(AFFILIATE_CODE_KEY, code);
    await AsyncStorage.setItem(AFFILIATE_CODE_SET_AT_KEY, String(Date.now()));

    if (API_BASE) {
      void fetch(`${API_BASE}/affiliate/click`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: code }),
      }).catch(() => {});
    }
  } catch { /* silent */ }
}

function AffiliateDeepLinkHandler() {
  const processedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    function handleUrl(url: string) {
      const code = extractRefCode(url);
      if (!code || processedRef.current.has(code)) return;
      processedRef.current.add(code);
      void captureAffiliateCode(code);
    }

    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    }).catch(() => {});

    const sub = Linking.addEventListener("url", (event) => {
      handleUrl(event.url);
    });

    return () => sub.remove();
  }, []);

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
                    <AffiliateDeepLinkHandler />
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
