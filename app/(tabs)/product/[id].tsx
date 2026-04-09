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
import { useTranslation } from "@/hooks/useT";
import i18n from "@/i18n";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { publicFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { FALLBACK_IMAGE } from "@/lib/config";
import { formatDollars } from "@/lib/money";
import { formatSoldCount } from "@/lib/formatSoldCount";
import { addToWishlist, removeFromWishlist, isInWishlist, onWishlistUpdate } from "@/lib/wishlist";
import { addToRecentlyViewed } from "@/lib/recentlyViewed";
import { ROUTES } from "@/lib/routes";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { trackEvent, trackProductDwell } from "@/lib/tracker";

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
  images?: Array<string | { key?: string; optionGroupName?: string | null }>;
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
  if (product.brandName) rows.push({ label: i18n.t("product.specs.brand"), value: product.brandName });
  if (product.category?.name) rows.push({ label: i18n.t("product.specs.category"), value: product.category.name });
  if (product.condition) rows.push({ label: i18n.t("product.specs.condition"), value: product.condition });
  if (product.material) rows.push({ label: i18n.t("product.specs.material"), value: product.material });
  if (product.countryOfOrigin) rows.push({ label: i18n.t("product.specs.countryOfOrigin"), value: product.countryOfOrigin });
  if (product.upcGtin) rows.push({ label: i18n.t("product.specs.upcGtin"), value: product.upcGtin });
  if (product.mpn) rows.push({ label: i18n.t("product.specs.mpn"), value: product.mpn });
  if (product.careInstructions) rows.push({ label: i18n.t("product.specs.careInstructions"), value: product.careInstructions });
  if (product.weightOz != null && product.weightOz > 0) {
    rows.push({ label: i18n.t("product.specs.weight"), value: formatWeight(product.weightOz) });
  }
  const dims = [product.lengthIn, product.widthIn, product.heightIn].filter(
    (v): v is number => v != null && v > 0,
  );
  if (dims.length === 3) {
    rows.push({ label: i18n.t("product.specs.dimensions"), value: `${formatDimension(dims[0])} × ${formatDimension(dims[1])} × ${formatDimension(dims[2])}` });
  }
  return rows;
}

// ─── Component ───────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const { data: product = null, isPending: loading } = useQuery({
    queryKey: queryKeys.products.detail(id!),
    queryFn: () => publicFetch<ProductDetail>(`/products/public/${id}/view`),
    enabled: !!id,
  });
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [specsExpanded, setSpecsExpanded] = useState(false);
  const bodyYRef = useRef(0);
  const buyBoxLayoutRef = useRef({ y: 0, height: 0 });
  const hasSeenBuyBox = useRef(false);
  const isStickyVisible = useRef(false);
  const scrollRef = useRef({ lastY: 0, lastT: 0, vel: 0, firstSample: true, shownAtT: 0, lastToggleT: 0 });

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
    ? shippingCents === 0 ? t("product.freeShipping") : t("product.shippingCost", { amount: formatDollars(shippingCents / 100) })
    : null;

  const specRows = useMemo(() => product ? buildSpecRows(product) : [], [product]);
  const visibleSpecs = specsExpanded ? specRows : specRows.slice(0, INITIAL_SPECS_SHOWN);

  const VEL_SMOOTH = 0.9;
  const SHOW_VEL = -0.11;
  const HIDE_VEL = 0.14;
  const MIN_BAR_MS = 520;
  const TOGGLE_COOLDOWN_MS = 400;
  const PASS_MARGIN = 12;
  const REVEAL_BELOW_NAV = 80;

  const stickyPayload = useMemo(() => {
    if (!product) return null;
    const img = (product.images ?? [])
      .map((i) => (typeof i === "string" ? i : i?.key) ?? null)
      .find((k): k is string => typeof k === "string" && k.length > 0)
      ?? product.image ?? null;
    return {
      image: img,
      title: product.title,
      productId: product.productId,
      slug: product.slug,
      price: displayPrice,
      compareAtPrice: displayCompareAt,
      inStock,
      shippingLabel,
      variantPublicId: activeVariantPublicId,
    };
  }, [product, displayPrice, displayCompareAt, inStock, shippingLabel, activeVariantPublicId]);

  const handleBodyLayout = useCallback((e: any) => {
    bodyYRef.current = e.nativeEvent.layout.y;
  }, []);

  const handleBuyBoxLayout = useCallback((e: any) => {
    const { y, height } = e.nativeEvent.layout;
    buyBoxLayoutRef.current = { y, height };
  }, []);

  const handleScroll = useCallback((event: any) => {
    if (!product) return;

    const now = Date.now();
    const s = scrollRef.current;
    const scrollY = event.nativeEvent.contentOffset.y;
    const viewportH = event.nativeEvent.layoutMeasurement.height;

    let dtMs = now - s.lastT;
    if (s.firstSample) { s.firstSample = false; dtMs = 16; }
    dtMs = Math.max(dtMs, 1);
    const dy = scrollY - s.lastY;
    s.lastY = scrollY;
    s.lastT = now;
    const inst = dy / dtMs;
    s.vel = VEL_SMOOTH * s.vel + (1 - VEL_SMOOTH) * inst;

    const absBuyBoxBottom = bodyYRef.current + buyBoxLayoutRef.current.y + buyBoxLayoutRef.current.height;
    if (absBuyBoxBottom <= 0) return;

    const buyBoxViewportBottom = absBuyBoxBottom - scrollY;
    const buyBoxViewportTop = buyBoxViewportBottom - buyBoxLayoutRef.current.height;

    if (buyBoxViewportBottom > 0 && buyBoxViewportTop < viewportH) {
      hasSeenBuyBox.current = true;
    }

    const scrolledPastBuyBox = buyBoxViewportBottom < -PASS_MARGIN;
    const buyBoxBackInReach = buyBoxViewportBottom > REVEAL_BELOW_NAV;
    const eligible = hasSeenBuyBox.current && scrolledPastBuyBox;

    const canToggle = now - s.lastToggleT >= TOGGLE_COOLDOWN_MS;
    const minHeld = now - s.shownAtT >= MIN_BAR_MS;
    let barOn = isStickyVisible.current;

    if (!barOn) {
      if (eligible && s.vel < SHOW_VEL && canToggle) {
        barOn = true;
        s.lastToggleT = now;
        s.shownAtT = now;
      }
    } else {
      if (buyBoxBackInReach && minHeld && canToggle) {
        barOn = false;
        s.lastToggleT = now;
      } else if (s.vel > HIDE_VEL && minHeld && canToggle) {
        barOn = false;
        s.lastToggleT = now;
      }
    }

    if (barOn !== isStickyVisible.current) {
      isStickyVisible.current = barOn;
      DeviceEventEmitter.emit("toggleStickyCart", { payload: stickyPayload, visible: barOn });
    }
  }, [product, stickyPayload]);

  useEffect(() => {
    return () => {
      DeviceEventEmitter.emit("toggleStickyCart", { payload: null, visible: false });
    };
  }, []);

  const dwellMountRef = useRef(0);
  useEffect(() => {
    if (!product) return;
    dwellMountRef.current = Date.now();
    return () => {
      const dwellMs = Date.now() - dwellMountRef.current;
      if (dwellMs > 2000) {
        trackProductDwell(product.productId, dwellMs);
      }
    };
  }, [product?.productId]);

  useEffect(() => {
    if (!product) return;
    void trackEvent("product_view", { productId: product.productId });
    const defaultId = product.defaultVariantPublicId ?? product.variants?.[0]?.publicId ?? null;
    setSelectedVariantId(defaultId);
    addToRecentlyViewed({
      productId: product.productId,
      variantPublicId: product.defaultVariantPublicId ?? "",
      title: product.title,
      price: Math.round(product.price * 100),
      image: product.image || "",
      slug: product.slug,
      categoryId: product.categoryId,
      compareAtPrice: product.compareAtPrice ? Math.round(Number(product.compareAtPrice) * 100) : null,
      vendorName: product.vendorName,
      ratingAvg: product.ratingAvg,
      reviewCount: product.reviewCount,
      soldCount: product.soldCount,
      badges: product.badges,
    });
    isInWishlist(product.productId).then(setInWishlist);
  }, [product]);

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
      Alert.alert(t("product.addedToCart"), t("product.addedToCartBody", { title: product?.title, qty }));
    } catch {
      Alert.alert(t("common.error"), t("product.errorAddToCart"));
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
        <AppText variant="subtitle" color={colors.muted}>{t("product.notFound")}</AppText>
        <AppButton title={t("product.goBack")} variant="outline" onPress={() => router.canGoBack() ? router.back() : router.replace(ROUTES.homeFeed)} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const images = (product.images ?? [])
    .map((img) => (typeof img === "string" ? img : img?.key) ?? null)
    .filter((key): key is string => typeof key === "string" && key.length > 0);
  if (images.length === 0 && product.image) images.push(product.image);
  if (images.length === 0) images.push(FALLBACK_IMAGE);

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
        scrollEventThrottle={16}
      >
        <ProductImageGallery
          images={images}
          inWishlist={inWishlist}
          onToggleWishlist={toggleWishlist}
        />

        <View style={styles.body} onLayout={handleBodyLayout}>
          <AppText style={styles.productTitle}>{product.title}</AppText>

          {product.vendorName && (
            <Pressable onPress={() => product.vendorPublicId && router.push(ROUTES.vendor(product.vendorPublicId))}>
              <AppText variant="caption" style={styles.vendor}>
                {t("product.soldBy")} <AppText variant="caption" color={colors.brandBlueDark} weight="bold">{product.vendorName}</AppText>
              </AppText>
            </Pressable>
          )}

          {/* Rating + reviews + sold count */}
          <View style={styles.ratingRow}>
            <StarRating rating={product.ratingAvg} count={product.reviewCount} size={16} />
          </View>

          {product.soldCount != null && product.soldCount > 0 && (
            <AppText variant="caption" color={colors.slate600} style={{ marginTop: spacing[0.5] }}>
              {t("product.boughtInPastMonth", { count: formatSoldCount(product.soldCount) })}
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
                    {t("product.percentOff", { percent: savingsPercent })}
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
            <AppText style={styles.availabilityTitle}>{t("product.availability")}</AppText>
            {inStock ? (
              <View style={styles.stockRow}>
                <Icon name="check-circle" size={16} color={colors.success} />
                <AppText style={styles.stockTextGreen}>{t("product.readyToShip")}</AppText>
              </View>
            ) : (
              <View style={styles.stockRow}>
                <Icon name="cancel" size={16} color={colors.error} />
                <AppText style={[styles.stockTextGreen, { color: colors.error }]}>{t("product.currentlyUnavailable")}</AppText>
              </View>
            )}

            {available !== null && available > 0 && available <= 5 && (
              <AppText style={styles.lowStockText}>{t("product.onlyNLeft", { count: available })}</AppText>
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
              {t("product.expectedShipWithin")} <AppText weight="bold" color={colors.foreground}>{t("product.businessDays")}</AppText>
            </AppText>
          </View>

          {/* Returns */}
          <View style={styles.infoRow}>
            <Icon name="replay" size={16} color={colors.slate600} />
            <View>
              <AppText variant="body" weight="bold" color={colors.foreground}>{t("product.thirtyDayReturns")}</AppText>
              <AppText variant="caption" color={colors.slate600}>{t("product.easyReturns")}</AppText>
            </View>
          </View>

          {/* Secure transaction */}
          <View style={styles.infoRow}>
            <Icon name="lock" size={16} color={colors.success} />
            <AppText variant="body" color={colors.slate600}>{t("product.secureTransaction")}</AppText>
          </View>

          <BadgeRow badges={product.badges} />

          {/* Quantity + ATC */}
          <View style={styles.qtySection}>
            <AppText style={styles.qtyLabel}>{t("product.quantity")}</AppText>
            <QuantitySelector
              quantity={qty}
              onIncrease={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
              onDecrease={() => setQty((q) => Math.max(1, q - 1))}
            />
          </View>

          <View onLayout={handleBuyBoxLayout}>
            <AppButton
              title={inStock ? t("product.addToCart") : t("product.outOfStock")}
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
              <AppText style={styles.descTitle}>{t("product.keyFeatures")}</AppText>
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
              <AppText style={styles.descTitle}>{t("product.productSpecs")}</AppText>
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
                    {specsExpanded ? t("product.showLess") : t("product.readMore")}
                  </AppText>
                </Pressable>
              )}
            </View>
          )}

          {/* Description */}
          {product.description && (
            <View style={styles.descSection}>
              <AppText style={styles.descTitle}>{t("product.productDetails")}</AppText>
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
              title={t("product.moreFrom", { name: product.vendorName })}
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
            title={t("product.frequentlyBoughtTogether")}
            apiUrl={`/recommendations?context=product&productId=${encodeURIComponent(product.productId)}&type=bought_together&take=10`}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title={t("product.customersAlsoViewed")}
            apiUrl={`/recommendations?context=product&productId=${encodeURIComponent(product.productId)}&type=viewed_together&take=10`}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title={t("product.similarProducts")}
            apiUrl={`/recommendations?context=product&productId=${encodeURIComponent(product.productId)}&type=similar&take=10`}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title={t("product.recommendedForYou")}
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
