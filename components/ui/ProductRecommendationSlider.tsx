import React, { useEffect, useState } from "react";
import { View, FlatList, StyleSheet } from "react-native";
import AppText from "@/components/ui/AppText";
import ProductCard from "@/components/ui/ProductCard";
import { SkeletonSlider } from "@/components/ui/Skeleton";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { publicFetch } from "@/lib/api";
import type { PublicProduct } from "@/lib/types";

export type ProductRecommendationSliderProps = {
  title: string;
  apiUrl: string;
  accentColor?: string;
  onAddToCart?: (product: PublicProduct) => void;
  postProcess?: (data: any) => PublicProduct[];
};

export default function ProductRecommendationSlider({
  title,
  apiUrl,
  accentColor = colors.brandBlue,
  onAddToCart,
  postProcess,
}: ProductRecommendationSliderProps) {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    publicFetch(apiUrl)
      .then((data) => {
        let productList: PublicProduct[] = [];
        if (postProcess) {
          productList = postProcess(data);
        } else if (Array.isArray(data)) {
          productList = data;
        } else if (data && typeof data === "object" && "products" in data) {
          productList = (data as any).products ?? [];
        }
        setProducts(productList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiUrl, postProcess]);

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
