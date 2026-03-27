import React, { useEffect, useState } from "react";
import { View, ScrollView, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { FALLBACK_IMAGE } from "@/lib/config";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { Order, OrderItem } from "@/lib/types";

export default function OrderCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(!!orderId);

  useEffect(() => {
    if (!orderId) return;
    customerFetch<Order>(`/orders/${orderId}`)
      .then(setOrder)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.checkCircle}>
            <Icon name="check" size={48} color={colors.white} />
          </View>
          <AppText variant="heading" align="center" style={s.title}>
            Order Placed!
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={s.subtitle}>
            Thank you for shopping with Wabbus. You'll receive a confirmation email shortly.
          </AppText>
        </View>

        {loading && (
          <ActivityIndicator size="small" color={colors.brandBlue} style={{ marginTop: spacing[4] }} />
        )}

        {order && (
          <View style={s.orderCard}>
            <View style={s.orderHeader}>
              <AppText variant="label">Order #{order.publicId?.slice(0, 8) ?? orderId?.slice(0, 8)}</AppText>
              <View style={s.statusBadge}>
                <AppText variant="tiny" color={colors.brandBlue} weight="bold">
                  {order.status?.replace(/_/g, " ") ?? "PLACED"}
                </AppText>
              </View>
            </View>

            {order.items?.map((item: OrderItem) => (
              <View key={item.publicId} style={s.itemRow}>
                <Image
                  source={{ uri: item.image || FALLBACK_IMAGE }}
                  style={s.itemImg}
                  resizeMode="cover"
                />
                <View style={s.itemInfo}>
                  <AppText variant="caption" numberOfLines={2}>{item.title}</AppText>
                  <AppText variant="tiny" color={colors.muted}>
                    Qty: {item.quantity} · {formatMoney(item.unitPriceCents * item.quantity)}
                  </AppText>
                </View>
              </View>
            ))}

            <View style={s.totalRow}>
              <AppText variant="subtitle">Total</AppText>
              <AppText variant="subtitle" color={colors.brandBlue}>
                {formatMoney(order.totalCents)}
              </AppText>
            </View>
          </View>
        )}

        <View style={s.actions}>
          <AppButton
            title="View Orders"
            variant="primary"
            fullWidth
            onPress={() => router.replace("/orders")}
            style={s.btn}
          />
          <AppButton
            title="Continue Shopping"
            variant="outline"
            fullWidth
            onPress={() => router.replace("/")}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: {
    paddingHorizontal: spacing[6],
    paddingBottom: spacing[10],
    alignItems: "center",
  },
  hero: {
    alignItems: "center",
    paddingTop: spacing[16],
    paddingBottom: spacing[6],
  },
  checkCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing[5],
    ...shadows.lg,
  },
  title: { marginBottom: spacing[2] },
  subtitle: { maxWidth: 280 },

  orderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    width: "100%",
    ...shadows.sm,
  },
  orderHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: spacing[3],
    paddingBottom: spacing[3],
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  statusBadge: {
    backgroundColor: colors.brandBlueLight,
    paddingHorizontal: spacing[2], paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
  itemRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: spacing[2],
  },
  itemImg: {
    width: 48, height: 48, borderRadius: borderRadius.md,
    marginRight: spacing[3],
  },
  itemInfo: { flex: 1 },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    marginTop: spacing[3], paddingTop: spacing[3],
  },

  actions: {
    width: "100%",
    marginTop: spacing[6],
  },
  btn: { marginBottom: spacing[3] },
});
