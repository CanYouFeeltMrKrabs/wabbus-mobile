import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { Address } from "@/lib/types";

export default function AddressesScreen() {
  return <RequireAuth><AddressesContent /></RequireAuth>;
}

function AddressesContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await customerFetch<Address[]>("/customer-addresses");
      setAddresses(Array.isArray(data) ? data : []);
    } catch { setAddresses([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Addresses</AppText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : addresses.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="location-off" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>No saved addresses</AppText>
        </View>
      ) : (
        <FlatList
          data={addresses}
          keyExtractor={(a) => a.publicId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.isDefault && (
                <View style={styles.defaultBadge}>
                  <AppText variant="tiny" color={colors.brandBlue} weight="bold">DEFAULT</AppText>
                </View>
              )}
              <AppText variant="label">{item.fullName}</AppText>
              <AppText variant="body" color={colors.muted}>{item.line1}{item.line2 ? `, ${item.line2}` : ""}</AppText>
              <AppText variant="body" color={colors.muted}>{item.city}, {item.state} {item.zip}</AppText>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  card: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[3], ...shadows.sm },
  defaultBadge: { backgroundColor: colors.brandBlueLight, paddingHorizontal: spacing[2], paddingVertical: spacing[0.5], borderRadius: borderRadius.sm, alignSelf: "flex-start", marginBottom: spacing[2] },
});
