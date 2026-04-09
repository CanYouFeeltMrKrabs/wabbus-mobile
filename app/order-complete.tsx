import React, { useEffect } from "react";
import { View, ScrollView, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { formatDate, pickItemTitle, pickItemImage, pickUnitPriceCents, orderTotalCents } from "@/lib/orderHelpers";
import { ROUTES } from "@/lib/routes";
import { trackEvent } from "@/lib/tracker";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { OrderItem } from "@/lib/types";

type OrderResponse = {
  publicId?: string;
  orderNumber?: string | null;
  status: string;
  totalAmount?: string | number | null;
  currency?: string | null;
  createdAt: string;
  items?: OrderItem[] | null;
};

export default function OrderCompleteScreen() {
  return (
    <RequireAuth>
      <OrderCompleteContent />
    </RequireAuth>
  );
}

function OrderCompleteContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();

  useEffect(() => {
    if (orderId) void trackEvent("purchase", { metadata: { orderId } });
  }, [orderId]);

  const { data: order, isLoading: loading, isError } = useQuery({
    queryKey: queryKeys.orders.detail(orderId!),
    queryFn: () => customerFetch<OrderResponse>(`/orders/${encodeURIComponent(orderId!)}`),
    enabled: !!orderId,
  });

  const error = !orderId
    ? t("orderComplete.noOrderRef")
    : isError
      ? t("orderComplete.couldntLoadDetails")
      : null;

  const orderDisplayId = order?.orderNumber || order?.publicId || orderId || "";

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
        <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {t("orderComplete.loading")}
        </AppText>
      </View>
    );
  }

  if (error && !order) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.hero}>
            <View style={[s.checkCircle, { backgroundColor: colors.brandOrange }]}>
              <Icon name="info" size={48} color={colors.white} />
            </View>
            <AppText variant="body" color={colors.muted} align="center" style={s.subtitle}>
              {error}
            </AppText>
          </View>
          <View style={s.actions}>
            <AppButton
              title={t("orderComplete.viewOrders")}
              variant="primary"
              fullWidth
              onPress={() => router.replace(ROUTES.orders)}
              style={s.btn}
            />
            <AppButton
              title={t("orderComplete.continueShopping")}
              variant="outline"
              fullWidth
              onPress={() => router.replace(ROUTES.homeFeed)}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={s.checkCircle}>
            <Icon name="check" size={48} color={colors.white} />
          </View>
          <AppText variant="heading" align="center" style={s.title}>
            {t("orderComplete.successTitle")}
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={s.subtitle}>
            {t("orderComplete.thankYou")}
          </AppText>
        </View>

        {error && (
          <View style={s.errorBanner}>
            <Icon name="info" size={18} color={colors.brandOrange} />
            <AppText variant="caption" color={colors.brandOrange} style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        )}

        {order && (
          <View style={s.orderCard}>
            <View style={s.orderHeader}>
              <View>
                <AppText variant="tiny" color={colors.muted} weight="bold" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                  {t("orderComplete.orderNumber")}
                </AppText>
                <AppText variant="label" style={{ marginTop: spacing[0.5] }}>
                  {orderDisplayId}
                </AppText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <AppText variant="tiny" color={colors.muted} weight="bold" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                  {t("orderComplete.date")}
                </AppText>
                <AppText variant="caption" style={{ marginTop: spacing[0.5] }}>
                  {formatDate(order.createdAt)}
                </AppText>
              </View>
            </View>

            {order.items?.map((item: OrderItem, idx: number) => (
              <View key={item.publicId ?? idx} style={s.itemRow}>
                <Image
                  source={{ uri: productImageUrl(pickItemImage(item), "thumb") }}
                  style={s.itemImg}
                  resizeMode="cover"
                />
                <View style={s.itemInfo}>
                  <AppText variant="caption" numberOfLines={2}>{pickItemTitle(item)}</AppText>
                  <AppText variant="tiny" color={colors.muted}>
                    {t("orderComplete.qtyAndPrice", { qty: item.quantity ?? 0, price: formatMoney(pickUnitPriceCents(item) * (item.quantity ?? 0)) })}
                  </AppText>
                </View>
              </View>
            ))}

            <View style={s.totalRow}>
              <AppText variant="subtitle">{t("orderComplete.total")}</AppText>
              <AppText variant="subtitle" color={colors.brandBlue}>
                {formatMoney(orderTotalCents(order))}
              </AppText>
            </View>
          </View>
        )}

        {/* Post-purchase recommendations — uses correct context=post_purchase endpoint */}
        {order && (
          <View style={s.recsSection}>
            <ProductRecommendationSlider
              title={t("orderComplete.basedOnYourPurchase")}
              apiUrl={`/recommendations?context=post_purchase&orderId=${encodeURIComponent(order.publicId ?? orderId ?? "")}&take=10`}
              queryKey={queryKeys.recommendations.postPurchase(order.publicId ?? orderId ?? "")}
              accentColor={colors.success}
            />
          </View>
        )}

        <View style={s.actions}>
          <AppButton
            title={t("orderComplete.viewOrders")}
            variant="primary"
            fullWidth
            onPress={() => router.replace(ROUTES.orders)}
            style={s.btn}
          />
          <AppButton
            title={t("orderComplete.continueShopping")}
            variant="outline"
            fullWidth
            onPress={() => router.replace(ROUTES.homeFeed)}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
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
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    backgroundColor: "#fff7ed",
    borderRadius: borderRadius.lg, padding: spacing[3],
    width: "100%", marginBottom: spacing[4],
  },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    width: "100%",
    ...shadows.sm,
  },
  orderHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: spacing[3],
    paddingBottom: spacing[3],
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
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
  recsSection: { width: "100%", marginTop: spacing[4] },
  actions: {
    width: "100%",
    marginTop: spacing[6],
  },
  btn: { marginBottom: spacing[3] },
});
