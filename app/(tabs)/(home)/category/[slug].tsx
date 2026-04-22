import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import ProductCard from "@/components/ui/ProductCard";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import OutageBanner from "@/components/ui/OutageBanner";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
import { CATEGORY_SHORT_NAMES } from "@/lib/categories";
import { ROUTES } from "@/lib/routes";
import { trackEvent } from "@/lib/tracker";
import type { PublicProduct } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

import { PAGE_SIZE as PAGE_SIZES } from "@/lib/constants";

const PAGE_SIZE = PAGE_SIZES.PRODUCTS;
const CAROUSEL_LIMIT = PAGE_SIZES.CAROUSEL;

type SortOption = {
  key: string;
  label: string;
};

const SORT_OPTIONS: SortOption[] = [
  { key: "bestselling", label: "category.sort.bestSelling" },
  { key: "newest", label: "category.sort.newest" },
  { key: "priceAsc", label: "category.sort.priceLow" },
  { key: "priceDesc", label: "category.sort.priceHigh" },
  { key: "rating", label: "category.sort.topRated" },
  { key: "reviews", label: "category.sort.mostReviews" },
];

export default function CategoryScreen() {
  const { t } = useTranslation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const [extraProducts, setExtraProducts] = useState<PublicProduct[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState("bestselling");
  const [hasMore, setHasMore] = useState(true);
  const skipRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const { data: initialProducts, isPending: loading, isError: fetchError, dataUpdatedAt } = useQuery({
    queryKey: queryKeys.categories.products(slug!, { sortBy: sort }),
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `${API_BASE}/products/public?take=${PAGE_SIZE}&skip=0&categorySlug=${slug}&sortBy=${sort}`,
        { signal },
      );
      const data = await res.json();
      return (Array.isArray(data) ? data : data.products || []) as PublicProduct[];
    },
    enabled: !!slug,
  });

  useEffect(() => {
    if (!initialProducts) return;
    setExtraProducts([]);
    skipRef.current = initialProducts.length;
    setHasMore(initialProducts.length >= PAGE_SIZE);
    if (slug) {
      void trackEvent("category_view", { metadata: { slug } });
    }
  }, [dataUpdatedAt, slug]);

  const products = initialProducts
    ? extraProducts.length > 0 ? [...initialProducts, ...extraProducts] : initialProducts
    : [];

  const fetchMore = useCallback(async () => {
    if (!slug) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `${API_BASE}/products/public?take=${PAGE_SIZE}&skip=${skipRef.current}&categorySlug=${slug}&sortBy=${sort}`,
        { signal: controller.signal },
      );
      const data = await res.json();
      const items: PublicProduct[] = Array.isArray(data) ? data : data.products || [];
      setExtraProducts((prev) => [...prev, ...items]);
      skipRef.current += items.length;
      setHasMore(items.length >= PAGE_SIZE);
    } catch (e: any) {
      if (e?.name !== "AbortError") { /* noop */ }
    } finally {
      setLoadingMore(false);
    }
  }, [slug, sort]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    fetchMore();
  }, [loadingMore, hasMore, loading, fetchMore]);

  const handleSortChange = useCallback((newSort: string) => {
    if (newSort === sort) return;
    setSort(newSort);
  }, [sort]);

  const title = CATEGORY_SHORT_NAMES[slug || ""] || slug?.replace(/-/g, " ") || t("category.fallback");

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

  /**
   * Discovery rail rendered below the product grid (and inside the empty
   * state). Mirrors the web `CategoryClient` layout exactly so analytics
   * surface order stays consistent across platforms:
   *   1. New In {Category}        — category-scoped freshness signal
   *   2. Trending Now             — global velocity, broadens discovery
   *   3. Suggestions for you      — newest products fallback
   *   4. Recommended for You      — personalized, category-context
   *
   * Each carousel is independent: an empty result hides itself (handled
   * inside ProductRecommendationSlider) so a single failing surface
   * never blocks the rest.
   */
  const renderCarouselRail = useCallback(() => {
    if (!slug) return null;
    return (
      <View style={styles.footerRecos}>
        <ProductRecommendationSlider
          title={t("category.newIn", { name: title })}
          apiUrl={`/products/public?categorySlug=${encodeURIComponent(slug)}&sortBy=newest&take=${CAROUSEL_LIMIT}`}
          queryKey={queryKeys.categories.newArrivals(slug)}
          accentColor={colors.violet500}
          onAddToCart={handleAddToCart}
        />
        <ProductRecommendationSlider
          title={t("home.trendingNow")}
          apiUrl={`/recommendations?context=home&strategy=trending&take=${CAROUSEL_LIMIT}`}
          queryKey={queryKeys.recommendations.strategy("trending")}
          accentColor={colors.rose500}
          onAddToCart={handleAddToCart}
        />
        <ProductRecommendationSlider
          title={t("home.suggestionsForYou")}
          apiUrl={`/products/public?take=${CAROUSEL_LIMIT}&sortBy=newest`}
          queryKey={queryKeys.products.list({ take: CAROUSEL_LIMIT, sortBy: "newest" })}
          accentColor={colors.brandBlue}
          onAddToCart={handleAddToCart}
        />
        <ProductRecommendationSlider
          title={t("home.recommendedForYou")}
          apiUrl={`/recommendations?context=category&take=${CAROUSEL_LIMIT}`}
          queryKey={queryKeys.recommendations.context("category", slug)}
          accentColor={colors.brandBlue}
          onAddToCart={handleAddToCart}
        />
      </View>
    );
  }, [slug, title, t, handleAddToCart]);

  const renderFooter = useCallback(() => {
    return (
      <View>
        {loadingMore && (
          <View style={styles.footerLoader}>
            <ActivityIndicator size="small" color={colors.brandBlue} />
          </View>
        )}
        {!hasMore && renderCarouselRail()}
      </View>
    );
  }, [loadingMore, hasMore, renderCarouselRail]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title" style={styles.headerTitle} numberOfLines={1}>{title}</AppText>
        <View style={{ width: 40 }} />
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

      {loading ? (
        <ScrollView
          contentContainerStyle={styles.skeletonScroll}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonGrid count={6} />
        </ScrollView>
      ) : products.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          {fetchError && (
            <View style={{ paddingHorizontal: spacing[4], paddingTop: spacing[4] }}>
              <OutageBanner />
            </View>
          )}
          <View style={styles.emptyHero}>
            <Icon name="inventory-2" size={48} color={colors.gray300} />
            <AppText variant="subtitle" color={colors.muted}>
              {fetchError ? t("category.couldNotLoad") : t("category.noProducts")}
            </AppText>
            <Pressable onPress={() => router.push(ROUTES.homeFeed)}>
              <AppText variant="label" color={colors.brandBlue}>{t("category.browseAll")}</AppText>
            </Pressable>
          </View>
          {renderCarouselRail()}
        </ScrollView>
      ) : (
        <FlatList
          data={products}
          numColumns={2}
          keyExtractor={(item) => item.productId || String(Math.random())}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => (
            <View style={styles.gridCell}>
              <ProductCard product={item} onAddToCart={handleAddToCart} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
  },
  headerTitle: { flex: 1, textAlign: "center", textTransform: "capitalize" },

  sortContainer: { paddingBottom: spacing[2], borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  sortScroll: { paddingHorizontal: spacing[4], gap: spacing[2] },
  sortPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
  },
  sortPillActive: {
    borderColor: colors.brandBlue,
    backgroundColor: colors.brandBlueLight,
  },
  sortText: { fontSize: 12, fontWeight: "600", color: colors.slate600 },
  sortTextActive: { color: colors.brandBlue },
  skeletonScroll: { flexGrow: 1, paddingTop: spacing[2], paddingBottom: spacing[10] },
  emptyScroll: { paddingBottom: spacing[10] },
  emptyHero: { alignItems: "center", justifyContent: "center", gap: spacing[3], paddingVertical: spacing[12] },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
  footerLoader: { paddingVertical: spacing[6], alignItems: "center" },
  footerRecos: { marginTop: spacing[4] },
});
