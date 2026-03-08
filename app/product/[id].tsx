/**
 * Product Detail Screen — matches the web's product page:
 * - Image gallery (scrollable)
 * - Title, vendor, star rating
 * - Price with discount
 * - Quantity selector
 * - Add to Cart / Buy Now buttons
 * - Description
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import StarRating from "@/components/ui/StarRating";
import { BadgeRow } from "@/components/ui/Badge";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { publicFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { FALLBACK_IMAGE } from "@/lib/config";
import { formatDollars } from "@/lib/money";
import { addToWishlist, removeFromWishlist, isInWishlist, onWishlistUpdate } from "@/lib/wishlist";
import { addToRecentlyViewed } from "@/lib/recentlyViewed";

const { width: SCREEN_W } = Dimensions.get("window");

type ProductDetail = {
  id: number;
  productId: string;
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  images?: string[];
  price: number;
  compareAtPrice?: number | null;
  defaultVariantId: number | null;
  ratingAvg: number;
  reviewCount: number;
  soldCount?: number;
  vendorName: string | null;
  vendorPublicId?: string;
  categoryId?: number | null;
  badges?: Array<{ type: string; label: string; value?: number }>;
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    publicFetch<ProductDetail>(`/products/public/${id}/view`)
      .then((p) => {
        setProduct(p);
        addToRecentlyViewed({
          productId: p.productId,
          variantId: p.defaultVariantId ?? 0,
          title: p.title,
          price: Math.round(p.price * 100),
          image: p.image || "",
          slug: p.slug,
          categoryId: p.categoryId,
          compareAtPrice: p.compareAtPrice ? Math.round(Number(p.compareAtPrice) * 100) : null,
          vendorName: p.vendorName,
          ratingAvg: p.ratingAvg,
          reviewCount: p.reviewCount,
          soldCount: p.soldCount,
          badges: p.badges,
        });
        isInWishlist(p.productId).then(setInWishlist);
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!product) return;
    const unsub = onWishlistUpdate(() => {
      isInWishlist(product.productId).then(setInWishlist);
    });
    return unsub;
  }, [product]);

  const toggleWishlist = useCallback(async () => {
    if (!product) return;
    if (inWishlist) {
      await removeFromWishlist(product.productId);
    } else {
      await addToWishlist({
        productId: product.productId,
        variantId: product.defaultVariantId ?? 0,
        title: product.title,
        price: Math.round(product.price * 100),
        image: product.image || FALLBACK_IMAGE,
        slug: product.slug,
        categoryId: product.categoryId,
      });
    }
  }, [inWishlist, product]);

  const handleAddToCart = useCallback(async () => {
    if (!product?.defaultVariantId) return;
    setAdding(true);
    try {
      await addToCart({
        productVariantId: product.defaultVariantId,
        price: product.price,
        title: product.title,
        image: product.image || "",
        quantity: qty,
        productId: product.productId,
        slug: product.slug,
      });
      Alert.alert("Added to Cart", `${product.title} (x${qty}) added to your cart.`);
    } catch {
      Alert.alert("Error", "Could not add to cart.");
    } finally {
      setAdding(false);
    }
  }, [product, qty, addToCart]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>Product not found</AppText>
        <AppButton title="Go Back" variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const images = product.images?.length ? product.images : [product.image || FALLBACK_IMAGE];
  const hasDiscount = product.compareAtPrice != null && Number(product.compareAtPrice) > Number(product.price);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Back button */}
      <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
        <Icon name="arrow-back" size={24} color={colors.foreground} />
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Image carousel */}
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
          {images.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.galleryImage} resizeMode="cover" />
          ))}
        </ScrollView>

        <View style={styles.body}>
          {/* Badges */}
          <BadgeRow badges={product.badges} />

          {/* Title */}
          <AppText variant="title" style={styles.productTitle}>{product.title}</AppText>

          {/* Vendor */}
          {product.vendorName && (
            <AppText variant="caption" style={styles.vendor}>
              Sold by <AppText variant="caption" color={colors.slate500} weight="medium">{product.vendorName}</AppText>
            </AppText>
          )}

          {/* Rating */}
          <StarRating rating={product.ratingAvg} count={product.reviewCount} sold={product.soldCount} size={16} />

          {/* Price */}
          <View style={styles.priceBlock}>
            <AppText variant="price" style={styles.priceLg}>
              {formatDollars(product.price)}
            </AppText>
            {hasDiscount && (
              <AppText variant="priceStrike" style={styles.priceOld}>
                {formatDollars(Number(product.compareAtPrice))}
              </AppText>
            )}
          </View>

          {/* Quantity */}
          <View style={styles.qtySection}>
            <AppText variant="label">Quantity</AppText>
            <View style={styles.qtyControls}>
              <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => Math.max(1, q - 1))}>
                <Icon name="remove" size={20} color={colors.foreground} />
              </Pressable>
              <AppText variant="subtitle" style={styles.qtyText}>{qty}</AppText>
              <Pressable style={styles.qtyBtn} onPress={() => setQty((q) => q + 1)}>
                <Icon name="add" size={20} color={colors.foreground} />
              </Pressable>
            </View>
          </View>

          {/* Description */}
          {product.description && (
            <View style={styles.descSection}>
              <AppText variant="subtitle" style={styles.descTitle}>Description</AppText>
              <AppText variant="body" color={colors.slate600}>{product.description}</AppText>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + spacing[2] }]}>
        <Pressable
          style={[styles.wishlistBtn, inWishlist && styles.wishlistBtnActive]}
          hitSlop={8}
          onPress={toggleWishlist}
        >
          <Icon name={inWishlist ? "favorite" : "favorite-border"} size={24} color={inWishlist ? colors.white : colors.brandBlue} />
        </Pressable>
        <AppButton
          title={adding ? "Adding..." : "Add to Cart"}
          variant="primary"
          icon="add-shopping-cart"
          loading={adding}
          onPress={handleAddToCart}
          style={styles.addBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  backBtn: {
    position: "absolute", top: 56, left: spacing[4], zIndex: 20,
    backgroundColor: colors.overlayWhite90, borderRadius: borderRadius.full,
    padding: spacing[2], ...shadows.md,
  },
  scrollContent: { paddingBottom: 100 },
  gallery: { width: SCREEN_W, height: SCREEN_W * 0.75 },
  galleryImage: { width: SCREEN_W, height: SCREEN_W * 0.75 },
  body: { padding: spacing[4] },
  productTitle: { marginTop: spacing[2], fontSize: 20, lineHeight: 26 },
  vendor: { marginTop: spacing[1] },
  priceBlock: { flexDirection: "row", alignItems: "baseline", gap: spacing[2], marginTop: spacing[3] },
  priceLg: { fontSize: 24 },
  priceOld: { fontSize: 14 },
  qtySection: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginTop: spacing[5], paddingVertical: spacing[3],
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  qtyControls: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md },
  qtyBtn: { padding: spacing[2] },
  qtyText: { paddingHorizontal: spacing[5] },
  descSection: { marginTop: spacing[5] },
  descTitle: { marginBottom: spacing[2] },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: spacing[3],
    paddingHorizontal: spacing[4], paddingTop: spacing[3],
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border,
    ...shadows.lg,
  },
  wishlistBtn: {
    borderWidth: 1.5, borderColor: colors.brandBlue, borderRadius: borderRadius.lg,
    padding: spacing[2.5],
  },
  wishlistBtnActive: {
    backgroundColor: colors.brandBlueDark, borderColor: colors.brandBlueDark,
  },
  addBtn: { flex: 1 },
});
