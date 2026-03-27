/**
 * Redirect screen: resolves legacy internal product IDs → public product page.
 * Mirrors the web's /product/[id]/page.tsx server-side redirect.
 */
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import { publicFetch } from "@/lib/api";
import { colors, spacing } from "@/lib/theme";

export default function ProductRedirectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) {
      setError(true);
      return;
    }
    const numericId = Number(id);

    if (Number.isFinite(numericId)) {
      publicFetch<{ productId?: string; slug?: string }>(
        `/products/public/by-internal-id/${numericId}`,
      )
        .then(({ productId }) => {
          if (productId) {
            router.replace(`/(tabs)/product/${productId}` as any);
          } else {
            setError(true);
          }
        })
        .catch(() => setError(true));
    } else {
      router.replace(`/(tabs)/product/${id}` as any);
    }
  }, [id]);

  if (error) {
    return (
      <View style={styles.center}>
        <AppText variant="subtitle" color={colors.muted}>Product not found</AppText>
        <AppButton title="Go Home" variant="outline" onPress={() => router.replace("/")} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.brandBlue} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
