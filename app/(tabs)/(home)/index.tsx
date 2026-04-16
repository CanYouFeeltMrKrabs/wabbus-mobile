/**
 * Home Screen — matches the web homepage section order:
 * - Sticky search bar (blue background)
 * - Categories bar (orange, scrolls with content)
 * - Hero banner
 * - Suggestions carousel (web sidebar → mobile: horizontal slider after hero)
 * - Bestsellers grid
 * - Recommended for You grid (personalization swap on mount)
 * - Trending Now carousel
 * - New Arrivals carousel
 * - Trending Categories grid
 * - Today's Deals carousel
 * - Recently Viewed slider
 * - Top Rated grid
 */
import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Image,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import SearchBar from "@/components/ui/SearchBar";
import TopCategoriesBar from "@/components/ui/TopCategoriesBar";
import ProductGrid from "@/components/ui/ProductGrid";
import HeroCarousel from "@/components/ui/HeroCarousel";
import Icon from "@/components/ui/Icon";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import { SkeletonGrid, SkeletonSlider } from "@/components/ui/Skeleton";
import RecentlyViewedSlider from "@/components/ui/RecentlyViewedSlider";
import { useTranslation } from "@/hooks/useT";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { customerFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { getCategoryIcon, CATEGORY_SHORT_NAMES } from "@/lib/categories";
import { ROUTES } from "@/lib/routes";
import type { PublicProduct, TypesenseHit } from "@/lib/types";
import { getLocalizedCategoryName } from "@/lib/types";
import { searchTypesense } from "@/lib/search";
import { productImageUrl } from "@/lib/image";
import { PAGE_SIZE } from "@/lib/constants";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const PRODUCTS_HOME = PAGE_SIZE.PRODUCTS_HOME;

function normalizeProducts(data: unknown): PublicProduct[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "products" in data) {
    return (data as any).products ?? [];
  }
  return [];
}

async function fetchJSON(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const { data: bestsellers = [] } = useQuery({
    queryKey: queryKeys.products.list({ sortBy: "bestselling", take: 12 }),
    queryFn: async () => {
      const data = await fetchJSON(`${API_BASE}/products/public?take=12&sortBy=bestselling`);
      return normalizeProducts(data);
    },
  });

  const { data: topRated = [] } = useQuery({
    queryKey: queryKeys.products.list({ sortBy: "rating", take: 12 }),
    queryFn: async () => {
      const data = await fetchJSON(`${API_BASE}/products/public?take=12&sortBy=rating`);
      return normalizeProducts(data);
    },
  });

  const { data: trendingCats = [] } = useQuery<Array<{ name: string; slug: string }>>({
    queryKey: queryKeys.recommendations.strategy("trending-categories"),
    queryFn: async () => {
      const data = await fetchJSON(`${API_BASE}/recommendations/trending-categories?limit=8&days=14`);
      if (data?.categories && Array.isArray(data.categories)) return data.categories;
      if (Array.isArray(data)) return data;
      return [];
    },
  });

  const { data: recoData, isLoading: loading } = useQuery({
    queryKey: queryKeys.recommendations.home(),
    queryFn: async () => {
      try {
        const recoResult = await customerFetch<{ products?: PublicProduct[]; personalized?: boolean }>(
          `/recommendations?context=home&take=${PRODUCTS_HOME}`,
        );
        return {
          products: recoResult?.products ?? ([] as PublicProduct[]),
          personalized: !!recoResult?.personalized,
        };
      } catch {
        const fallback = await fetchJSON(`${API_BASE}/products/public?take=${PRODUCTS_HOME}&skip=0`);
        return {
          products: normalizeProducts(fallback),
          personalized: false,
        };
      }
    },
  });

  const recommended = recoData?.products ?? [];
  const recoLabel = recoData?.personalized ? t("home.pickedForYou") : t("home.recommendedForYou");

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

  // ── Inline search typeahead (matches web NavbarSearch) ──
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{
    productId: string; slug: string; title: string; price: number;
    compareAtPrice: number | null; image: string | null;
    ratingAvg: number; reviewCount: number; vendorName: string | null;
    categoryName: string;
  }>>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback((q: string) => {
    if (q.length < 1) {
      setSuggestions([]); setShowDropdown(false); setTotalResults(0);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearchLoading(true);

    searchTypesense({ q, perPage: 6, signal: controller.signal })
      .then((data) => {
        setSuggestions(
          data.results
            .filter((hit) => hit.document.image?.startsWith("http"))
            .map((hit) => ({
              productId: hit.document.id,
              slug: hit.document.slug,
              title: hit.document.title,
              price: hit.document.price,
              compareAtPrice: hit.document.compareAtPrice || null,
              image: hit.document.image || null,
              ratingAvg: hit.document.ratingAvg,
              reviewCount: hit.document.reviewCount,
              vendorName: hit.document.vendorName || null,
              categoryName: getLocalizedCategoryName(hit.document),
            })),
        );
        setTotalResults(data.total);
        setShowDropdown(true);
        setSearchLoading(false);
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setSuggestions([]); setShowDropdown(false); setSearchLoading(false);
      });
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 1) { setSuggestions([]); setShowDropdown(false); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(q), 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, fetchSuggestions]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      {/* Sticky search header + dropdown */}
      <View style={[styles.searchHeader, { paddingTop: insets.top + spacing[2] }]}>
        {/* Relative wrapper so dropdown anchors directly below the SearchBar input */}
        <View style={styles.searchBarWrapper}>
          <SearchBar
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              if (!text.trim()) setShowDropdown(false);
            }}
            onSubmit={() => {
              Keyboard.dismiss();
              setShowDropdown(false);
            }}
            autoFocus={false}
          />

          {/* Typeahead dropdown */}
          {showDropdown && (
            <View style={styles.dropdown}>
              {searchLoading ? (
                <View style={styles.dropdownLoading}>
                  <ActivityIndicator size="small" color={colors.brandBlue} />
                  <AppText variant="caption" color={colors.muted}>{t("common.searching") ?? "Searching..."}</AppText>
                </View>
              ) : suggestions.length === 0 ? (
                <View style={styles.dropdownLoading}>
                  <AppText variant="caption" color={colors.muted}>{t("common.noResults") ?? "No results found"}</AppText>
                </View>
              ) : (
                <>
                  {suggestions.map((item) => (
                    <Pressable
                      key={item.productId}
                      style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
                      onPress={() => {
                        setShowDropdown(false);
                        setSearchQuery("");
                        Keyboard.dismiss();
                        router.push(ROUTES.product(item.productId));
                      }}
                    >
                      <View style={styles.dropdownThumbWrap}>
                        {item.image ? (
                          <Image source={{ uri: item.image }} style={styles.dropdownThumb} resizeMode="cover" />
                        ) : (
                          <View style={[styles.dropdownThumb, { backgroundColor: colors.slate100 }]} />
                        )}
                      </View>
                      <View style={styles.dropdownInfo}>
                        <AppText numberOfLines={1} style={styles.dropdownTitle}>{item.title}</AppText>
                        <View style={styles.dropdownMeta}>
                          <AppText style={styles.dropdownPrice}>${item.price.toFixed(2)}</AppText>
                          {item.compareAtPrice != null && item.compareAtPrice > item.price && (
                            <AppText style={styles.dropdownCompare}>${item.compareAtPrice.toFixed(2)}</AppText>
                          )}
                          {item.reviewCount > 0 && (
                            <AppText style={styles.dropdownRating}>★ {item.ratingAvg.toFixed(1)}</AppText>
                          )}
                          <AppText numberOfLines={1} style={styles.dropdownCategory}>{item.categoryName}</AppText>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                  {totalResults > suggestions.length && (
                    <Pressable
                      style={styles.dropdownViewAll}
                      onPress={() => {
                        setShowDropdown(false);
                        Keyboard.dismiss();
                        router.push(ROUTES.search);
                      }}
                    >
                      <AppText style={styles.dropdownViewAllText}>
                        View all {totalResults} results
                      </AppText>
                    </Pressable>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Dismiss overlay when dropdown is open */}
      {showDropdown && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { setShowDropdown(false); Keyboard.dismiss(); }}
        />
      )}

      {/* Sticky Categories Bar */}
      <View style={{ zIndex: 40, elevation: 40 }}>
        <TopCategoriesBar />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        <HeroCarousel>
          {/* Suggestions — newest products (web: sidebar next to hero, mobile: slider after hero) */}
          <ProductRecommendationSlider
            title={t("home.suggestionsForYou")}
            apiUrl="/products/public?take=10&sortBy=newest"
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
        </HeroCarousel>

        {/* Bestsellers */}
        {bestsellers.length > 0 && (
          <>
            <SectionHeader
              title={t("home.bestsellers")}
              accentColor={colors.warning}
              actionLabel={t("home.viewAll")}
              onActionPress={() => router.push(ROUTES.searchWithSort("bestselling"))}
            />
            <View style={styles.gridPad}>
              <ProductGrid products={bestsellers} onAddToCart={handleAddToCart} />
            </View>
          </>
        )}

        {/* Recommended for You / Picked for You (personalization swap) */}
        <SectionHeader
          title={recoLabel}
          accentColor={colors.brandBlue}
          actionLabel={t("home.browseMore")}
          onActionPress={() => router.push(ROUTES.recommended as any)}
        />
        {loading ? (
          <View>
            <SkeletonSlider count={4} />
            <View style={styles.gridPad}>
              <SkeletonGrid count={6} />
            </View>
          </View>
        ) : (
          <View style={styles.gridPad}>
            <ProductGrid products={recommended} onAddToCart={handleAddToCart} />
          </View>
        )}

        {/* Trending Now — 48h velocity */}
        <ProductRecommendationSlider
          title={t("home.trendingNow")}
          apiUrl="/recommendations?context=home&strategy=trending&take=10"
          queryKey={queryKeys.recommendations.strategy("trending")}
          accentColor={colors.rose500}
          onAddToCart={handleAddToCart}
        />

        {/* New Arrivals — 14-day window */}
        <ProductRecommendationSlider
          title={t("home.newArrivals")}
          apiUrl="/recommendations?context=home&strategy=new_arrivals&take=10"
          queryKey={queryKeys.recommendations.strategy("new_arrivals")}
          accentColor={colors.violet500}
          onAddToCart={handleAddToCart}
        />

        {/* Trending Categories */}
        {trendingCats.length > 0 && (
          <>
            <SectionHeader
              title={t("home.trendingCategories")}
              accentColor={colors.brandOrange}
              actionLabel={t("home.all")}
              onActionPress={() => router.push(ROUTES.categories)}
            />
            <View style={styles.catGrid}>
              {trendingCats.map((cat) => (
                <Pressable
                  key={cat.slug}
                  style={styles.catCard}
                  onPress={() => router.push(ROUTES.category(cat.slug))}
                >
                  <View style={styles.catIconWrap}>
                    <Icon name={getCategoryIcon(cat.slug)} size={24} color={colors.slate600} />
                  </View>
                  <AppText
                    align="center"
                    numberOfLines={2}
                    style={styles.catLabel}
                  >
                    {CATEGORY_SHORT_NAMES[cat.slug] ?? cat.name}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <View style={styles.browseAllWrap}>
              <Pressable
                style={styles.browseAllBtn}
                onPress={() => router.push(ROUTES.categories)}
              >
                <Icon name="grid-view" size={18} color={colors.brandBlue} />
                <AppText style={styles.browseAllText}>{t("home.browseAllCategories")}</AppText>
                <Icon name="chevron-right" size={16} color={colors.brandBlue} />
              </Pressable>
            </View>
          </>
        )}

        {/* Today's Deals — discount-sorted */}
        <ProductRecommendationSlider
          title={t("home.todaysDeals")}
          apiUrl="/recommendations?context=home&strategy=deals&take=10"
          accentColor={colors.warning}
          onAddToCart={handleAddToCart}
        />

        {/* Recently Viewed — returning users only */}
        <RecentlyViewedSlider onAddToCart={handleAddToCart} />

        {/* Top Rated */}
        {topRated.length > 0 && (
          <>
            <SectionHeader
              title={t("home.topRated")}
              accentColor={colors.success}
              actionLabel={t("home.viewAll")}
              onActionPress={() => router.push(ROUTES.searchWithSort("rating"))}
            />
            <View style={styles.gridPad}>
              <ProductGrid products={topRated} onAddToCart={handleAddToCart} />
            </View>
          </>
        )}

        <View style={{ height: spacing[10] }} />
      </ScrollView>
    </View>
  );
}

function SectionHeader({
  title,
  actionLabel,
  accentColor,
  onActionPress,
}: {
  title: string;
  actionLabel?: string;
  accentColor?: string;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {accentColor && (
          <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
        )}
        <AppText variant="title">{title}</AppText>
      </View>
      {actionLabel && onActionPress && (
        <Pressable style={styles.sectionAction} onPress={onActionPress}>
          <AppText variant="label" color={colors.brandOrange} weight="bold" style={{ fontSize: 10 }}>
            {actionLabel}
          </AppText>
          <Icon name="chevron-right" size={14} color={colors.brandOrange} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.brandBlue },
  scrollView: { backgroundColor: colors.background },
  searchHeader: {
    backgroundColor: colors.brandBlue,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    zIndex: 50,
    elevation: 50,
  },
  scrollContent: { flexGrow: 1 },

  // ── Search bar wrapper (positioning context for dropdown) ──
  searchBarWrapper: {
    position: "relative",
    zIndex: 60,
    elevation: 60,
  },

  // ── Typeahead dropdown ──
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: spacing[1],
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.slate200,
    ...shadows.lg,
    overflow: "hidden",
    maxHeight: 400,
    zIndex: 60,
    elevation: 60,
  },
  dropdownLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.slate100,
  },
  dropdownItemPressed: {
    backgroundColor: colors.slate50,
  },
  dropdownThumbWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    backgroundColor: colors.slate100,
  },
  dropdownThumb: {
    width: "100%",
    height: "100%",
  },
  dropdownInfo: {
    flex: 1,
    minWidth: 0,
  },
  dropdownTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.slate900,
  },
  dropdownMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1.5],
    marginTop: 2,
  },
  dropdownPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.slate900,
  },
  dropdownCompare: {
    fontSize: 11,
    color: colors.slate400,
    textDecorationLine: "line-through",
  },
  dropdownRating: {
    fontSize: 11,
    color: colors.warning,
    fontWeight: "600",
  },
  dropdownCategory: {
    fontSize: 11,
    color: colors.slate400,
    flex: 1,
  },
  dropdownViewAll: {
    paddingVertical: spacing[2.5],
    alignItems: "center",
  },
  dropdownViewAllText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brandBlue,
  },

  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    paddingBottom: spacing[3],
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  accentDot: { width: 8, height: 8, borderRadius: 4 },
  sectionAction: { flexDirection: "row", alignItems: "center" },

  gridPad: { paddingHorizontal: spacing[4] },

  catGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: spacing[4], gap: spacing[3],
  },
  catCard: {
    width: (SCREEN_WIDTH - spacing[4] * 2 - spacing[3] * 3) / 4,
    alignItems: "center", gap: spacing[1.5],
  },
  catIconWrap: {
    width: 56, height: 56, borderRadius: borderRadius.full,
    backgroundColor: "#eff6ff", alignItems: "center", justifyContent: "center",
  },
  catLabel: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  browseAllWrap: { paddingHorizontal: spacing[4], marginTop: spacing[3] },
  browseAllBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing[2], paddingVertical: spacing[3],
    borderRadius: borderRadius.xl, borderWidth: 1.5,
    borderColor: colors.brandBlueBorder, backgroundColor: colors.brandBlueLight,
  },
  browseAllText: { fontSize: 14, fontWeight: "700", color: colors.brandBlue },
});
