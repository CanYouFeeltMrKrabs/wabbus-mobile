import React, { useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import AppText from "@/components/ui/AppText";
import ProductCard from "@/components/ui/ProductCard";
import { SkeletonSlider } from "@/components/ui/Skeleton";
import { colors, spacing, borderRadius } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

/**
 * Presentation-only horizontal slider for product recommendations.
 *
 * Refactored as part of the sealed-query-layer migration (plan §4b /
 * `.cursor/handoff-sealed-query-layer.md` §E.3). Previously this component
 * owned its own `useQuery` against an arbitrary `apiUrl` + `queryKey` +
 * `postProcess` — that pattern made every caller a writer for an ad-hoc
 * cache key, which is exactly the bug class the sealed layer eliminates
 * (one key → one fetcher → one schema).
 *
 * The component now takes `products` and `loading` as props. Each caller
 * owns the data-fetching side via a typed hook from `@/lib/queries`
 * (e.g. `useRecommendationsStrategy`, `useRecommendationsContext`,
 * `useRecommendationsPostPurchase`, etc.) and passes the result down.
 *
 * Empty/loading semantics preserved verbatim from the legacy queryFn-owning
 * version:
 *   - `loading=false && products.length === 0` → render nothing.
 *   - `loading=true  && products.length === 0` → render skeleton.
 *   - `products.length > 0`                   → render slider regardless of loading.
 */
export type ProductRecommendationSliderProps = {
  title: string;
  products: PublicProduct[] | undefined;
  loading?: boolean;
  accentColor?: string;
  onAddToCart?: (product: PublicProduct) => void;
};

function ProductRecommendationSliderInner({
  title,
  products,
  loading = false,
  accentColor = colors.brandBlue,
  onAddToCart,
}: ProductRecommendationSliderProps) {
  const items = products ?? [];

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

  if (!loading && items.length === 0) return null;

  if (loading && items.length === 0) {
    return (
      <View style={styles.container}>
        <SkeletonSlider count={4} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.accent, { backgroundColor: accentColor }]} />
        <AppText variant="subtitle" weight="bold">{title}</AppText>
      </View>

      <FlatList
        data={items}
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
              <ProductCard product={item} onAddToCart={onAddToCart} enablePreview={isVisible} />
            </View>
          );
        }}
      />
    </View>
  );
}

const ProductRecommendationSlider = React.memo(ProductRecommendationSliderInner);
export default ProductRecommendationSlider;

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
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  cardContainer: {
    width: 160,
  },
});
