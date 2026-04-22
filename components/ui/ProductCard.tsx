/**
 * ProductCard — the main product tile used in grids across the app.
 * Matches the web's card design: image, badges, wishlist, title, vendor,
 * star rating, price, and add-to-cart button.
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Image, Pressable, StyleSheet, Animated, Easing } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@/hooks/useT";
import AppText from "./AppText";
import Icon from "./Icon";
import StarRating from "./StarRating";
import { BadgeRow } from "./Badge";
import ProductPreviewVideo from "./ProductPreviewVideo";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { FALLBACK_IMAGE } from "@/lib/config";
import { productImageUrl, type ImageSize } from "@/lib/image";
import { ROUTES } from "@/lib/routes";
import { addToWishlist, removeFromWishlist, isInWishlist, onWishlistUpdate } from "@/lib/wishlist";
import { showToast } from "@/lib/toast";
import { useOnScreenViewability } from "@/hooks/useOnScreenViewability";
import { useAppActiveGate } from "@/hooks/useAppActiveGate";
import { usePreviewEnvironmentGate } from "@/hooks/usePreviewEnvironmentGate";
import type { PublicProduct } from "@/lib/types";

type Props = {
  product: PublicProduct;
  onAddToCart?: (product: PublicProduct) => void;
  /** Display size for R2 derivatives; wishlist/small sliders may use "thumb". */
  imageSize?: ImageSize;
  /** When true, caller is explicitly managing which card gets preview
   *  (carousel context). When undefined, card self-manages via isOnScreen
   *  polling (grid context). */
  enablePreview?: boolean;
};

function ProductCardInner({ product, onAddToCart, imageSize = "card", enablePreview }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const imageUri = productImageUrl(product.image, imageSize);
  const hasDiscount =
    product.compareAtPrice != null && Number(product.compareAtPrice) > Number(product.price);
  const [inWishlist, setInWishlist] = useState(false);
  const cartFlash = useRef(new Animated.Value(0)).current;

  const cardRef = useRef<View>(null);

  // Preview-video gating — two modes:
  //
  //   1. Carousel context (enablePreview is boolean):
  //      The slider's `onViewableItemsChanged` already picked the one
  //      visible card. Trust it — no per-card polling needed. This
  //      matches web where `ProductCarousel` sets
  //      `previewVideoEnabled={idx === 0 && ...}`.
  //
  //   2. Grid context (enablePreview is undefined):
  //      No carousel is managing visibility. Use `isOnScreen` polling
  //      so only cards actually in the viewport try to play. The LRU
  //      concurrency cap (MAX=3) handles the rest.
  const previewMp4 = product.previewVideo?.mp4Url ?? null;
  const isOnScreen = useOnScreenViewability(product.productId, cardRef);
  const isAppActive = useAppActiveGate();
  const envAllowed = usePreviewEnvironmentGate();

  // Carousel: trust enablePreview directly. Grid: require isOnScreen.
  const cardShouldPreview = enablePreview !== undefined ? enablePreview : isOnScreen;
  const previewEnabled =
    cardShouldPreview && !!previewMp4 && isAppActive && envAllowed === true;

  const handleAddToCart = useCallback(
    (e: any) => {
      e.stopPropagation?.();
      onAddToCart?.(product);
      cartFlash.setValue(0);
      Animated.sequence([
        Animated.timing(cartFlash, {
          toValue: 1,
          duration: 80,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(cartFlash, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
      ]).start();
    },
    [onAddToCart, product, cartFlash],
  );

  const cartBtnBg = cartFlash.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.brandBlue, colors.brandOrange],
  });

  useEffect(() => {
    isInWishlist(product.productId).then(setInWishlist);
    const unsub = onWishlistUpdate(() => {
      isInWishlist(product.productId).then(setInWishlist);
    });
    return unsub;
  }, [product.productId]);

  const toggleWishlist = useCallback(async () => {
    if (inWishlist) {
      await removeFromWishlist(product.productId);
      showToast(t("common.removedFromWishlist"), "info");
    } else {
      await addToWishlist({
        productId: product.productId,
        variantPublicId: product.defaultVariantPublicId ?? "",
        title: product.title,
        price: Math.round(Number(product.price) * 100),
        image: product.image || FALLBACK_IMAGE,
        slug: product.slug,
        categoryId: product.categoryId,
      });
      showToast(t("common.addedToWishlist"), "success");
    }
  }, [inWishlist, product]);

  return (
    <Pressable
      ref={cardRef}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      onPress={() => router.push(ROUTES.product(product.productId))}
    >
      {/* Image */}
      <View style={styles.imageWrap}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />

        {/* Silent autoplay preview overlay — overlays the static image
            when (and ONLY when) the gates align. Returns null on any
            failure so the static image continues to be the surface. */}
        {previewMp4 && (
          <ProductPreviewVideo mp4Url={previewMp4} enabled={previewEnabled} />
        )}

        {/* Badges */}
        <View style={styles.badges}>
          <BadgeRow badges={product.badges} />
        </View>

        {/* Wishlist */}
        <Pressable 
          style={[
            styles.wishlist, 
            inWishlist ? styles.wishlistActive : styles.wishlistInactive
          ]} 
          hitSlop={8} 
          onPress={toggleWishlist}
        >
          <Icon 
            name={inWishlist ? "favorite" : "favorite-border"} 
            size={16} 
            color={inWishlist ? colors.white : colors.slate400} 
          />
        </Pressable>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <AppText variant="label" numberOfLines={2} weight="semibold" style={styles.title}>
          {product.title}
        </AppText>

        {product.vendorName && (
          <AppText variant="caption" numberOfLines={1} style={styles.vendor}>
            {t("common.soldBy")}{" "}
            <AppText style={styles.vendorNameHighlight}>
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
            <AppText variant="price" style={styles.priceCurrent}>
              ${(Number(product.price) || 0).toFixed(2)}
            </AppText>
            {hasDiscount && (
              <AppText variant="priceStrike" style={styles.priceStrike}>
                ${(Number(product.compareAtPrice) || 0).toFixed(2)}
              </AppText>
            )}
          </View>

          {onAddToCart && (
            <Pressable onPress={handleAddToCart}>
              <Animated.View style={[styles.cartBtn, { backgroundColor: cartBtnBg }]}>
                <Icon name="add-shopping-cart" size={18} color={colors.white} />
              </Animated.View>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const ProductCard = React.memo(ProductCardInner);
export default ProductCard;

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
  imageWrap: { aspectRatio: 1, backgroundColor: colors.white },
  image: { width: "100%", height: "100%" },
  badges: { position: "absolute", top: 0, left: 0, zIndex: 10, padding: spacing[1] },
  wishlist: {
    position: "absolute",
    top: spacing[1.5],
    right: spacing[1.5],
    borderRadius: borderRadius.full,
    padding: spacing[1.5],
    borderWidth: 1,
    ...shadows.sm,
  },
  wishlistInactive: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderColor: colors.slate200,
  },
  wishlistActive: {
    backgroundColor: colors.brandBlueDark,
    borderColor: colors.brandBlueDark,
  },
  info: { padding: spacing[2], flex: 1 },
  title: { minHeight: 32, lineHeight: 16 },
  vendor: { marginTop: spacing[0.5], fontSize: 10, color: colors.slate400 },
  vendorNameHighlight: { fontSize: 10, color: colors.slate500, fontWeight: "500" },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing[2],
  },
  priceCurrent: { fontSize: 14, fontWeight: "900", color: colors.slate900, lineHeight: 16 },
  priceStrike: { fontSize: 11, color: colors.slate400, textDecorationLine: "line-through" },
  cartBtn: {
    backgroundColor: colors.brandBlue,
    borderRadius: borderRadius.lg,
    padding: spacing[1.5],
  },
});
