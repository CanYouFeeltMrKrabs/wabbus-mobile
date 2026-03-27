import React, { useEffect, useState } from "react";
import { View, ScrollView, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { FALLBACK_IMAGE } from "@/lib/config";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { Order, OrderItem } from "@/lib/types";

export default function OrderDetailScreen() {
  return <RequireAuth><OrderDetailContent /></RequireAuth>;
}

function OrderDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    customerFetch<Order>(`/orders/${id}`)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>Order not found</AppText>
        <AppButton title="Go Back" variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Order #{order.publicId.slice(0, 8)}</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status */}
        <View style={styles.statusCard}>
          <AppText variant="label">Status</AppText>
          <AppText variant="subtitle" color={colors.brandBlue}>{order.status.replace(/_/g, " ")}</AppText>
          <AppText variant="caption" style={styles.date}>Placed {new Date(order.createdAt).toLocaleDateString()}</AppText>
        </View>

        {/* Items */}
        <AppText variant="subtitle" style={styles.sectionTitle}>Items</AppText>
        {order.items?.map((item: OrderItem) => (
          <View key={item.publicId} style={styles.itemCard}>
            <Image source={{ uri: item.image || FALLBACK_IMAGE }} style={styles.itemImg} resizeMode="cover" />
            <View style={styles.itemInfo}>
              <AppText variant="label" numberOfLines={2}>{item.title}</AppText>
              <AppText variant="caption">Qty: {item.quantity}</AppText>
              <AppText variant="priceSmall">{formatMoney(item.unitPriceCents * item.quantity)}</AppText>
            </View>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <AppText variant="subtitle">Total</AppText>
            <AppText variant="price">{formatMoney(order.totalCents)}</AppText>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {order.status === "PAID" && (
            <AppButton
              title="Cancel Items"
              variant="danger"
              fullWidth
              icon="close-circle"
              onPress={() => router.push(`/orders/${id}/cancel`)}
              style={styles.actionBtn}
            />
          )}
          {order.status === "DELIVERED" && (
            <>
              <AppButton
                title="Return Items"
                variant="outline"
                fullWidth
                icon="package-variant"
                onPress={() => router.push(`/orders/${id}/return`)}
                style={styles.actionBtn}
              />
              <AppButton
                title="Write a Review"
                variant="outline"
                fullWidth
                icon="star"
                onPress={() => router.push(`/orders/${id}/review`)}
                style={styles.actionBtn}
              />
            </>
          )}
          {["PAID", "SHIPPED", "DELIVERED"].includes(order.status) && (
            <AppButton
              title="Report Missing Package"
              variant="ghost"
              fullWidth
              icon="package-variant-closed-remove"
              onPress={() => router.push(`/orders/${id}/missing`)}
              style={styles.actionBtn}
            />
          )}
          <AppButton
            title="Message Seller"
            variant="ghost"
            fullWidth
            icon="message-text"
            onPress={() => router.push(`/support/message-seller/${id}`)}
            style={styles.actionBtn}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  statusCard: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[4], ...shadows.sm },
  date: { marginTop: spacing[1] },
  sectionTitle: { marginBottom: spacing[3] },
  itemCard: {
    flexDirection: "row", backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[3], marginBottom: spacing[2], gap: spacing[3], ...shadows.sm,
  },
  itemImg: { width: 72, height: 72, borderRadius: borderRadius.lg },
  itemInfo: { flex: 1, gap: spacing[0.5] },
  totalCard: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginTop: spacing[3], ...shadows.sm },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  actionsSection: { marginTop: spacing[6], gap: spacing[2] },
  actionBtn: {},
});
