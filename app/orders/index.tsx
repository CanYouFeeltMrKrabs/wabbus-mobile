import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { Order } from "@/lib/types";

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = useCallback(async () => {
    if (!isLoggedIn) { setLoading(false); return; }
    try {
      const data = await customerFetch<Order[]>("/orders");
      setOrders(Array.isArray(data) ? data : []);
    } catch {
      setOrders([]);
    }
    setLoading(false);
  }, [isLoggedIn]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  if (!isLoggedIn) {
    return (
      <View style={[styles.empty, { paddingTop: insets.top }]}>
        <Icon name="receipt-long" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>Sign in to view your orders</AppText>
        <AppButton title="Sign In" variant="primary" onPress={() => router.push("/(auth)/login")} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">My Orders</AppText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : orders.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="receipt-long" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>No orders yet</AppText>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.publicId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: order }) => (
            <Pressable
              style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.9 }]}
              onPress={() => router.push(`/orders/${order.publicId}`)}
            >
              <View style={styles.orderRow}>
                <AppText variant="label">Order #{order.publicId.slice(0, 8)}</AppText>
                <View style={[styles.statusBadge, { backgroundColor: order.status === "DELIVERED" ? colors.successLight : colors.brandBlueLight }]}>
                  <AppText variant="tiny" color={order.status === "DELIVERED" ? colors.success : colors.brandBlue} weight="bold">
                    {order.status.replace(/_/g, " ")}
                  </AppText>
                </View>
              </View>
              <View style={styles.orderRow}>
                <AppText variant="caption">{new Date(order.createdAt).toLocaleDateString()}</AppText>
                <AppText variant="priceSmall">{formatMoney(order.totalCents)}</AppText>
              </View>
              <AppText variant="caption" style={styles.itemCount}>
                {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
              </AppText>
            </Pressable>
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
  orderCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4],
    marginBottom: spacing[3], ...shadows.sm,
  },
  orderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing[1] },
  statusBadge: { paddingHorizontal: spacing[2], paddingVertical: spacing[0.5], borderRadius: borderRadius.sm },
  itemCount: { marginTop: spacing[1] },
});
