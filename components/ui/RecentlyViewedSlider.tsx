import React, { useEffect, useState, useMemo } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import AppText from "@/components/ui/AppText";
import ProductCard from "@/components/ui/ProductCard";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { loadRecentlyViewed, onRecentlyViewedUpdate, type RecentlyViewedItem } from "@/lib/recentlyViewed";
import type { PublicProduct } from "@/lib/types";

export type RecentlyViewedSliderProps = {
  onAddToCart?: (product: PublicProduct) => void;
};

export default function RecentlyViewedSlider({ onAddToCart }: RecentlyViewedSliderProps) {
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedItem[]>([]);

  useEffect(() => {
    loadRecentlyViewed().then(setRecentlyViewed);
    const unsub = onRecentlyViewedUpdate(() => {
      loadRecentlyViewed().then(setRecentlyViewed);
    });
    return unsub;
  }, []);

  const recentProducts = useMemo<PublicProduct[]>(
    () =>
      recentlyViewed.slice(0, 10).map((item) => ({
        productId: item.productId,
        slug: item.slug,
        title: item.title,
        description: null,
        price: item.price / 100,
        compareAtPrice: item.compareAtPrice ? item.compareAtPrice / 100 : null,
        image: item.image || null,
        ratingAvg: item.ratingAvg ?? 0,
        reviewCount: item.reviewCount ?? 0,
        vendorName: item.vendorName ?? null,
        soldCount: item.soldCount ?? 0,
        defaultVariantPublicId: item.variantPublicId,
        categoryId: item.categoryId ?? null,
        badges: item.badges ?? undefined,
      })),
    [recentlyViewed]
  );

  if (recentProducts.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.accent} />
        <AppText variant="subtitle" weight="bold">Recently Viewed</AppText>
      </View>
      
      <FlatList
        data={recentProducts}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.productId}
        contentContainerStyle={styles.scrollContent}
        renderItem={({ item }) => (
          <View style={styles.cardContainer}>
            <ProductCard product={item} onAddToCart={onAddToCart} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[4],
    paddingHorizontal: spacing[4],
  },
  accent: {
    width: 4,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate400,
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  cardContainer: {
    width: 160,
  },
});
