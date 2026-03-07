import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import ProductCard from "@/components/ui/ProductCard";
import Icon from "@/components/ui/Icon";
import { customerFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { colors, spacing } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

export default function WishlistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addToCart } = useCart();
  const [items, setItems] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customerFetch<PublicProduct[]>("/customer/wishlist")
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const handleAddToCart = useCallback(
    (product: PublicProduct) => {
      if (!product.defaultVariantId) return;
      addToCart({ productVariantId: product.defaultVariantId, price: product.price, title: product.title, image: product.image || "", productId: product.productId, slug: product.slug });
    },
    [addToCart],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Wishlist</AppText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="favorite-border" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>Your wishlist is empty</AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(item) => item.productId}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => (
            <View style={styles.gridCell}>
              <ProductCard product={item} onAddToCart={handleAddToCart} />
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
});
