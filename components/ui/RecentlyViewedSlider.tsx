import React, { useEffect, useState, useMemo, useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import ProductCard from "@/components/ui/ProductCard";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { loadRecentlyViewed, onRecentlyViewedUpdate, type RecentlyViewedItem } from "@/lib/recentlyViewed";
import type { PublicProduct } from "@/lib/types";

export type RecentlyViewedSliderProps = {
  onAddToCart?: (product: PublicProduct) => void;
};

function RecentlyViewedSliderInner({ onAddToCart }: RecentlyViewedSliderProps) {
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
      recentlyViewed.slice(0, 6).map((item) => ({
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
        previewVideo: item.previewVideo ?? null,
      })),
    [recentlyViewed]
  );

  const { t } = useTranslation();

  const [visibleProductId, setVisibleProductId] = React.useState<string | null>(null);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const mostVisible =
        viewableItems.find((v: any) => v.isViewable) || viewableItems[0];
      if (mostVisible && mostVisible.item) {
        setVisibleProductId(mostVisible.item.productId);
      }
    }
  }, []);

  const viewabilityConfig = React.useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  if (recentProducts.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.accent} />
        <AppText variant="subtitle" weight="bold">{t("common.recentlyViewed")}</AppText>
      </View>

      <FlatList
        data={recentProducts}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.productId}
        contentContainerStyle={styles.scrollContent}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => {
          const isVisible = visibleProductId 
            ? item.productId === visibleProductId 
            : index === 0;

          return (
            <View style={styles.cardContainer}>
              <ProductCard product={item} onAddToCart={onAddToCart} imageSize="thumb" enablePreview={isVisible} />
            </View>
          );
        }}
      />
    </View>
  );
}

const RecentlyViewedSlider = React.memo(RecentlyViewedSliderInner);
export default RecentlyViewedSlider;

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
