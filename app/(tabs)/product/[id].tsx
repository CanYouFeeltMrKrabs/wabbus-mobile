/**
 * Product Detail Screen — matches the web PDP layout:
 * - Image gallery, title, vendor, star rating, sold count
 * - Variant selector (color, size, etc.)
 * - Price with >= 5% discount threshold
 * - Stock status, shipping info, secure transaction, returns
 * - Quantity selector (max 99) + Add to Cart
 * - Key features, Product Specs, description, reviews
 * - Vendor products, FBT, Also Viewed, Similar, Suggestions, Recently Viewed
 */
import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
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
import VariantSelector, { type VariantData } from "@/components/ui/VariantSelector";
import { SkeletonProductDetail } from "@/components/ui/Skeleton";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { publicFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { FALLBACK_IMAGE } from "@/lib/config";
import { formatDollars } from "@/lib/money";
import { formatSoldCount } from "@/lib/formatSoldCount";
import { addToWishlist, removeFromWishlist, isInWishlist, onWishlistUpdate } from "@/lib/wishlist";
import { addToRecentlyViewed } from "@/lib/recentlyViewed";
import { ROUTES } from "@/lib/routes";

const MAX_QTY = 99;
const DISCOUNT_THRESHOLD = 5;
const INITIAL_SPECS_SHOWN = 5;

type ProductVariant = {
  publicId: string;
  sku?: string;
  title?: string | null;
  price?: number | string | null;
  compareAtPrice?: number | string | null;
  inventory?: { quantity: number; reserved: number } | null;
  shippingPriceCents?: number | null;
  optionValues?: {
    optionValue: {
      id: number;
      label: string;
      option: { id: number; name: string; sortOrder: number };
    };
  }[];
};

type ProductDetail = {
  productId: string;
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  images?: string[];
  price: number;
  compareAtPrice?: number | null;
  defaultVariantPublicId?: string | null;
  ratingAvg: number;
  reviewCount: number;
  soldCount?: number;
  vendorName: string | null;
  vendorPublicId?: string;
  categoryId?: number | null;
  badges?: Array<{ type: string; label: string; value?: number }>;
  keyFeatures?: string[] | null;
  shippingPriceCents?: number | null;
  variants?: ProductVariant[];

  brandName?: string | null;
  category?: { name?: string } | null;
  condition?: string | null;
  upcGtin?: string | null;
  material?: string | null;
  careInstructions?: string | null;
  mpn?: string | null;
  countryOfOrigin?: string | null;
  weightOz?: number | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────

function formatWeight(oz: number): string {
  if (oz >= 16) {
    const lbs = oz / 16;
    return lbs % 1 === 0 ? `${lbs} lb` : `${lbs.toFixed(1)} lb`;
  }
  return oz % 1 === 0 ? `${oz} oz` : `${oz.toFixed(1)} oz`;
}

function formatDimension(inches: number): string {
  return inches % 1 === 0 ? `${inches}"` : `${inches.toFixed(1)}"`;
}

type SpecRow = { label: string; value: string };

function buildSpecRows(product: ProductDetail): SpecRow[] {
  const rows: SpecRow[] = [];
  if (product.brandName) rows.push({ label: "Brand", value: product.brandName });
  if (product.category?.name) rows.push({ label: "Category", value: product.category.name });
  if (product.condition) rows.push({ label: "Condition", value: product.condition });
  if (product.material) rows.push({ label: "Material", value: product.material });
  if (product.countryOfOrigin) rows.push({ label: "Country of Origin", value: product.countryOfOrigin });
  if (product.upcGtin) rows.push({ label: "UPC / GTIN", value: product.upcGtin });
  if (product.mpn) rows.push({ label: "MPN", value: product.mpn });
  if (product.careInstructions) rows.push({ label: "Care Instructions", value: product.careInstructions });
  if (product.weightOz != null && product.weightOz > 0) {
    rows.push({ label: "Weight", value: formatWeight(product.weightOz) });
  }
  const dims = [product.lengthIn, product.widthIn, product.heightIn].filter(
    (v): v is number => v != null && v > 0,
  );
  if (dims.length === 3) {
    rows.push({ label: "Dimensions", value: `${formatDimension(dims[0])} × ${formatDimension(dims[1])} × ${formatDimension(dims[2])}` });
  }
  return rows;
}

// ─── Component ───────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [specsExpanded, setSpecsExpanded] = useState(false);
  const [bodyY, setBodyY] = useState(0);
  const [btnY, setBtnY] = useState(0);
  const isStickyVisible = useRef(false);
  const lastScrollY = useRef(0);

  const variantData: VariantData[] = useMemo(() => {
    if (!product?.variants?.length) return [];
    return product.variants.map((v) => {
      const p = Number(v.price);
      const cp = v.compareAtPrice ? Number(v.compareAtPrice) : null;
      return {
        publicId: v.publicId,
        title: v.title ?? null,
        price: Number.isFinite(p) ? p : product.price,
        compareAtPrice: cp && Number.isFinite(cp) ? cp : null,
        inventory: v.inventory ?? null,
        optionValues: v.optionValues,
        shippingPriceCents: v.shippingPriceCents ?? product.shippingPriceCents ?? null,
      };
    });
  }, [product]);

  const selectedVariant = useMemo(() => {
    if (!selectedVariantId || !variantData.length) return null;
    return variantData.find((v) => v.publicId === selectedVariantId) ?? variantData[0];
  }, [variantData, selectedVariantId]);

  const displayPrice = selectedVariant?.price ?? product?.price ?? 0;
  const displayCompareAt = selectedVariant?.compareAtPrice ?? product?.compareAtPrice ?? null;
  const savingsPercent = displayCompareAt != null && Number(displayCompareAt) > displayPrice
    ? Math.round((1 - displayPrice / Number(displayCompareAt)) * 100)
    : null;
  const activeVariantPublicId = selectedVariant?.publicId ?? product?.defaultVariantPublicId ?? null;

  const available = selectedVariant
    ? (selectedVariant.inventory?.quantity ?? 0) - (selectedVariant.inventory?.reserved ?? 0)
    : null;
  const inStock = available === null || available > 0;

  const shippingCents = selectedVariant?.shippingPriceCents ?? product?.shippingPriceCents ?? null;
  const shippingLabel = shippingCents != null
    ? shippingCents === 0 ? "Free Shipping" : `${formatDollars(shippingCents / 100)} shipping`
    : null;

  const specRows = useMemo(() => product ? buildSpecRows(product) : [], [product]);
  const visibleSpecs = specsExpanded ? specRows : specRows.slice(0, INITIAL_SPECS_SHOWN);

  const handleScroll = useCallback((event: any) => {
    if (!product) return;
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const isScrollingUp = currentScrollY < lastScrollY.current;
    lastScrollY.current = currentScrollY;

    const threshold = bodyY + btnY + 50;
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
        const defaultId = p.defaultVariantPublicId ?? p.variants?.[0]?.publicId ?? null;
        setSelectedVariantId(defaultId);
        addToRecentlyViewed({
          productId: p.productId,
          variantPublicId: p.defaultVariantPublicId ?? "",
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
        variantPublicId: product.defaultVariantPublicId ?? "",
        title: product.title,
        price: Math.round(product.price * 100),
        image: product.image || FALLBACK_IMAGE,
        slug: product.slug,
        categoryId: product.categoryId,
      });
    }
  }, [inWishlist, product]);

  const handleAddToCart = useCallback(async () => {
    if (!activeVariantPublicId) return;
    setAdding(true);
    try {
      await addToCart({
        variantPublicId: activeVariantPublicId,
        price: displayPrice,
        title: product?.title ?? "",
        image: product?.image || "",
        quantity: qty,
        productId: product?.productId ?? "",
        slug: product?.slug ?? "",
      });
      Alert.alert("Added to Cart", `${product?.title} (x${qty}) added to your cart.`);
    } catch {
      Alert.alert("Error", "Could not add to cart.");
    } finally {
      setAdding(false);
    }
  }, [activeVariantPublicId, displayPrice, product, qty, addToCart]);

  if (loading) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background }, { paddingTop: insets.top }]}>
        <SkeletonProductDetail />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>Product not found</AppText>
        <AppButton title="Go Back" variant="outline" onPress={() => router.canGoBack() ? router.back() : router.replace(ROUTES.homeFeed)} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const images = product.images?.length ? product.images : [product.image || FALLBACK_IMAGE];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Pressable
        style={styles.backBtn}
        onPress={() => router.canGoBack() ? router.back() : router.replace(ROUTES.homeFeed)}
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
        <ProductImageGallery
          images={images}
          inWishlist={inWishlist}
          onToggleWishlist={toggleWishlist}
        />

        <View style={styles.body} onLayout={(e) => setBodyY(e.nativeEvent.layout.y)}>
          <AppText style={styles.productTitle}>{product.title}</AppText>

          {product.vendorName && (
            <Pressable onPress={() => product.vendorPublicId && router.push(ROUTES.vendor(product.vendorPublicId))}>
              <AppText variant="caption" style={styles.vendor}>
                Sold by <AppText variant="caption" color={colors.brandBlueDark} weight="bold">{product.vendorName}</AppText>
              </AppText>
            </Pressable>
          )}

          {/* Rating + reviews + sold count */}
          <View style={styles.ratingRow}>
            <StarRating rating={product.ratingAvg} count={product.reviewCount} size={16} />
          </View>

          {product.soldCount != null && product.soldCount > 0 && (
            <AppText variant="caption" color={colors.slate600} style={{ marginTop: spacing[0.5] }}>
              {formatSoldCount(product.soldCount)} bought in past month
            </AppText>
          )}

          {/* Price Block */}
          <View style={styles.priceBlock}>
            <AppText style={styles.priceLg}>{formatDollars(displayPrice)}</AppText>
            {savingsPercent != null && savingsPercent >= DISCOUNT_THRESHOLD && displayCompareAt != null && (
              <>
                <AppText variant="priceStrike" style={styles.priceOld}>
                  {formatDollars(Number(displayCompareAt))}
                </AppText>
                <View style={styles.discountPill}>
                  <AppText style={styles.discountText}>
                    {savingsPercent}% OFF
                  </AppText>
                </View>
              </>
            )}
          </View>

          {/* Variant Selector */}
          {variantData.length > 1 && selectedVariantId && (
            <VariantSelector
              variants={variantData}
              selectedVariantId={selectedVariantId}
              onSelectVariant={(vid) => {
                setSelectedVariantId(vid);
                setQty(1);
              }}
            />
          )}

          {/* Availability */}
          <View style={styles.availabilitySection}>
            <AppText style={styles.availabilityTitle}>Availability</AppText>
            {inStock ? (
              <View style={styles.stockRow}>
                <Icon name="check-circle" size={16} color={colors.success} />
                <AppText style={styles.stockTextGreen}>Ready to ship from warehouse</AppText>
              </View>
            ) : (
              <View style={styles.stockRow}>
                <Icon name="cancel" size={16} color={colors.error} />
                <AppText style={[styles.stockTextGreen, { color: colors.error }]}>Currently unavailable</AppText>
              </View>
            )}

            {available !== null && available > 0 && available <= 5 && (
              <AppText style={styles.lowStockText}>Only {available} left</AppText>
            )}
          </View>

          {/* Shipping */}
          {shippingLabel != null && (
            <View style={styles.infoRow}>
              <Icon name="local-shipping" size={16} color={colors.slate600} />
              <AppText variant="body" color={colors.slate600}>{shippingLabel}</AppText>
            </View>
          )}

          {/* Delivery */}
          <View style={styles.infoRow}>
            <Icon name="schedule" size={16} color={colors.slate600} />
            <AppText variant="body" color={colors.slate600}>
              Expected to ship within <AppText weight="bold" color={colors.foreground}>1-2 business days</AppText>
            </AppText>
          </View>

          {/* Returns */}
          <View style={styles.infoRow}>
            <Icon name="replay" size={16} color={colors.slate600} />
            <View>
              <AppText variant="body" weight="bold" color={colors.foreground}>30-Day Returns</AppText>
              <AppText variant="caption" color={colors.slate600}>Easy returns if not satisfied</AppText>
            </View>
          </View>

          {/* Secure transaction */}
          <View style={styles.infoRow}>
            <Icon name="lock" size={16} color={colors.success} />
            <AppText variant="body" color={colors.slate600}>Secure transaction</AppText>
          </View>

          <BadgeRow badges={product.badges} />

          {/* Quantity + ATC */}
          <View style={styles.qtySection}>
            <AppText style={styles.qtyLabel}>Quantity</AppText>
            <QuantitySelector
              quantity={qty}
              onIncrease={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
              onDecrease={() => setQty((q) => Math.max(1, q - 1))}
            />
          </View>

          <View onLayout={(e) => setBtnY(e.nativeEvent.layout.y)}>
            <AppButton
              title={inStock ? "Add to Cart" : "Out of Stock"}
              variant="accent"
              onPress={handleAddToCart}
              loading={adding}
              disabled={!inStock}
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

          {/* Product Specifications */}
          {specRows.length > 0 && (
            <View style={styles.descSection}>
              <AppText style={styles.descTitle}>Product Specifications</AppText>
              <View style={styles.specsTable}>
                {visibleSpecs.map((row, i) => (
                  <View key={row.label} style={[styles.specRow, i % 2 === 0 && styles.specRowAlt]}>
                    <AppText style={styles.specLabel}>{row.label}</AppText>
                    <AppText style={styles.specValue}>{row.value}</AppText>
                  </View>
                ))}
              </View>
              {specRows.length > INITIAL_SPECS_SHOWN && (
                <Pressable onPress={() => setSpecsExpanded((v) => !v)} style={styles.specsToggle}>
                  <AppText style={styles.specsToggleText}>
                    {specsExpanded ? "Show less" : "Read more"}
                  </AppText>
                </Pressable>
              )}
            </View>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.descSection}>
              <AppText style={styles.descTitle}>Product details</AppText>
              <AppText variant="body" color={colors.slate600}>{product.description}</AppText>
            </View>
          )}

          {/* Reviews */}
          <View style={styles.reviewsWrapper}>
            <ProductReviews productId={product.productId} />
          </View>
        </View>

        {/* Recommendations */}
        <View style={styles.recommendationsSection}>
          {/* Vendor products */}
          {product.vendorPublicId && product.vendorName && (
            <ProductRecommendationSlider
              title={`More from ${product.vendorName}`}
              apiUrl={`/products/public?vendorPublicId=${encodeURIComponent(product.vendorPublicId)}&take=11&sortBy=newest`}
              accentColor={colors.brandBlue}
              onAddToCart={handleAddToCart}
              postProcess={(data) => {
                const items = Array.isArray(data) ? data : data?.products ?? [];
                return items.filter((p: any) => p.productId !== product.productId).slice(0, 10);
              }}
            />
          )}

          <ProductRecommendationSlider
            title="Frequently Bought Together"
            apiUrl={`/recommendations?context=product&productId=${encodeURIComponent(product.productId)}&type=bought_together&take=10`}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title="Customers Also Viewed"
            apiUrl={`/recommendations?context=product&productId=${encodeURIComponent(product.productId)}&type=viewed_together&take=10`}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title="Similar Products"
            apiUrl={`/recommendations?context=product&productId=${encodeURIComponent(product.productId)}&type=similar&take=10`}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title="Recommended for You"
            apiUrl="/products/public?take=10&sortBy=newest"
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <RecentlyViewedSlider onAddToCart={handleAddToCart} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.slate50 },
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
  ratingRow: { marginTop: spacing[2], marginBottom: spacing[0.5] },
  priceBlock: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: spacing[3] },
  priceLg: { fontSize: 24, fontWeight: "900", color: colors.foreground },
  priceOld: { fontSize: 16, color: colors.slate400, textDecorationLine: "line-through" },
  discountPill: { backgroundColor: colors.error, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  discountText: { color: colors.white, fontSize: 11, fontWeight: "bold" },

  availabilitySection: { marginTop: spacing[4] },
  availabilityTitle: { fontSize: 14, fontWeight: "bold", color: colors.foreground, marginBottom: spacing[1] },
  stockRow: { flexDirection: "row", alignItems: "center", gap: spacing[1.5] },
  stockTextGreen: { fontSize: 14, fontWeight: "600", color: colors.success },
  lowStockText: { fontSize: 13, fontWeight: "600", color: colors.warning, marginTop: spacing[0.5], marginLeft: spacing[4] },

  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2], marginTop: spacing[2.5] },

  qtySection: {
    flexDirection: "column", alignItems: "flex-start", gap: spacing[2],
    marginTop: spacing[4], paddingTop: spacing[4],
  },
  qtyLabel: { fontSize: 16, fontWeight: "bold", color: colors.foreground, textTransform: "uppercase" },
  descSection: { marginTop: spacing[6], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.slate200 },
  descTitle: { fontSize: 18, fontWeight: "bold", marginBottom: spacing[3], color: colors.foreground },
  featureRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing[2], gap: spacing[2] },
  featureBullet: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.brandBlue, marginTop: 8 },

  specsTable: { borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.slate200, overflow: "hidden" },
  specRow: { flexDirection: "row", paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  specRowAlt: { backgroundColor: colors.slate50 },
  specLabel: { width: 130, fontSize: 13, fontWeight: "600", color: colors.slate600 },
  specValue: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.slate800 },
  specsToggle: { marginTop: spacing[2] },
  specsToggleText: { fontSize: 14, fontWeight: "600", color: colors.brandBlue },

  reviewsWrapper: { marginTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.border },
  recommendationsSection: { marginTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[8], paddingBottom: spacing[4] },
});
