import React, { useEffect, useState } from "react";
import { View, ScrollView, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { formatDate } from "@/lib/orderHelpers";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { OrderItem } from "@/lib/types";

type OrderResponse = {
  id: number;
  publicId?: string;
  orderNumber?: string | null;
  status: string;
  totalCents: number;
  totalAmount?: string | number | null;
  currency?: string;
  createdAt: string;
  items?: OrderItem[];
};

export default function OrderCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [loading, setLoading] = useState(!!orderId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("No order reference found.");
      setLoading(false);
      return;
    }

    customerFetch<OrderResponse>(`/orders/${encodeURIComponent(orderId)}`)
      .then((data) => {
        setOrder(data);
        setError(null);
      })
      .catch(() => {
        setError("Your order was placed successfully, but we couldn't load the details right now.");
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  const orderDisplayId = order?.orderNumber || order?.publicId || orderId || "";

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
        <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[3] }}>
          Loading order…
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
              title="View Orders"
              variant="primary"
              fullWidth
              onPress={() => router.replace(ROUTES.orders)}
              style={s.btn}
            />
            <AppButton
              title="Continue Shopping"
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
            Order Placed!
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={s.subtitle}>
            Thank you for shopping with Wabbus. You'll receive a confirmation email shortly.
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
                  Order Number
                </AppText>
                <AppText variant="label" style={{ marginTop: spacing[0.5] }}>
                  {orderDisplayId}
                </AppText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <AppText variant="tiny" color={colors.muted} weight="bold" style={{ textTransform: "uppercase", letterSpacing: 1 }}>
                  Date
                </AppText>
                <AppText variant="caption" style={{ marginTop: spacing[0.5] }}>
                  {formatDate(order.createdAt)}
                </AppText>
              </View>
            </View>

            {order.items?.map((item: OrderItem) => (
              <View key={item.publicId} style={s.itemRow}>
                <Image
                  source={{ uri: productImageUrl(item.image, "thumb") }}
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

        {/* Post-purchase recommendations — uses correct context=post_purchase endpoint */}
        {order && (
          <View style={s.recsSection}>
            <ProductRecommendationSlider
              title="Based on Your Purchase"
              apiUrl={`/recommendations?context=post_purchase&orderId=${encodeURIComponent(String(order.id))}&take=10`}
              accentColor={colors.success}
            />
          </View>
        )}

        <View style={s.actions}>
          <AppButton
            title="View Orders"
            variant="primary"
            fullWidth
            onPress={() => router.replace(ROUTES.orders)}
            style={s.btn}
          />
          <AppButton
            title="Continue Shopping"
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
