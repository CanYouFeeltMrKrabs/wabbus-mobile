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
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from "react-native";
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
import { colors, spacing, borderRadius } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { customerFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { getCategoryIcon, CATEGORY_SHORT_NAMES } from "@/lib/categories";
import { ROUTES } from "@/lib/routes";
import type { PublicProduct } from "@/lib/types";
import { PAGE_SIZE } from "@/lib/constants";

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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const [recommended, setRecommended] = useState<PublicProduct[]>([]);
  const [recoLabel, setRecoLabel] = useState("Recommended for You");
  const [bestsellers, setBestsellers] = useState<PublicProduct[]>([]);
  const [topRated, setTopRated] = useState<PublicProduct[]>([]);
  const [trendingCats, setTrendingCats] = useState<Array<{ name: string; slug: string }>>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [bestData, topData, trendData] = await Promise.all([
      fetchJSON(`${API_BASE}/products/public?take=12&sortBy=bestselling`),
      fetchJSON(`${API_BASE}/products/public?take=12&sortBy=rating`),
      fetchJSON(`${API_BASE}/recommendations/trending-categories?limit=8&days=14`),
    ]);

    setBestsellers(normalizeProducts(bestData));
    setTopRated(normalizeProducts(topData));
    if (trendData?.categories && Array.isArray(trendData.categories)) {
      setTrendingCats(trendData.categories);
    } else if (Array.isArray(trendData)) {
      setTrendingCats(trendData);
    }

    try {
      const recoData = await customerFetch<{ products?: PublicProduct[]; personalized?: boolean }>(
        `/recommendations?context=home&take=${PRODUCTS_HOME}`,
      );
      const products = recoData?.products ?? [];
      setRecommended(products);
      setRecoLabel(recoData?.personalized ? "Picked for You" : "Recommended for You");
    } catch {
      const fallback = await fetchJSON(`${API_BASE}/products/public?take=${PRODUCTS_HOME}&skip=0`);
      setRecommended(normalizeProducts(fallback));
      setRecoLabel("Recommended for You");
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      {/* Sticky search header */}
      <View style={[styles.searchHeader, { paddingTop: insets.top + spacing[2] }]}>
        <SearchBar editable={false} onPress={() => router.push(ROUTES.search)} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <TopCategoriesBar />
        <HeroCarousel />

        {/* Suggestions — newest products (web: sidebar next to hero, mobile: slider after hero) */}
        <ProductRecommendationSlider
          title="Suggestions for you"
          apiUrl="/products/public?take=10&sortBy=newest"
          accentColor={colors.brandBlue}
          onAddToCart={handleAddToCart}
        />

        {/* Bestsellers */}
        {bestsellers.length > 0 && (
          <>
            <SectionHeader
              title="Bestsellers"
              accentColor={colors.warning}
              actionLabel="VIEW ALL"
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
          actionLabel="BROWSE MORE"
          onActionPress={() => router.push(ROUTES.searchWithSort("recommended"))}
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
          title="Trending Now"
          apiUrl="/recommendations?context=home&strategy=trending&take=10"
          accentColor={colors.rose500}
          onAddToCart={handleAddToCart}
        />

        {/* New Arrivals — 14-day window */}
        <ProductRecommendationSlider
          title="New Arrivals"
          apiUrl="/recommendations?context=home&strategy=new_arrivals&take=10"
          accentColor={colors.violet500}
          onAddToCart={handleAddToCart}
        />

        {/* Trending Categories */}
        {trendingCats.length > 0 && (
          <>
            <SectionHeader
              title="Trending Categories"
              accentColor={colors.brandOrange}
              actionLabel="ALL"
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
                <AppText style={styles.browseAllText}>Browse All Categories</AppText>
                <Icon name="chevron-right" size={16} color={colors.brandBlue} />
              </Pressable>
            </View>
          </>
        )}

        {/* Today's Deals — discount-sorted */}
        <ProductRecommendationSlider
          title="Today's Deals"
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
              title="Top Rated"
              accentColor={colors.success}
              actionLabel="VIEW ALL"
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
  screen: { flex: 1, backgroundColor: colors.background },
  searchHeader: {
    backgroundColor: colors.brandBlue,
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    zIndex: 10,
  },
  scrollContent: { flexGrow: 1 },

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
