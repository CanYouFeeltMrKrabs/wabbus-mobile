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
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { formatDate, pickItemTitle, pickItemImage, pickUnitPriceCents, orderTotalCents } from "@/lib/orderHelpers";
import { useOrderDetail, useRecommendationsPostPurchase } from "@/lib/queries";
import { ROUTES } from "@/lib/routes";
import { trackEvent } from "@/lib/tracker";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { OrderItem, PublicProduct } from "@/lib/types";

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

  // Sealed-layer migration (plan §3.2 — orders.detail caller, §4b —
  // recommendations.postPurchase caller). Both reads now go through
  // typed hooks; no direct queryKeys/useQuery imports remain.
  const { data: order, isLoading: loading, isError } = useOrderDetail(orderId);

  // Post-purchase recommendations rail. The hook gates on truthy orderId
  // internally, so passing the canonical publicId-or-fallback identity
  // here is safe — undefined just disables the query.
  const postPurchaseId = order?.publicId ?? orderId;
  const postPurchase = useRecommendationsPostPurchase(postPurchaseId);

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
      <View style={s.screen}>
        <ScrollView contentContainerStyle={[s.contentWrapper, { paddingTop: insets.top + spacing[16] }]}>
          <View style={[s.center, { marginBottom: spacing[6] }]}>
            <View style={[s.checkCircle, { backgroundColor: colors.brandOrange }]}>
              <Icon name="info" size={36} color={colors.white} />
            </View>
            <AppText variant="body" color={colors.muted} align="center" style={s.subtitle}>
              {error}
            </AppText>
          </View>
          <View style={s.actions}>
            <AppButton
              title={t("orderComplete.viewOrders")}
              variant="accent"
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
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[s.banner, { paddingTop: insets.top + spacing[6] }]}>
          <View style={s.checkCircle}>
            <Icon name="check" size={36} color={colors.white} />
          </View>
          <AppText variant="heading" color={colors.white} align="center" style={s.title}>
            {t("orderComplete.successTitle")}
          </AppText>
          <AppText variant="body" color="rgba(255,255,255,0.8)" align="center" style={s.subtitle}>
            {t("orderComplete.thankYou")}
          </AppText>
        </View>

        <View style={s.contentWrapper}>
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

              {order.items?.map((item: OrderItem, idx: number) => {
                const img = pickItemImage(item);
                const title = pickItemTitle(item);
                const unitPrice = formatMoney(pickUnitPriceCents(item));
                const itemTotal = formatMoney(pickUnitPriceCents(item) * (item.quantity ?? 0));
                
                return (
                  <View key={item.publicId ?? idx} style={s.itemRow}>
                    <View style={s.itemImgContainer}>
                      {img ? (
                        <Image
                          source={{ uri: productImageUrl(img, "thumb") }}
                          style={s.itemImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <Icon name="shopping-bag" size={24} color={colors.slate300} />
                      )}
                    </View>
                    <View style={s.itemInfo}>
                      <AppText variant="caption" weight="semibold" numberOfLines={2} style={s.itemTitle}>{title}</AppText>
                      <View style={s.itemMeta}>
                        <View style={s.qtyBadge}>
                          <AppText variant="tiny" color={colors.foreground}>
                            {t("orderComplete.qty", { qty: item.quantity ?? 0 })}
                          </AppText>
                        </View>
                        <AppText variant="tiny" color={colors.muted}>
                          {unitPrice}
                        </AppText>
                      </View>
                      <AppText variant="caption" weight="bold">
                        {itemTotal}
                      </AppText>
                    </View>
                  </View>
                );
              })}

              <View style={s.totalRow}>
                <AppText variant="subtitle" color={colors.muted}>{t("orderComplete.total")}</AppText>
                <AppText variant="subtitle" color={colors.foreground}>
                  {formatMoney(orderTotalCents(order))}
                </AppText>
              </View>
            </View>
          )}

          {/* Post-purchase recommendations */}
          {order && (
            <View style={s.recsSection}>
              <ProductRecommendationSlider
                title={t("orderComplete.basedOnYourPurchase")}
                products={postPurchase.data as PublicProduct[] | undefined}
                loading={postPurchase.isPending}
                accentColor={colors.success}
              />
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={[s.stickyBottom, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <AppButton
          title={t("orderComplete.continueShopping")}
          variant="primary"
          fullWidth
          onPress={() => router.replace(ROUTES.homeFeed)}
          style={s.btn}
        />
        <AppButton
          title={t("orderComplete.viewOrders")}
          variant="accent"
          fullWidth
          onPress={() => router.replace(ROUTES.orders)}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  scrollContent: { paddingBottom: 128 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  banner: {
    backgroundColor: colors.brandBlue,
    paddingBottom: spacing[12],
    paddingHorizontal: spacing[6],
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
  },
  contentWrapper: {
    paddingHorizontal: spacing[4],
    marginTop: -spacing[8], // Overlaps the bottom of the banner
  },
  checkCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.success,
    alignItems: "center", justifyContent: "center",
    marginBottom: spacing[4],
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
    ...shadows.md,
  },
  title: { marginBottom: spacing[2] },
  subtitle: { maxWidth: 300, marginBottom: spacing[2] },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    backgroundColor: "#fff7ed",
    borderRadius: borderRadius.lg, padding: spacing[3],
    width: "100%", marginBottom: spacing[4],
  },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    width: "100%",
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  orderHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: spacing[4],
    paddingBottom: spacing[4],
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  itemRow: {
    flexDirection: "row", alignItems: "center",
    marginBottom: spacing[4],
  },
  itemImgContainer: {
    width: 64, height: 64, borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    marginRight: spacing[3],
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.borderLight,
    overflow: "hidden",
  },
  itemImg: {
    width: "100%", height: "100%",
  },
  itemInfo: { flex: 1 },
  itemTitle: { marginBottom: spacing[1] },
  itemMeta: {
    flexDirection: "row", alignItems: "center",
    gap: spacing[2], marginBottom: spacing[1],
  },
  qtyBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    marginTop: spacing[2], paddingTop: spacing[4],
    borderStyle: "dashed",
  },
  recsSection: { width: "100%", marginTop: spacing[6] },
  stickyBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actions: { width: "100%", marginTop: spacing[6] },
  btn: { marginBottom: spacing[3] },
});

