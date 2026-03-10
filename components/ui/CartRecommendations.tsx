import React, { useEffect, useState } from "react";
import { View, FlatList, Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AppText from "@/components/ui/AppText";
import { API_BASE, FALLBACK_IMAGE } from "@/lib/config";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { CartItem, PublicProduct } from "@/lib/types";

interface CartRecommendationsProps {
  cart: CartItem[];
}

export default function CartRecommendations({ cart }: CartRecommendationsProps) {
  const router = useRouter();
  const [products, setProducts] = useState<PublicProduct[]>([]);

  useEffect(() => {
    if (cart.length === 0) return;
    const productIds = cart
      .map((item) => item.productId)
      .filter(Boolean) as string[];
    if (productIds.length === 0) return;

    fetch(`${API_BASE}/recommendations/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productIds }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.products?.length) setProducts(data.products);
      })
      .catch(() => {});
  }, [cart]);

  if (products.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.accent} />
        <AppText variant="subtitle" weight="bold">You Might Also Like</AppText>
      </View>
      <FlatList
        data={products}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.productId}
        contentContainerStyle={styles.scrollContent}
        renderItem={({ item: product }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/product/${product.productId}`)}
          >
            <Image
              source={{ uri: product.image || FALLBACK_IMAGE }}
              style={styles.image}
              resizeMode="cover"
            />
            <View style={styles.info}>
              <AppText variant="caption" numberOfLines={2} style={styles.title}>
                {product.title}
              </AppText>
              <AppText variant="priceSmall">
                ${(Number(product.price) || 0).toFixed(2)}
              </AppText>
            </View>
          </Pressable>
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
  },
  accent: {
    width: 4,
    height: 20,
    borderRadius: borderRadius.full,
    backgroundColor: colors.brandBlue,
  },
  scrollContent: {
    gap: spacing[4],
  },
  card: {
    width: 150,
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadows.sm,
  },
  image: {
    width: "100%",
    height: 120,
    backgroundColor: colors.gray50,
  },
  info: {
    padding: spacing[3],
    gap: spacing[2],
  },
  title: {
    color: colors.foreground,
  },
});
