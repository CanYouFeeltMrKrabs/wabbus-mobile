import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import ProductCard from "@/components/ui/ProductCard";
import Icon from "@/components/ui/Icon";
import { colors, spacing } from "@/lib/theme";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
import { CATEGORY_SHORT_NAMES } from "@/lib/categories";
import type { PublicProduct } from "@/lib/types";

export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetch(`${API_BASE}/products/public?take=24&skip=0&categorySlug=${slug}&sortBy=newest`)
      .then((r) => r.json())
      .then((data) => {
        const items = Array.isArray(data) ? data : data.products || [];
        setProducts(items);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [slug]);

  const title = CATEGORY_SHORT_NAMES[slug || ""] || slug?.replace(/-/g, " ") || "Category";

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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={styles.backBtn} />
        <AppText variant="title" style={styles.headerTitle} numberOfLines={1}>{title}</AppText>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : products.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="category" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>No products in this category</AppText>
        </View>
      ) : (
        <FlatList
          data={products}
          numColumns={2}
          keyExtractor={(item) => item.productId || String(item.id)}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => (
            <View style={styles.gridCell}>
              <ProductCard product={item} onAddToCart={handleAddToCart} />
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
  },
  headerTitle: { flex: 1, textAlign: "center", textTransform: "capitalize" },
  backBtn: { width: 44 },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
});
