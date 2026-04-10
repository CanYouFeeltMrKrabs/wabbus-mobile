import React from "react";
import { View, ScrollView, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { formatDate, pickItemTitle, pickItemImage, pickUnitPriceCents, orderTotalCents } from "@/lib/orderHelpers";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { Order, OrderItem } from "@/lib/types";

type OrderItemCaseEntry = { caseNumber: string };

function orderItemHasCase(
  item: OrderItem
): item is OrderItem & { caseItems: OrderItemCaseEntry[] } {
  const raw = item as OrderItem & { caseItems?: OrderItemCaseEntry[] };
  return (
    Array.isArray(raw.caseItems) &&
    raw.caseItems.length > 0 &&
    Boolean(raw.caseItems[0]?.caseNumber)
  );
}

function orderHasAnyCase(items: OrderItem[] | undefined): boolean {
  return items?.some(orderItemHasCase) ?? false;
}

function firstCaseNumberFromOrder(items: OrderItem[] | undefined): string | undefined {
  const found = items?.find(orderItemHasCase);
  return found?.caseItems[0]?.caseNumber;
}

export default function OrderDetailScreen() {
  return <RequireAuth><OrderDetailContent /></RequireAuth>;
}

function OrderDetailContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: order, isLoading: loading } = useQuery({
    queryKey: queryKeys.orders.detail(id!),
    queryFn: () => customerFetch<Order>(`/orders/${id}`),
    enabled: !!id,
  });

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
        <AppText variant="subtitle" color={colors.muted}>{t("orders.notFound")}</AppText>
        <AppButton title={t("orders.goBack")} variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("orders.orderHeading", { id: (order.publicId ?? "").slice(0, 8) })}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status */}
        <View style={styles.statusCard}>
          <AppText variant="label">{t("orders.status")}</AppText>
          <AppText variant="subtitle" color={colors.brandBlue}>{order.status.replace(/_/g, " ")}</AppText>
          <AppText variant="caption" style={styles.date}>{t("orders.placedDate", { date: formatDate(order.createdAt) })}</AppText>
        </View>

        {/* Items */}
        <AppText variant="subtitle" style={styles.sectionTitle}>{t("orders.itemsTitle")}</AppText>
        {order.items?.map((item: OrderItem, idx: number) => (
          <View key={item.publicId ?? idx} style={styles.itemCard}>
            <Image source={{ uri: productImageUrl(pickItemImage(item), "thumb") }} style={styles.itemImg} resizeMode="cover" />
            <View style={styles.itemInfo}>
              <AppText variant="label" numberOfLines={2}>{pickItemTitle(item)}</AppText>
              <AppText variant="caption">{t("orders.qtyLabel", { count: item.quantity ?? 0 })}</AppText>
              <AppText variant="priceSmall">{formatMoney(pickUnitPriceCents(item) * (item.quantity ?? 0))}</AppText>
            </View>
          </View>
        ))}

        {/* Total */}
        <View style={styles.totalCard}>
          <View style={styles.totalRow}>
            <AppText variant="subtitle">{t("orders.total")}</AppText>
            <AppText variant="price">{formatMoney(orderTotalCents(order))}</AppText>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsSection}>
          {["PAID", "SHIPPED", "DELIVERED"].includes(order.status) && (
            <AppButton
              title={t("orders.trackPackage")}
              variant="primary"
              fullWidth
              icon="local-shipping"
              onPress={() => router.push(ROUTES.orderTracking(id))}
              style={styles.actionBtn}
            />
          )}
          {order.status === "PAID" && (
            <AppButton
              title={t("orders.cancelItems")}
              variant="danger"
              fullWidth
              icon="close-circle"
              onPress={() => router.push(ROUTES.orderCancel(id))}
              style={styles.actionBtn}
            />
          )}
          {order.status === "DELIVERED" && (
            <>
              <AppButton
                title={t("orders.returnItems")}
                variant="outline"
                fullWidth
                icon="package-variant"
                onPress={() => router.push(ROUTES.orderReturn(id))}
                style={styles.actionBtn}
              />
              <AppButton
                title={t("orders.writeReview")}
                variant="outline"
                fullWidth
                icon="star"
                onPress={() => router.push(ROUTES.orderReview(id))}
                style={styles.actionBtn}
              />
            </>
          )}
          {["PAID", "SHIPPED", "DELIVERED"].includes(order.status) && (
            <AppButton
              title={t("orders.missingPackage")}
              variant="ghost"
              fullWidth
              icon="package-variant-closed-remove"
              onPress={() => router.push(ROUTES.orderMissing(id))}
              style={styles.actionBtn}
            />
          )}
          {orderHasAnyCase(order.items) && (
            <AppButton
              title={t("orders.viewCase")}
              variant="outline"
              fullWidth
              icon="policy"
              onPress={() => {
                const caseNumber = firstCaseNumberFromOrder(order.items);
                if (caseNumber) router.push(ROUTES.orderCase(id, caseNumber));
              }}
              style={styles.actionBtn}
            />
          )}
          {order.status === "DELIVERED" && !orderHasAnyCase(order.items) && (
            <AppButton
              title={t("orders.reportProblem")}
              variant="outline"
              fullWidth
              icon="report-problem"
              onPress={() => router.push(ROUTES.supportTicket)}
              style={styles.actionBtn}
            />
          )}
          <AppButton
            title={t("orders.messageSeller")}
            variant="ghost"
            fullWidth
            icon="message-text"
            onPress={() => router.push(ROUTES.supportMessageSeller(id))}
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
