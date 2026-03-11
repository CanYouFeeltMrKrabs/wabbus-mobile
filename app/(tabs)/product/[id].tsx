/**
 * Product Detail Screen — matches the web's product page:
 * - Image gallery (scrollable)
 * - Title, vendor, star rating
 * - Price with discount
 * - Quantity selector
 * - Add to Cart / Buy Now buttons
 * - Description
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  Image,
  Pressable,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import StarRating from "@/components/ui/StarRating";
import { BadgeRow } from "@/components/ui/Badge";
import ProductImageGallery from "@/components/ui/ProductImageGallery";
import QuantitySelector from "@/components/ui/QuantitySelector";
import ProductReviews from "@/components/ui/ProductReviews";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import RecentlyViewedSlider from "@/components/ui/RecentlyViewedSlider";
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
  keyFeatures?: string[] | null;
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
  const [bodyY, setBodyY] = useState(0);
  const [btnY, setBtnY] = useState(0);
  const isStickyVisible = useRef(false);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback((event: any) => {
    if (!product) return;
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const isScrollingUp = currentScrollY < lastScrollY.current;
    lastScrollY.current = currentScrollY;

    const threshold = bodyY + btnY + 50; // offset for the button's own height
    
    let visible = false;
    if (bodyY > 0 && btnY > 0 && currentScrollY > threshold) {
      visible = !isScrollingUp;
    }
    
    if (visible !== isStickyVisible.current) {
      isStickyVisible.current = visible;
      DeviceEventEmitter.emit("toggleStickyCart", { product, visible });
    }
  }, [bodyY, btnY, product]);

  useEffect(() => {
    return () => {
      DeviceEventEmitter.emit("toggleStickyCart", { product: null, visible: false });
    };
  }, []);

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
        <AppButton title="Go Back" variant="outline" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const images = product.images?.length ? product.images : [product.image || FALLBACK_IMAGE];
  const hasDiscount = product.compareAtPrice != null && Number(product.compareAtPrice) > Number(product.price);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Back button */}
      <Pressable
        style={styles.backBtn}
        onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
        hitSlop={12}
      >
        <Icon name="arrow-back" size={24} color={colors.foreground} />
      </Pressable>

      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={4}
      >

        {/* Global Component: Image Gallery Card */}
        <ProductImageGallery
          images={images}
          inWishlist={inWishlist}
          onToggleWishlist={toggleWishlist}
        />

        <View style={styles.body} onLayout={(e) => setBodyY(e.nativeEvent.layout.y)}>
          {/* Title */}
          <AppText style={styles.productTitle}>{product.title}</AppText>

          {/* Vendor */}
          {product.vendorName && (
            <AppText variant="caption" style={styles.vendor}>
              Sold by <AppText variant="caption" color={colors.brandBlue} weight="bold">{product.vendorName}</AppText>
            </AppText>
          )}

          {/* Rating */}
          <View style={styles.ratingRow}>
            <StarRating rating={product.ratingAvg} count={product.reviewCount} sold={product.soldCount} size={16} />
          </View>

          {/* Price Block */}
          <View style={styles.priceBlock}>
            <AppText style={styles.priceLg}>
              {formatDollars(product.price)}
            </AppText>
            {hasDiscount && (
              <>
                <AppText variant="priceStrike" style={styles.priceOld}>
                  {formatDollars(Number(product.compareAtPrice))}
                </AppText>
                <View style={styles.discountPill}>
                  <AppText style={styles.discountText}>
                    {Math.round((1 - product.price / Number(product.compareAtPrice)) * 100)}% OFF
                  </AppText>
                </View>
              </>
            )}
          </View>

          {/* Badges/Shipping Info */}
          <AppText style={styles.stockText}>In Stock</AppText>

          <AppText style={styles.shippingText}>
            Ships within <AppText weight="bold" color={colors.foreground}>1-2 business days</AppText>
          </AppText>
          <View style={{ height: 16 }} />
          <BadgeRow badges={product.badges} />

          {/* Quantity */}
          <View style={styles.qtySection}>
            <AppText style={styles.qtyLabel}>Quantity</AppText>
            <QuantitySelector
              quantity={qty}
              onIncrease={() => setQty((q) => q + 1)}
              onDecrease={() => setQty((q) => Math.max(1, q - 1))}
            />
          </View>
          
          <View onLayout={(e) => setBtnY(e.nativeEvent.layout.y)}>
            <AppButton
              title="Add to Cart"
              variant="accent"
              onPress={handleAddToCart}
              loading={adding}
              style={{ marginTop: spacing[6] }}
            />
          </View>

          {/* Key Features */}
          {product.keyFeatures && product.keyFeatures.length > 0 && (
            <View style={styles.descSection}>
              <AppText style={styles.descTitle}>Key Features</AppText>
              {product.keyFeatures.map((feature, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <View style={styles.featureBullet} />
                  <AppText variant="body" color={colors.slate600} style={{ flex: 1 }}>
                    {feature}
                  </AppText>
                </View>
              ))}
            </View>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.descSection}>
              <AppText style={styles.descTitle}>Product details</AppText>
              <AppText variant="body" color={colors.slate600}>{product.description}</AppText>
            </View>
          )}

          {/* Customer Reviews */}
          <View style={styles.reviewsWrapper}>
            <ProductReviews productId={product.productId} />
          </View>
        </View>

        {/* Product Recommendations */}
        <View style={styles.recommendationsSection}>
          <ProductRecommendationSlider
            title="Frequently Bought Together"
            apiUrl={`/recommendations/${encodeURIComponent(product.productId)}?type=bought_together`}
            accentColor={colors.error}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title="Customers Also Viewed"
            apiUrl={`/recommendations/${encodeURIComponent(product.productId)}?type=viewed_together`}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title="Suggestions for you"
            apiUrl={`/recommendations/suggested?exclude=${encodeURIComponent(product.productId)}`}
            accentColor={colors.success}
            onAddToCart={handleAddToCart}
          />
          <RecentlyViewedSlider onAddToCart={handleAddToCart} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.slate50 }, // Use light gray background
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  backBtn: {
    position: "absolute", top: 56, left: spacing[4], zIndex: 20,
    backgroundColor: colors.overlayWhite90, borderRadius: borderRadius.full,
    padding: spacing[2], ...shadows.md,
  },
  scrollContent: { paddingBottom: spacing[8] },
  body: { paddingHorizontal: spacing[4], paddingTop: spacing[5] },
  productTitle: { fontSize: 24, lineHeight: 30, fontWeight: "bold", color: colors.foreground },
  vendor: { marginTop: spacing[1], color: colors.slate600 },
  ratingRow: { marginTop: spacing[2], marginBottom: spacing[2] },
  priceBlock: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: spacing[3] },
  priceLg: { fontSize: 24, fontWeight: "900", color: colors.foreground },
  priceOld: { fontSize: 16, color: colors.slate400, textDecorationLine: "line-through" },
  discountPill: {
    backgroundColor: colors.error,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  discountText: { color: colors.white, fontSize: 11, fontWeight: "bold" },
  stockText: { fontSize: 16, fontWeight: "bold", color: colors.success, marginTop: spacing[2] },
  shippingText: { fontSize: 14, color: colors.slate600, marginTop: spacing[1] },
  qtySection: {
    flexDirection: "column", alignItems: "flex-start", gap: spacing[2],
    marginTop: spacing[4], paddingTop: spacing[4],
  },
  qtyLabel: { fontSize: 16, fontWeight: "bold", color: colors.foreground },
  descSection: { marginTop: spacing[6], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.slate200 },
  descTitle: { fontSize: 18, fontWeight: "bold", marginBottom: spacing[3], color: colors.foreground },
  featureRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing[2], gap: spacing[2] },
  featureBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.brandBlue, marginTop: 8 },
  reviewsWrapper: { marginTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.border },
  recommendationsSection: { marginTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[8], paddingBottom: spacing[4] }
});
