/**
 * Home Screen — matches the web homepage layout:
 * - Sticky search bar (blue background)
 * - Categories bar (orange, scrolls with content)
 * - Hero banner
 * - Recommended products grid
 * - Bestsellers section
 * - Top Rated section
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  Image,
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
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
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
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [recData, bestData, topData] = await Promise.all([
      fetchJSON(`${API_BASE}/products/public?take=20&skip=0`),
      fetchJSON(`${API_BASE}/products/public?take=12&sortBy=bestselling`),
      fetchJSON(`${API_BASE}/products/public?take=12&sortBy=rating`),
    ]);
    setRecommended(normalizeProducts(recData));
    setBestsellers(normalizeProducts(bestData));
    setTopRated(normalizeProducts(topData));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddToCart = useCallback(
    (product: PublicProduct) => {
      if (!product.defaultVariantId) return;
      addToCart({
        productVariantId: product.defaultVariantId,
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

        {/* Hero banner */}
        <View style={styles.heroPad}>
          <View style={styles.hero}>
            <View style={styles.heroDecor} />
            <AppText variant="heading" color={colors.white} style={styles.heroTitle}>
              Everything!
            </AppText>
            <AppText variant="bodySmall" color="rgba(255,255,255,0.9)" style={styles.heroSub}>
              Premium houseware at unbeatable prices.
            </AppText>
            <Pressable style={styles.heroCta}>
              <AppText variant="button" color={colors.white}>
                SHOP NOW
              </AppText>
            </Pressable>
          </View>
        </View>

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
}: {
  title: string;
  actionLabel?: string;
  accentColor?: string;
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
        <Pressable style={styles.sectionAction}>
          <AppText variant="label" color={colors.brandOrange} weight="bold">
            {actionLabel}
          </AppText>
          <Icon name="chevron-right" size={16} color={colors.brandOrange} />
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

  // Hero
  heroPad: { padding: spacing[4], paddingBottom: 0 },
  hero: {
    backgroundColor: "#2563eb",
    borderRadius: borderRadius["3xl"],
    padding: spacing[6],
    paddingTop: spacing[8],
    overflow: "hidden",
  },
  heroDecor: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(59,130,246,0.5)",
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "800",
    fontStyle: "italic",
    textTransform: "uppercase",
    lineHeight: 34,
    marginBottom: spacing[2],
  },
  heroSub: { maxWidth: 200, marginBottom: spacing[6] },
  heroCta: {
    backgroundColor: colors.brandOrange,
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[8],
    borderRadius: borderRadius.xl,
    alignSelf: "flex-start",
    ...shadows.lg,
  },

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
});
