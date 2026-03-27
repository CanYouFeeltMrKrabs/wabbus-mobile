import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StripeProvider } from "@stripe/stripe-react-native";
import { AuthProvider } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
import { STRIPE_KEY } from "@/lib/config";
import { colors } from "@/lib/theme";
import ToastProvider from "@/components/ui/ToastProvider";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StripeProvider
        publishableKey={STRIPE_KEY}
        merchantIdentifier="merchant.com.wabbus.mobile"
      >
        <AuthProvider>
          <CartProvider>
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
            <ToastProvider />
          </CartProvider>
        </AuthProvider>
      </StripeProvider>
    </SafeAreaProvider>
  );
}
