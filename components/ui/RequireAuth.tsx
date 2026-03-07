/**
 * RequireAuth — wraps screens that require authentication.
 * Shows a loading spinner while auth is resolving, redirects to login
 * if unauthenticated, renders children if authenticated.
 * Matches the web's RequireAuth component behavior.
 */
import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth, type AuthStatus } from "@/lib/auth";
import { colors } from "@/lib/theme";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function RequireAuth({ children, fallback }: Props) {
  const router = useRouter();
  const { authStatus } = useAuth();

  React.useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.replace("/(auth)/login");
    }
  }, [authStatus, router]);

  if (authStatus === "loading") {
    return (
      fallback ?? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
        </View>
      )
    );
  }

  if (authStatus !== "authenticated") {
    return null;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
});
