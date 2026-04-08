/**
 * Search Screen — matches web search behavior:
 * - Debounced live search (>= 2 chars) + submit for any query
 * - Pagination via infinite scroll
 * - API fallback when Typesense fails
 * - Category filter via pill bar
 * - Badges computed on search results
 * - Sort pills
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import SearchBar from "@/components/ui/SearchBar";
import ProductCard from "@/components/ui/ProductCard";
import Icon from "@/components/ui/Icon";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import RecentlyViewedSlider from "@/components/ui/RecentlyViewedSlider";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { searchTypesense } from "@/lib/search";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
import { fetchCategoriesClient, type CategoryLink } from "@/lib/categories";
import type { PublicProduct, TypesenseHit } from "@/lib/types";
import { computeBadges } from "@/lib/badges";
import { PAGE_SIZE as PAGE_SIZES } from "@/lib/constants";

const PAGE_SIZE = PAGE_SIZES.PRODUCTS_SEARCH;

const SORT_OPTIONS = [
  { value: "", label: "Relevance" },
  { value: "priceAsc", label: "Price: Low" },
  { value: "priceDesc", label: "Price: High" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top Rated" },
  { value: "bestselling", label: "Best Selling" },
];

function hitToProduct(hit: TypesenseHit): PublicProduct {
  const d = hit.document;
  return {
    productId: d.id,
    slug: d.slug,
    title: d.title,
    description: null,
    image: d.image,
    price: d.price,
    compareAtPrice: d.compareAtPrice,
    defaultVariantPublicId: d.defaultVariantPublicId,
    ratingAvg: d.ratingAvg,
    reviewCount: d.reviewCount,
    soldCount: d.soldCount,
    vendorName: d.vendorName,
    categoryId: d.categoryId,
    badges: computeBadges({
      price: d.price,
      compareAtPrice: d.compareAtPrice,
      createdAt: d.createdAt,
      reviewCount: d.reviewCount,
    }),
  };
}

function normalizeProducts(data: unknown): PublicProduct[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "products" in data) {
    return (data as any).products ?? [];
  }
  return [];
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<CategoryLink[]>([]);
  const [results, setResults] = useState<PublicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchCategoriesClient().then(setCategories).catch(() => {});
  }, []);

  const doSearch = useCallback(async (q: string, sort?: string, cat?: string, pageNum = 1, append = false) => {
    if (!append) abortRef.current?.abort();
    const searchQuery = q.trim() || "*";
    if (searchQuery === "*" && !q.trim()) {
      setResults([]);
      setTotal(0);
      setSearched(false);
      setSearchError(false);
      return;
    }

    const controller = new AbortController();
    if (!append) abortRef.current = controller;

    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setSearched(true);
      setSearchError(false);
    }

    try {
      const data = await searchTypesense({
        q: searchQuery,
        categorySlug: cat || undefined,
        page: pageNum,
        perPage: PAGE_SIZE,
        sortBy: sort || undefined,
        signal: controller.signal,
      });

      const products = data.results
        .map(hitToProduct)
        .filter((p) => p.image && p.image.startsWith("http"));

      if (append) {
        setResults((prev) => [...prev, ...products]);
      } else {
        setResults(products);
      }
      setTotal(data.total);
      setPage(pageNum);
    } catch (e: any) {
      if (e.name === "AbortError") return;

      if (!append) {
        try {
          const backendSortMap: Record<string, string> = {
            priceAsc: "priceAsc", priceDesc: "priceDesc",
            newest: "newest", rating: "rating",
            bestselling: "bestselling",
          };
          const skip = (pageNum - 1) * PAGE_SIZE;
          const sortParam = sort && backendSortMap[sort] ? `&sortBy=${backendSortMap[sort]}` : "";
          const res = await fetch(`${API_BASE}/products/public?take=${PAGE_SIZE}&skip=${skip}${sortParam}`);
          if (res.ok) {
            const fallbackData = await res.json();
            const fallbackProducts = normalizeProducts(fallbackData);
            const fallbackTotal = fallbackData?.total ?? fallbackProducts.length;
            setResults(fallbackProducts);
            setTotal(fallbackTotal);
            setSearchError(false);
          } else {
            setSearchError(true);
            setResults([]);
            setTotal(0);
          }
        } catch {
          setSearchError(true);
          setResults([]);
          setTotal(0);
        }
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    doSearch(query, sortBy, category);
  }, [query, sortBy, category, doSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) doSearch(query, sortBy, category);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, sortBy, category, doSearch]);

  const handleSort = useCallback((value: string) => {
    setSortBy(value);
    if (query.trim().length >= 2) doSearch(query, value, category);
  }, [query, category, doSearch]);

  const handleCategoryFilter = useCallback((slug: string) => {
    const newCat = category === slug ? "" : slug;
    setCategory(newCat);
    if (query.trim().length >= 2) doSearch(query, sortBy, newCat);
  }, [query, sortBy, category, doSearch]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || loading) return;
    const totalPages = Math.ceil(total / PAGE_SIZE);
    if (page >= totalPages) return;
    doSearch(query, sortBy, category, page + 1, true);
  }, [loadingMore, loading, total, page, query, sortBy, category, doSearch]);

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

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing[2]) + spacing[2] }]}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSubmit}
          autoFocus
        />
      </View>

      {loading && !results.length ? (
        <ScrollView
          contentContainerStyle={styles.skeletonScroll}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonGrid count={6} />
        </ScrollView>
      ) : searchError ? (
        <View style={styles.empty}>
          <Icon name="cloud-off" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted} style={styles.emptyText}>
            Search is temporarily unavailable
          </AppText>
          <Pressable onPress={handleSubmit} style={styles.retryBtn}>
            <AppText variant="label" color={colors.brandBlue} weight="bold">Try again</AppText>
          </Pressable>
        </View>
      ) : searched && results.length === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyScroll}>
          <View style={styles.emptyBlock}>
            <Icon name="search-off" size={48} color={colors.gray300} />
            <AppText variant="subtitle" color={colors.muted} style={styles.emptyText}>
              No results for &ldquo;{query}&rdquo;
            </AppText>
          </View>
          <ProductRecommendationSlider
            title="Recommended for You"
            apiUrl="/products/public?take=10&sortBy=newest"
            accentColor={colors.brandBlue}
          />
          <RecentlyViewedSlider />
        </ScrollView>
      ) : results.length > 0 ? (
        <>
          <View style={styles.toolbarRow}>
            <AppText variant="caption">
              {total} result{total !== 1 ? "s" : ""}
            </AppText>

            {/* Category filter */}
            {categories.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
                {categories.map((cat) => (
                  <Pressable
                    key={cat.slug}
                    style={[styles.catPill, category === cat.slug && styles.catPillActive]}
                    onPress={() => handleCategoryFilter(cat.slug)}
                  >
                    <AppText
                      variant="caption"
                      color={category === cat.slug ? colors.white : colors.muted}
                      weight={category === cat.slug ? "semibold" : "normal"}
                    >
                      {cat.name}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {/* Sort pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.sortPill, sortBy === opt.value && styles.sortPillActive]}
                  onPress={() => handleSort(opt.value)}
                >
                  <AppText
                    variant="caption"
                    color={sortBy === opt.value ? colors.white : colors.muted}
                    weight={sortBy === opt.value ? "semibold" : "normal"}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <FlatList
            data={results}
            numColumns={2}
            keyExtractor={(item) => item.productId}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            renderItem={({ item }) => (
              <View style={styles.gridCell}>
                <ProductCard product={item} onAddToCart={handleAddToCart} />
              </View>
            )}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={colors.brandBlue} />
                </View>
              ) : null
            }
          />
        </>
      ) : (
        <View style={styles.empty}>
          <Icon name="search" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted} style={styles.emptyText}>
            Search for products
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing[4], paddingBottom: spacing[3], backgroundColor: colors.brandBlue },
  skeletonScroll: { flexGrow: 1, paddingTop: spacing[2], paddingBottom: spacing[10] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  emptyText: { textAlign: "center" },
  emptyScroll: { paddingBottom: spacing[10] },
  emptyBlock: { alignItems: "center", justifyContent: "center", gap: spacing[3], paddingVertical: spacing[12] },
  retryBtn: { marginTop: spacing[2] },
  toolbarRow: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1], gap: spacing[2] },
  sortRow: { gap: spacing[1.5], marginTop: spacing[1.5] },
  sortPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: {
    backgroundColor: colors.brandBlue,
    borderColor: colors.brandBlue,
  },
  catPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brandOrange,
  },
  catPillActive: {
    backgroundColor: colors.brandOrange,
    borderColor: colors.brandOrange,
  },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
  footerLoader: { paddingVertical: spacing[6], alignItems: "center" },
});
