import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { View, FlatList, Image, StyleSheet, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import ProductCard from "@/components/ui/ProductCard";
import Icon from "@/components/ui/Icon";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { publicFetch } from "@/lib/api";
import { vendorLogoUrl } from "@/lib/image";
import { formatDate } from "@/lib/orderHelpers";
import { useCart } from "@/lib/cart";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

import { PAGE_SIZE as PAGE_SIZES } from "@/lib/constants";

const PAGE_SIZE = PAGE_SIZES.PRODUCTS;

type VendorProfile = {
  publicId: string;
  name: string;
  slug?: string;
  shortBio?: string | null;
  logoUrl?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  locationCountry?: string | null;
  createdAt?: string;
};

function buildLocation(v: VendorProfile): string | null {
  const parts = [v.locationCity, v.locationState, v.locationCountry].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

type SortOption = { key: string; label: string };

const SORT_OPTIONS: SortOption[] = [
  { key: "newest", label: "vendor.sort.newest" },
  { key: "priceAsc", label: "vendor.sort.priceLow" },
  { key: "priceDesc", label: "vendor.sort.priceHigh" },
  { key: "rating", label: "vendor.sort.topRated" },
  { key: "reviews", label: "vendor.sort.mostReviews" },
];

function normalizeProducts(data: unknown): PublicProduct[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "products" in data) {
    return (data as any).products ?? [];
  }
  return [];
}

export default function VendorScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const [sort, setSort] = useState("newest");

  const { data: vendor, isLoading: vendorLoading } = useQuery({
    queryKey: queryKeys.vendors.detail(id!),
    queryFn: () => publicFetch<VendorProfile>(`/public/vendors/by-public-id/${id}`),
    enabled: !!id,
  });

  const { data: productsRaw, isLoading: productsLoading } = useQuery({
    queryKey: queryKeys.vendors.products(id!, { sort }),
    queryFn: () =>
      publicFetch<any>(`/products/public?vendorPublicId=${id}&take=${PAGE_SIZE}&skip=0&sortBy=${sort}`),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

  const baseProducts = useMemo(() => normalizeProducts(productsRaw), [productsRaw]);
  const totalCount =
    typeof productsRaw?.total === "number"
      ? productsRaw.total
      : typeof productsRaw?.totalCount === "number"
        ? productsRaw.totalCount
        : null;

  const [extraProducts, setExtraProducts] = useState<PublicProduct[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const skipRef = useRef(0);

  useEffect(() => {
    skipRef.current = baseProducts.length;
    setHasMore(baseProducts.length >= PAGE_SIZE);
    setExtraProducts([]);
  }, [baseProducts]);

  const products = useMemo(() => [...baseProducts, ...extraProducts], [baseProducts, extraProducts]);
  const loading = vendorLoading || productsLoading;

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore || !id) return;
    setLoadingMore(true);
    try {
      const data = await publicFetch<unknown>(
        `/products/public?vendorPublicId=${id}&take=${PAGE_SIZE}&skip=${skipRef.current}&sortBy=${sort}`,
      );
      const items = normalizeProducts(data);
      setExtraProducts((prev) => [...prev, ...items]);
      skipRef.current += items.length;
      setHasMore(items.length >= PAGE_SIZE);
    } catch {}
    setLoadingMore(false);
  }, [loadingMore, hasMore, id, sort]);

  const handleSortChange = useCallback(
    (newSort: string) => {
      if (newSort === sort) return;
      setSort(newSort);
    },
    [sort],
  );

  const handleAddToCart = useCallback(
    (product: PublicProduct) => {
      if (!product.defaultVariantPublicId) return;
      addToCart({
        variantPublicId: product.defaultVariantPublicId,
        price: product.price,
        title: product.title,
        image: product.image || "",
        productId: product.productId,
        slug: product.slug,
      });
    },
    [addToCart],
  );

  const goToReviews = useCallback(() => {
    if (id) router.push(ROUTES.vendorReviews(id));
  }, [id, router]);

  if (loading && !vendor) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ScrollView
          contentContainerStyle={styles.vendorSkeletonScroll}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonGrid count={6} />
        </ScrollView>
      </View>
    );
  }

  if (!vendor) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="store" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>{t("vendor.notFound")}</AppText>
        <AppButton title={t("vendor.goBack")} variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>
          {vendor.name}
        </AppText>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={products}
        numColumns={2}
        keyExtractor={(item) => item.productId}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        showsVerticalScrollIndicator={false}
        onEndReached={fetchMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View>
            {/* Vendor profile card */}
            <View style={styles.profileCard}>
              <View style={styles.profileRow}>
                <View style={styles.logoWrap}>
                  {vendor.logoUrl ? (
                    <Image source={{ uri: vendorLogoUrl(vendor.logoUrl) }} style={styles.logo} resizeMode="cover" />
                  ) : (
                    <Icon name="store" size={32} color={colors.muted} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="subtitle" weight="bold">{vendor.name}</AppText>
                  {vendor.shortBio ? (
                    <AppText variant="caption" color={colors.muted} numberOfLines={2} style={{ marginTop: spacing[0.5] }}>
                      {vendor.shortBio}
                    </AppText>
                  ) : null}
                </View>
              </View>

              <View style={styles.metaRow}>
                {buildLocation(vendor) && (
                  <View style={styles.metaItem}>
                    <Icon name="location-on" size={14} color={colors.muted} />
                    <AppText variant="tiny" color={colors.slate600}>{buildLocation(vendor)}</AppText>
                  </View>
                )}
                {vendor.createdAt && (
                  <View style={styles.metaItem}>
                    <Icon name="calendar-today" size={14} color={colors.muted} />
                    <AppText variant="tiny" color={colors.slate600}>
                      {t("vendor.joined", { date: formatDate(vendor.createdAt) })}
                    </AppText>
                  </View>
                )}
                {totalCount != null && totalCount > 0 && (
                  <View style={styles.metaItem}>
                    <Icon name="inventory-2" size={14} color={colors.muted} />
                    <AppText variant="tiny" color={colors.slate600}>
                      {totalCount === 1 ? t("vendor.productCount", { count: totalCount }) : t("vendor.productCountPlural", { count: totalCount })}
                    </AppText>
                  </View>
                )}
              </View>

              <AppButton
                title={t("vendor.seeAllReviews")}
                variant="ghost"
                icon="rate-review"
                onPress={goToReviews}
                style={styles.reviewsLink}
                textStyle={styles.reviewsLinkText}
              />
            </View>

            {/* Sort pills */}
            <View style={styles.sortContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortScroll}>
                {SORT_OPTIONS.map((opt) => {
                  const active = sort === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => handleSortChange(opt.key)}
                      style={[styles.sortPill, active && styles.sortPillActive]}
                    >
                    <AppText style={[styles.sortText, active && styles.sortTextActive]}>
                      {t(opt.label)}
                    </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Icon name="inventory" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted}>{t("vendor.noProducts")}</AppText>
            </View>
          ) : null
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={colors.brandBlue} />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.gridCell}>
            <ProductCard product={item} onAddToCart={handleAddToCart} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
  },
  profileCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[4], marginHorizontal: spacing[4], marginBottom: spacing[3],
    ...shadows.sm,
  },
  profileRow: {
    flexDirection: "row", alignItems: "center", gap: spacing[3],
  },
  logoWrap: {
    width: 56, height: 56, borderRadius: borderRadius.xl,
    backgroundColor: colors.gray50, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  logo: { width: 56, height: 56 },
  metaRow: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing[3],
    marginTop: spacing[3], paddingTop: spacing[3],
    borderTopWidth: 1, borderTopColor: colors.borderLight,
  },
  metaItem: {
    flexDirection: "row", alignItems: "center", gap: spacing[1],
  },
  reviewsLink: {
    marginTop: spacing[2],
    alignSelf: "flex-start",
    paddingHorizontal: 0,
    paddingVertical: spacing[1],
  },
  reviewsLinkText: {
    color: colors.brandBlue,
    fontWeight: "600",
  },
  sortContainer: { paddingBottom: spacing[2], marginBottom: spacing[2] },
  sortScroll: { paddingHorizontal: spacing[4], gap: spacing[2] },
  sortPill: {
    paddingHorizontal: spacing[3], paddingVertical: spacing[1.5],
    borderRadius: borderRadius.full, borderWidth: 1.5,
    borderColor: colors.slate200, backgroundColor: colors.white,
  },
  sortPillActive: { borderColor: colors.brandBlue, backgroundColor: colors.brandBlueLight },
  sortText: { fontSize: 12, fontWeight: "600", color: colors.slate600 },
  sortTextActive: { color: colors.brandBlue },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3], paddingTop: spacing[16] },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
  footerLoader: { paddingVertical: spacing[6], alignItems: "center" },
  vendorSkeletonScroll: { flexGrow: 1, paddingTop: spacing[2], paddingBottom: spacing[10] },
});
