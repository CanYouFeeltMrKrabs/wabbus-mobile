import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import StarRating from "@/components/ui/StarRating";
import Icon from "@/components/ui/Icon";
import { publicFetch } from "@/lib/api";
import { useVendorReviews, useVendorReviewsSummary } from "@/lib/queries";
import { formatDate } from "@/lib/orderHelpers";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type Review = {
  publicId: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  customerName?: string | null;
  createdAt: string;
  product?: { title?: string | null } | null;
};

type ReviewSummary = {
  ratingAvg: number;
  reviewCount: number;
  distribution: Record<number, number>;
};

const PAGE_LIMIT = 20;

export default function VendorReviewsScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: reviewsData, isLoading: reviewsLoading } = useVendorReviews(id);
  const { data: summary } = useVendorReviewsSummary(id);

  const initialReviews = reviewsData?.reviews ?? [];
  const initialCursor = reviewsData?.nextCursor ?? null;

  const [extraReviews, setExtraReviews] = useState<Review[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setCursor(initialCursor);
    setExtraReviews([]);
  }, [initialCursor]);

  const reviews = useMemo(() => [...initialReviews, ...extraReviews], [initialReviews, extraReviews]);
  const loading = reviewsLoading;

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || !id) return;
    setLoadingMore(true);
    try {
      const res = await publicFetch<any>(`/public/vendors/by-public-id/${id}/reviews?limit=${PAGE_LIMIT}&cursor=${encodeURIComponent(cursor)}`);
      const data = res?.data ?? (Array.isArray(res) ? res : []);
      setExtraReviews((prev) => [...prev, ...data]);
      setCursor(res?.nextCursor ?? null);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, id]);

  const maxCount = summary ? Math.max(...Object.values(summary.distribution), 1) : 1;

  const renderReview = ({ item }: { item: Review }) => (
    <View style={st.reviewCard}>
      <View style={st.reviewHeader}>
        <StarRating rating={item.rating} size={14} />
        <AppText variant="tiny" color={colors.muted}>{formatDate(item.createdAt)}</AppText>
      </View>
      {item.title && <AppText variant="label" style={{ marginTop: spacing[1] }}>{item.title}</AppText>}
      {item.body && <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[1] }}>{item.body}</AppText>}
      <View style={st.reviewMeta}>
        {item.customerName && <AppText variant="tiny" color={colors.gray400}>{item.customerName}</AppText>}
        {item.product?.title && (
          <AppText variant="tiny" color={colors.gray400} numberOfLines={1}>• {item.product.title}</AppText>
        )}
      </View>
    </View>
  );

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("vendor.reviewsHeading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
        </View>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.publicId}
          renderItem={renderReview}
          contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[10] }}
          ListHeaderComponent={
            summary ? (
              <View style={st.summaryCard}>
                <View style={st.summaryTop}>
                  <View style={{ alignItems: "center" }}>
                    <AppText style={{ fontSize: 36, fontWeight: "800", color: colors.foreground }}>
                      {summary.ratingAvg.toFixed(1)}
                    </AppText>
                    <StarRating rating={summary.ratingAvg} size={18} />
                    <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[1] }}>
                      {t("vendor.reviewCount", { count: summary.reviewCount })}
                    </AppText>
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing[6] }}>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = summary.distribution[star] ?? 0;
                      const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                      return (
                        <View key={star} style={st.distRow}>
                          <AppText variant="tiny" color={colors.muted} style={{ width: 14, textAlign: "right" }}>{star}</AppText>
                          <Icon name="star" size={12} color="#facc15" />
                          <View style={st.distBarBg}>
                            <View style={[st.distBarFill, { width: `${pct}%` }]} />
                          </View>
                          <AppText variant="tiny" color={colors.gray400} style={{ width: 28, textAlign: "right" }}>{count}</AppText>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={st.center}>
              <Icon name="rate-review" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[2] }}>{t("vendor.noReviews")}</AppText>
            </View>
          }
          onEndReached={cursor ? loadMore : undefined}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ padding: spacing[4] }} color={colors.brandBlue} /> : null}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing[10] },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },

  summaryCard: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[4], ...shadows.sm },
  summaryTop: { flexDirection: "row", alignItems: "center" },
  distRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 3 },
  distBarBg: { flex: 1, height: 6, backgroundColor: colors.gray100, borderRadius: 3, overflow: "hidden" },
  distBarFill: { height: 6, backgroundColor: "#facc15", borderRadius: 3 },

  reviewCard: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[2], ...shadows.sm },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewMeta: { flexDirection: "row", gap: spacing[1], marginTop: spacing[2] },
});
