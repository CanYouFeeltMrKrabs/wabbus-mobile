/**
 * Home Screen — matches the web homepage layout:
 * - Sticky search bar (blue background)
 * - Categories bar (orange, scrolls with content)
 * - Hero banner
 * - Recommended products grid
 * - Bestsellers section
 * - Top Rated section
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Image,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import SearchBar from "@/components/ui/SearchBar";
import TopCategoriesBar from "@/components/ui/TopCategoriesBar";
import ProductGrid from "@/components/ui/ProductGrid";
import ProductCard from "@/components/ui/ProductCard";
import HeroCarousel from "@/components/ui/HeroCarousel";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
import { getCategoryIcon, CATEGORY_SHORT_NAMES } from "@/lib/categories";
import RecentlyViewedSlider from "@/components/ui/RecentlyViewedSlider";
import type { PublicProduct } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

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
  const [bestsellers, setBestsellers] = useState<PublicProduct[]>([]);
  const [topRated, setTopRated] = useState<PublicProduct[]>([]);
  const [trendingCats, setTrendingCats] = useState<Array<{ name: string; slug: string }>>([]);
  const [kitchenware, setKitchenware] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [recData, bestData, topData, trendData, kitData] = await Promise.all([
      fetchJSON(`${API_BASE}/products/public?take=20&skip=0`),
      fetchJSON(`${API_BASE}/products/public?take=12&sortBy=bestselling`),
      fetchJSON(`${API_BASE}/products/public?take=12&sortBy=rating`),
      fetchJSON(`${API_BASE}/recommendations/trending-categories?limit=8&days=14`),
      fetchJSON(`${API_BASE}/products/public?take=10&categorySlug=kitchenware`),
    ]);
    setRecommended(normalizeProducts(recData));
    setBestsellers(normalizeProducts(bestData));
    setTopRated(normalizeProducts(topData));
    if (Array.isArray(trendData)) setTrendingCats(trendData);
    setKitchenware(normalizeProducts(kitData));
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
        <SearchBar editable={false} onPress={() => router.push("/search")} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Categories bar — scrolls with content */}
        <TopCategoriesBar />

        {/* Hero carousel */}
        <HeroCarousel />

        {/* Kitchen Essentials */}
        {kitchenware.length > 0 && (
          <View style={{ marginTop: spacing[4] }}>
            <SectionHeader 
              title="Kitchen Essentials" 
              actionLabel="SEE ALL" 
              onActionPress={() => router.push("/category/kitchenware")}
            />
            <View style={styles.gridPad}>
              <ProductGrid products={kitchenware.slice(0, 2)} onAddToCart={handleAddToCart} />
            </View>
          </View>
        )}

        {/* Recommended */}
        <SectionHeader title="Recommended for You" actionLabel="VIEW ALL" />
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.brandBlue}
            style={styles.loader}
          />
        ) : (
          <View style={styles.gridPad}>
            <ProductGrid products={recommended} onAddToCart={handleAddToCart} />
          </View>
        )}

        {/* Recently Viewed */}
        <RecentlyViewedSlider onAddToCart={handleAddToCart} />

        {/* Trending Categories */}
        {trendingCats.length > 0 && (
          <>
            <SectionHeader title="Trending Categories" accentColor={colors.brandOrange} />
            <View style={styles.catGrid}>
              {trendingCats.map((cat) => (
                <Pressable
                  key={cat.slug}
                  style={styles.catCard}
                  onPress={() => router.push(`/category/${cat.slug}`)}
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
          </>
        )}

        {/* Bestsellers */}
        {bestsellers.length > 0 && (
          <>
            <SectionHeader title="Bestsellers" accentColor={colors.warning} />
            <View style={styles.gridPad}>
              <ProductGrid products={bestsellers} onAddToCart={handleAddToCart} />
            </View>
          </>
        )}

        {/* Top Rated */}
        {topRated.length > 0 && (
          <>
            <SectionHeader title="Top Rated" accentColor={colors.success} />
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
      {actionLabel && (
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

  // Sections
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
  loader: { marginTop: spacing[10] },

  // Horizontal product list (recently viewed)
  horizontalList: { paddingHorizontal: spacing[4], gap: spacing[3] },
  horizontalCard: { width: 160 },

  // Trending categories grid
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
  }
});
