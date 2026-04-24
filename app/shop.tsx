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
import RecentlyViewedSlider from "@/components/ui/RecentlyViewedSlider";
import OutageBanner from "@/components/ui/OutageBanner";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
import { ROUTES } from "@/lib/routes";
import type { PublicProduct } from "@/lib/types";
import {
  useRecommendationsStrategy,
  useRecommendationsHome,
  useProductsList,
} from "@/lib/queries";

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

export default function ShopScreen() {
  const { t } = useTranslation();
  const { sort: urlSort } = useLocalSearchParams<{ sort?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const initialSort = SORT_OPTIONS.some((o) => o.key === urlSort) ? urlSort! : "bestselling";

  const [extraProducts, setExtraProducts] = useState<PublicProduct[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState(initialSort);
  const [hasMore, setHasMore] = useState(true);
  const skipRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const { data: initialProducts, isPending: loading, isError: fetchError, dataUpdatedAt } = useProductsList(
    { sortBy: sort, take: PAGE_SIZE },
  );

  useEffect(() => {
    if (!initialProducts) return;
    setExtraProducts([]);
    skipRef.current = initialProducts.length;
    setHasMore(initialProducts.length >= PAGE_SIZE);
  }, [dataUpdatedAt]);

  const products = initialProducts
    ? extraProducts.length > 0 ? [...initialProducts, ...extraProducts] : initialProducts
    : [];

  const fetchMore = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `${API_BASE}/products/public?take=${PAGE_SIZE}&skip=${skipRef.current}&sortBy=${sort}`,
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
  }, [sort]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    fetchMore();
  }, [loadingMore, hasMore, loading, fetchMore]);

  const handleSortChange = useCallback((newSort: string) => {
    if (newSort === sort) return;
    setSort(newSort);
  }, [sort]);

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

  const trendingNow = useRecommendationsStrategy("trending");
  const bestsellersFallback = useProductsList({ take: CAROUSEL_LIMIT, sortBy: "bestselling" });
  const suggestionsForYou = useProductsList({ take: CAROUSEL_LIMIT, sortBy: "newest" });
  const recoData = useRecommendationsHome(CAROUSEL_LIMIT);

  const renderCarouselRail = useCallback(() => {
    const hasTrending = !!trendingNow.data?.length;
    return (
      <View style={styles.footerRecos}>
        <ProductRecommendationSlider
          title={hasTrending ? t("home.trendingNow") : t("home.bestsellers")}
          products={hasTrending ? (trendingNow.data as PublicProduct[]) : bestsellersFallback.data}
          loading={trendingNow.isPending && !bestsellersFallback.data?.length}
          accentColor={hasTrending ? colors.rose500 : colors.warning}
          onAddToCart={handleAddToCart}
        />
        <ProductRecommendationSlider
          title={t("home.suggestionsForYou")}
          products={suggestionsForYou.data}
          loading={suggestionsForYou.isPending}
          accentColor={colors.brandBlue}
          onAddToCart={handleAddToCart}
        />
        <ProductRecommendationSlider
          title={t("home.recommendedForYou")}
          products={recoData.data?.products as PublicProduct[] | undefined}
          loading={recoData.isLoading}
          accentColor={colors.brandBlue}
          onAddToCart={handleAddToCart}
        />
        <RecentlyViewedSlider onAddToCart={handleAddToCart} />
      </View>
    );
  }, [
    t,
    handleAddToCart,
    trendingNow.data,
    trendingNow.isPending,
    bestsellersFallback.data,
    suggestionsForYou.data,
    suggestionsForYou.isPending,
    recoData.data?.products,
    recoData.isLoading,
  ]);

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
        <AppText variant="title" style={styles.headerTitle} numberOfLines={1}>{t("shop.title")}</AppText>
        <View style={{ width: 40 }} />
      </View>

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
              {fetchError ? t("shop.couldNotLoad") : t("shop.noProducts")}
            </AppText>
            <Pressable onPress={() => router.push(ROUTES.homeFeed)}>
              <AppText variant="label" color={colors.brandBlue}>{t("shop.browseAll")}</AppText>
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
  headerTitle: { flex: 1, textAlign: "center" },
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
  gridCell: { flex: 1, maxWidth: "50%" },
  footerLoader: { paddingVertical: spacing[6], alignItems: "center" },
  footerRecos: { marginTop: spacing[4] },
});
