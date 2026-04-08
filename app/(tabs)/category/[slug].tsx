import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import ProductCard from "@/components/ui/ProductCard";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
import { CATEGORY_SHORT_NAMES } from "@/lib/categories";
import { ROUTES } from "@/lib/routes";
import type { PublicProduct } from "@/lib/types";

import { PAGE_SIZE as PAGE_SIZES } from "@/lib/constants";

const PAGE_SIZE = PAGE_SIZES.PRODUCTS;

type SortOption = {
  key: string;
  label: string;
};

const SORT_OPTIONS: SortOption[] = [
  { key: "bestselling", label: "Best Selling" },
  { key: "newest", label: "Newest" },
  { key: "priceAsc", label: "Price: Low" },
  { key: "priceDesc", label: "Price: High" },
  { key: "rating", label: "Top Rated" },
  { key: "reviews", label: "Most Reviews" },
];

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sort, setSort] = useState("bestselling");
  const [hasMore, setHasMore] = useState(true);
  const skipRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchProducts = useCallback(
    async (reset: boolean, sortBy: string) => {
      if (!slug) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const skip = reset ? 0 : skipRef.current;
      if (reset) {
        setLoading(true);
        setProducts([]);
        setHasMore(true);
        skipRef.current = 0;
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await fetch(
          `${API_BASE}/products/public?take=${PAGE_SIZE}&skip=${skip}&categorySlug=${slug}&sortBy=${sortBy}`,
          { signal: controller.signal },
        );
        const data = await res.json();
        const items: PublicProduct[] = Array.isArray(data) ? data : data.products || [];

        if (reset) {
          setProducts(items);
        } else {
          setProducts((prev) => [...prev, ...items]);
        }
        skipRef.current = (reset ? 0 : skip) + items.length;
        setHasMore(items.length >= PAGE_SIZE);
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          if (reset) setProducts([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    fetchProducts(true, sort);
    return () => abortRef.current?.abort();
  }, [slug, sort]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return;
    fetchProducts(false, sort);
  }, [loadingMore, hasMore, loading, sort, fetchProducts]);

  const handleSortChange = useCallback((newSort: string) => {
    if (newSort === sort) return;
    setSort(newSort);
  }, [sort]);

  const title = CATEGORY_SHORT_NAMES[slug || ""] || slug?.replace(/-/g, " ") || "Category";

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

  const renderFooter = useCallback(() => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color={colors.brandBlue} />
      </View>
    );
  }, [loadingMore]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={styles.backBtn} />
        <AppText variant="title" style={styles.headerTitle} numberOfLines={1}>{title}</AppText>
        <View style={styles.backBtn} />
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
                  {opt.label}
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
          <View style={styles.emptyHero}>
            <Icon name="inventory-2" size={48} color={colors.gray300} />
            <AppText variant="subtitle" color={colors.muted}>No products in this category</AppText>
            <Pressable onPress={() => router.push(ROUTES.homeFeed)}>
              <AppText variant="label" color={colors.brandBlue}>Browse all products</AppText>
            </Pressable>
          </View>
          <ProductRecommendationSlider
            title="Trending Now"
            apiUrl="/recommendations?context=home&strategy=trending&take=10"
            accentColor={colors.rose500}
          />
          <ProductRecommendationSlider
            title="Suggestions for you"
            apiUrl="/products/public?take=10&sortBy=newest"
            accentColor={colors.brandBlue}
          />
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
  backBtn: { width: 44 },
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
});
