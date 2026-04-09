import React, { useCallback } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import AppText from "@/components/ui/AppText";
import ProductCard from "@/components/ui/ProductCard";
import { SkeletonSlider } from "@/components/ui/Skeleton";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { publicFetch } from "@/lib/api";
import type { PublicProduct } from "@/lib/types";

export type ProductRecommendationSliderProps = {
  title: string;
  apiUrl: string;
  queryKey?: readonly unknown[];
  accentColor?: string;
  onAddToCart?: (product: PublicProduct) => void;
  postProcess?: (data: any) => PublicProduct[];
};

function defaultExtract(data: unknown, postProcess?: (data: any) => PublicProduct[]): PublicProduct[] {
  if (postProcess) return postProcess(data);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "products" in data) return (data as any).products ?? [];
  return [];
}

export default function ProductRecommendationSlider({
  title,
  apiUrl,
  queryKey,
  accentColor = colors.brandBlue,
  onAddToCart,
  postProcess,
}: ProductRecommendationSliderProps) {
  const stablePostProcess = useCallback(
    (d: unknown) => defaultExtract(d, postProcess),
    [postProcess],
  );

  const { data: products = [], isLoading: loading } = useQuery({
    queryKey: queryKey ?? ["recs", apiUrl],
    queryFn: async () => {
      const data = await publicFetch(apiUrl);
      return stablePostProcess(data);
    },
    staleTime: 5 * 60_000,
  });

  if (!loading && products.length === 0) return null;

  if (loading && products.length === 0) {
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
        data={products}
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
  },
  scrollContent: {
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  cardContainer: {
    width: 160,
  },
});
