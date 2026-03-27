import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { API_BASE } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { colors, spacing } from "@/lib/theme";

export default function ImpersonateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing impersonation token.");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/customer-auth/exchange-impersonation-token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ token }),
          },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.message || `Exchange failed (${res.status})`,
          );
        }

        if (cancelled) return;

        await refresh();
        router.replace("/(tabs)");
      } catch (err: unknown) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to start impersonation session.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router, refresh]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {error ? (
        <View style={styles.card}>
          <Icon name="alert-circle" size={48} color={colors.error} />
          <AppText variant="title" style={styles.heading}>
            Impersonation Failed
          </AppText>
          <AppText
            variant="body"
            color={colors.error}
            align="center"
            style={styles.message}
          >
            {error}
          </AppText>
          <AppButton
            title="Go Home"
            variant="primary"
            onPress={() => router.replace("/(tabs)")}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
          <AppText
            variant="body"
            color={colors.muted}
            style={styles.message}
          >
            Starting impersonation session...
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  card: {
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: spacing[8],
    width: "100%",
    maxWidth: 340,
  },
  heading: { marginTop: spacing[4] },
  message: { marginTop: spacing[2], marginBottom: spacing[6] },
});
