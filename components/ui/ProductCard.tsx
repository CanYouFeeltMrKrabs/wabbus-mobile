/**
 * ProductCard — the main product tile used in grids across the app.
 * Matches the web's card design: image, badges, wishlist, title, vendor,
 * star rating, price, and add-to-cart button.
 */
import React from "react";
import { View, Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AppText from "./AppText";
import Icon from "./Icon";
import StarRating from "./StarRating";
import { BadgeRow } from "./Badge";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { FALLBACK_IMAGE } from "@/lib/config";
import type { PublicProduct } from "@/lib/types";

type Props = {
  product: PublicProduct;
  onAddToCart?: (product: PublicProduct) => void;
};

export default function ProductCard({ product, onAddToCart }: Props) {
  const router = useRouter();
  const imageUri = product.image || FALLBACK_IMAGE;
  const hasDiscount =
    product.compareAtPrice != null && Number(product.compareAtPrice) > Number(product.price);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(`/product/${product.productId}`)}
    >
      {/* Image */}
      <View style={styles.imageWrap}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />

        {/* Badges */}
        <View style={styles.badges}>
          <BadgeRow badges={product.badges} />
        </View>

        {/* Wishlist */}
        <Pressable style={styles.wishlist} hitSlop={8}>
          <Icon name="favorite-border" size={20} color={colors.gray400} />
        </Pressable>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <AppText variant="label" numberOfLines={2} style={styles.title}>
          {product.title}
        </AppText>

        {product.vendorName && (
          <AppText variant="caption" numberOfLines={1} style={styles.vendor}>
            Sold by{" "}
            <AppText variant="caption" color={colors.slate500} weight="medium">
              {product.vendorName}
            </AppText>
          </AppText>
        )}

        <StarRating
          rating={product.ratingAvg}
          count={product.reviewCount}
          sold={product.soldCount}
        />

        {/* Price row */}
        <View style={styles.priceRow}>
          <View>
            <AppText variant="price">
              ${(Number(product.price) || 0).toFixed(2)}
            </AppText>
            {hasDiscount && (
              <AppText variant="priceStrike">
                ${(Number(product.compareAtPrice) || 0).toFixed(2)}
              </AppText>
            )}
          </View>

          {onAddToCart && (
            <Pressable
              style={styles.cartBtn}
              onPress={(e) => {
                e.stopPropagation?.();
                onAddToCart(product);
              }}
            >
              <Icon name="add-shopping-cart" size={18} color={colors.white} />
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.gray100,
    ...shadows.sm,
  },
  pressed: { opacity: 0.95, transform: [{ scale: 0.98 }] },
  imageWrap: { aspectRatio: 4 / 3, backgroundColor: colors.gray50 },
  image: { width: "100%", height: "100%" },
  badges: { position: "absolute", top: spacing[1], left: spacing[1], zIndex: 10 },
  wishlist: {
    position: "absolute",
    top: spacing[1],
    right: spacing[1],
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: borderRadius.full,
    padding: spacing[1],
    ...shadows.sm,
  },
  info: { padding: spacing[2], flex: 1 },
  title: { minHeight: 32, lineHeight: 16 },
  vendor: { marginTop: spacing[0.5] },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing[2],
  },
  cartBtn: {
    backgroundColor: colors.brandBlue,
    borderRadius: borderRadius.lg,
    padding: spacing[1.5],
  },
});
