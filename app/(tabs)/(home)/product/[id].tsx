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
import { useFocusEffect } from "expo-router";
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
import BackButton from "@/components/ui/BackButton";
import StarRating from "@/components/ui/StarRating";
import { BadgeRow } from "@/components/ui/Badge";
import ProductImageGallery from "@/components/ui/ProductImageGallery";
import ProductVideoPlayer, { type VideoEntry } from "@/components/ui/ProductVideoPlayer";
import QuantitySelector from "@/components/ui/QuantitySelector";
import ProductReviews from "@/components/ui/ProductReviews";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import RecentlyViewedSlider from "@/components/ui/RecentlyViewedSlider";
import VariantSelector, { type VariantData } from "@/components/ui/VariantSelector";
import { SkeletonProductDetail } from "@/components/ui/Skeleton";
import { useTranslation } from "@/hooks/useT";
import i18n from "@/i18n";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

import { useCart } from "@/lib/cart";
import { FALLBACK_IMAGE } from "@/lib/config";
import { formatDollars } from "@/lib/money";
import { formatSoldCount } from "@/lib/formatSoldCount";
import { addToWishlist, removeFromWishlist, isInWishlist, onWishlistUpdate } from "@/lib/wishlist";
import { addToRecentlyViewed } from "@/lib/recentlyViewed";
import { ROUTES } from "@/lib/routes";
import {
  useRecommendationsProduct,
  useProductDetail,
  useProductsList,
  useVendorMoreProducts,
  useReviewSummary,
} from "@/lib/queries";
import { trackEvent, trackProductDwell } from "@/lib/tracker";
import type { PreviewVideoMeta, PublicProduct } from "@/lib/types";

const MAX_QTY = 99;
const DISCOUNT_THRESHOLD = 5;
const INITIAL_SPECS_SHOWN = 5;
const INITIAL_FEATURES_SHOWN = 2;
const DESCRIPTION_PREVIEW_LENGTH = 300;

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

/**
 * Mirror of the per-video shape returned by `findOnePublic` on the backend.
 * Web's PDP consumes the same shape — see
 * `Wabbus/src/app/[locale]/product/[id]/[slug]/page.tsx` (`videoEntries`
 * derivation). Only `playback.mp4` is required for playback; the rest are
 * presentation hints.
 */
type ProductVideo = {
  playback?: { mp4?: string | null } | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
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
  videos?: ProductVideo[];

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

/**
 * The PDP endpoint (`/products/public/:id/view`) returns the full
 * `videos[]` list rather than the public-list `previewVideo` summary
 * field. To keep the recently-viewed slider's autoplay behavior
 * identical to the source grid, we synthesize the same
 * `PreviewVideoMeta` shape from the first video that has a usable
 * mp4 URL. Returns null when no playable video exists; the slider
 * falls back to the static image in that case.
 */
function derivePreviewVideo(
  videos: ProductVideo[] | undefined,
): PreviewVideoMeta | null {
  if (!videos?.length) return null;
  for (const v of videos) {
    const mp4Url = v?.playback?.mp4;
    if (!mp4Url) continue;
    return {
      mp4Url,
      posterUrl: v.thumbnailUrl ?? null,
      width: v.width ?? null,
      height: v.height ?? null,
      durationSec: v.duration ?? null,
    };
  }
  return null;
}

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

  const { data: productRaw, isPending: loading } = useProductDetail(id);
  const product = (productRaw as unknown as ProductDetail | undefined) ?? null;
  const { data: reviewSummary } = useReviewSummary(id);

  // Recommendation rails for this PDP — sealed-layer migration §4b/§E.3.
  // Each `useRecommendationsProduct(...)` owns one cache key in the
  // recommendations domain and is gated on `id` being present (the hook
  // itself also no-ops on undefined productId for safety).
  const fbtQuery = useRecommendationsProduct(id, "bought_together");
  const alsoViewedQuery = useRecommendationsProduct(id, "viewed_together");
  const similarQuery = useRecommendationsProduct(id, "similar");

  const vendorPublicId = product?.vendorPublicId;
  const vendorMoreQuery = useVendorMoreProducts(
    vendorPublicId,
    id,
    { enabled: !!vendorPublicId && !!id },
  );

  const pdpRecommendedQuery = useProductsList({ take: 10, sortBy: "newest" });
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [inWishlist, setInWishlist] = useState(false);
  const [specsExpanded, setSpecsExpanded] = useState(false);
  const [featuresExpanded, setFeaturesExpanded] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [videoPlayerOpen, setVideoPlayerOpen] = useState(false);
  const bodyYRef = useRef(0);
  const buyBoxLayoutRef = useRef({ y: 0, height: 0 });
  const hasSeenBuyBox = useRef(false);
  const isStickyVisible = useRef(false);
  const scrollRef = useRef({ lastY: 0, lastT: 0, vel: 0, firstSample: true, shownAtT: 0, lastToggleT: 0 });
  const scrollViewRef = useRef<ScrollView>(null);
  const reviewsYRef = useRef(0);

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

  // Derive playable video entries from the backend `videos[]` payload.
  // Mirrors web's PDP `videoEntries` derivation in
  // `Wabbus/src/app/[locale]/product/[id]/[slug]/page.tsx`. Only entries
  // with a non-empty mp4 playback URL are usable; everything else is
  // dropped silently. If the resulting list is empty we never surface
  // any video UI.
  const videoEntries: VideoEntry[] = useMemo(() => {
    if (!product?.videos?.length) return [];
    const out: VideoEntry[] = [];
    for (const v of product.videos) {
      const mp4 = v?.playback?.mp4;
      if (typeof mp4 !== "string" || mp4.length === 0) continue;
      out.push({
        mp4Url: mp4,
        thumbnailUrl: v?.thumbnailUrl ?? undefined,
        duration: v?.duration ?? undefined,
        width: v?.width ?? undefined,
        height: v?.height ?? undefined,
      });
    }
    return out;
  }, [product?.videos]);
  const hasVideos = videoEntries.length > 0;

  // The PDP endpoint (`findOnePublic`) returns the raw Prisma row, which
  // has NO flat `image` field — image lives in `images[]` (each entry is
  // typically a `{ key, url, ... }` object after `enrichImageUrls`).
  // Reading `product.image` directly silently produces `undefined`,
  // which used to surface as blank cards in the recently-viewed slider
  // and as the placeholder image on wishlist/cart entries created from
  // the PDP. Mirror the existing image-derivation used by the gallery
  // and sticky bar above so every persisted entry stores a usable R2
  // key (consumers like `ProductCard` resolve keys to URLs at render
  // time via `productImageUrl()`, picking the right size derivative).
  const primaryImageKey = useMemo<string>(() => {
    if (!product) return "";
    return (
      (product.images ?? [])
        .map((img) => (typeof img === "string" ? img : img?.key) ?? null)
        .find((k): k is string => typeof k === "string" && k.length > 0)
      ?? ""
    );
  }, [product]);

  // The PDP endpoint also has NO flat `price` — price lives on each
  // `variants[].price`. The user-visible `displayPrice` above derives
  // from the *selected* variant, but recently-viewed fires once on
  // product load before any variant interaction, so it must use the
  // explicit default-variant price (or the first variant as a fallback,
  // matching the same precedence used in `selectedVariant`/`variantData`).
  const defaultVariantPriceCents = useMemo<number>(() => {
    if (!product) return 0;
    const def =
      product.variants?.find((v) => v.publicId === product.defaultVariantPublicId)
      ?? product.variants?.[0];
    const p = def?.price != null ? Number(def.price) : NaN;
    return Number.isFinite(p) ? Math.round(p * 100) : 0;
  }, [product]);

  const defaultVariantCompareAtCents = useMemo<number | null>(() => {
    if (!product) return null;
    const def =
      product.variants?.find((v) => v.publicId === product.defaultVariantPublicId)
      ?? product.variants?.[0];
    const cp = def?.compareAtPrice != null ? Number(def.compareAtPrice) : NaN;
    return Number.isFinite(cp) ? Math.round(cp * 100) : null;
  }, [product]);

  const VEL_SMOOTH = 0.92;
  const SHOW_VEL = -0.14;
  const HIDE_VEL = 0.18;
  const MIN_BAR_MS = 900;
  const TOGGLE_COOLDOWN_MS = 600;
  const PASS_MARGIN = 24;
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

  useFocusEffect(
    useCallback(() => {
      return () => {
        isStickyVisible.current = false;
        hasSeenBuyBox.current = false;
        DeviceEventEmitter.emit("toggleStickyCart", { payload: null, visible: false });
      };
    }, []),
  );

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
      price: defaultVariantPriceCents,
      image: primaryImageKey,
      slug: product.slug,
      categoryId: product.categoryId,
      compareAtPrice: defaultVariantCompareAtCents,
      vendorName: product.vendorName,
      ratingAvg: product.ratingAvg,
      reviewCount: product.reviewCount,
      soldCount: product.soldCount,
      badges: product.badges,
      // The PDP endpoint returns the full `videos[]` list rather than
      // the public-list `previewVideo` field. Derive the same preview
      // shape from the first video that actually has a playable mp4
      // URL so the recently-viewed slider can autoplay the same clip
      // the source grid did.
      previewVideo: derivePreviewVideo(product.videos),
    });
    isInWishlist(product.productId).then(setInWishlist);
  }, [product, primaryImageKey, defaultVariantPriceCents, defaultVariantCompareAtCents]);

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
      // Snapshot the *currently visible* price (selected variant), and
      // store the R2 image key so consumers can size-derive at render
      // time. Falling back to FALLBACK_IMAGE here would persist a
      // placeholder URL into AsyncStorage, which would then leak to
      // the wishlist forever; storing an empty key lets the consumer
      // resolve to FALLBACK_IMAGE on its own per render.
      await addToWishlist({
        productId: product.productId,
        variantPublicId: activeVariantPublicId ?? product.defaultVariantPublicId ?? "",
        title: product.title,
        price: Math.round(displayPrice * 100),
        image: primaryImageKey,
        slug: product.slug,
        categoryId: product.categoryId,
      });
    }
  }, [inWishlist, product, displayPrice, primaryImageKey, activeVariantPublicId]);

  const handleAddToCart = useCallback(async (carouselProduct?: PublicProduct) => {
    console.log("[AddToCart] tapped", { activeVariantPublicId, adding, carouselProduct: !!carouselProduct, productId: product?.productId, defaultVariantPublicId: product?.defaultVariantPublicId });
    // If called from a recommendation carousel with a different product,
    // add that product (qty 1) instead of the PDP's selected variant/qty.
    if (carouselProduct && carouselProduct.productId !== product?.productId) {
      const variantId = carouselProduct.defaultVariantPublicId;
      if (!variantId) return;
      setAdding(true);
      try {
        await addToCart({
          variantPublicId: variantId,
          price: carouselProduct.price ?? 0,
          title: carouselProduct.title,
          image: carouselProduct.image ?? "",
          quantity: 1,
          productId: carouselProduct.productId,
          slug: carouselProduct.slug,
        });
      } catch {
        Alert.alert(t("common.error"), t("product.errorAddToCart"));
      } finally {
        setAdding(false);
      }
      return;
    }

    // Normal PDP add-to-cart — uses the selected variant and quantity.
    if (!activeVariantPublicId) return;
    setAdding(true);
    try {
      await addToCart({
        variantPublicId: activeVariantPublicId,
        price: displayPrice,
        title: product?.title ?? "",
        image: primaryImageKey,
        quantity: qty,
        productId: product?.productId ?? "",
        slug: product?.slug ?? "",
      });
    } catch {
      Alert.alert(t("common.error"), t("product.errorAddToCart"));
    } finally {
      setAdding(false);
    }
  }, [activeVariantPublicId, displayPrice, product, primaryImageKey, qty, addToCart, t]);

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
        <AppButton title={t("product.goBack")} variant="primary" onPress={() => router.canGoBack() ? router.back() : router.replace(ROUTES.homeFeed)} style={{ marginTop: spacing[4] }} />
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
      <BackButton
        onPress={() => router.canGoBack() ? router.back() : router.replace(ROUTES.homeFeed)}
        style={styles.backBtn}
      />

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <ProductImageGallery
          images={images}
          inWishlist={inWishlist}
          onToggleWishlist={toggleWishlist}
          hasVideos={hasVideos}
          onPlayVideo={() => setVideoPlayerOpen(true)}
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
          {(reviewSummary?.ratingAvg ?? 0) > 0 && (
            <Pressable
              style={styles.ratingRow}
              onPress={() => scrollViewRef.current?.scrollTo({ y: reviewsYRef.current, animated: true })}
            >
              <StarRating rating={reviewSummary!.ratingAvg} count={reviewSummary!.reviewCount} size={16} />
            </Pressable>
          )}

          {product.soldCount != null && product.soldCount > 0 && (
            <AppText variant="caption" color={colors.slate600} style={{ marginTop: spacing[0.5] }}>
              {t("product.boughtInPastMonth", { count: formatSoldCount(product.soldCount) })}
            </AppText>
          )}

          {/* Price Block */}
          <View style={styles.priceBlock}>
            <View>
              <AppText variant="caption" color={colors.slate500} style={{ marginBottom: spacing[0.5] }}>{t("product.oneTimePurchase")}</AppText>
              <View style={styles.priceRow}>
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
            </View>
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

          {/* Availability + Shipping */}
          <View style={styles.buyBoxInfoSection}>
            {/* Availability */}
            <View style={styles.infoCardRow}>
              <View style={[styles.iconBox, { backgroundColor: colors.brandBlueLight, borderColor: "#dbeafe" }]}>
                <Icon name="inventory-2" size={16} color={colors.brandBlue} />
              </View>
              <View style={styles.infoCardContent}>
                <AppText style={styles.infoCardTitle}>{t("product.availability")}</AppText>
                {inStock ? (
                  <AppText style={styles.stockTextGreen}>{t("product.readyToShip")}</AppText>
                ) : (
                  <AppText style={[styles.stockTextGreen, { color: colors.error }]}>{t("product.currentlyUnavailable")}</AppText>
                )}
                {available !== null && available > 0 && available <= 5 && (
                  <AppText style={styles.lowStockText}>{t("product.onlyNLeft", { count: available })}</AppText>
                )}
              </View>
            </View>

            {/* Shipping */}
            {shippingLabel != null && (
              <View style={styles.infoCardRow}>
                <View style={[styles.iconBox, { backgroundColor: colors.successLight, borderColor: "#a7f3d0" }]}>
                  <Icon name="local-shipping" size={16} color={colors.success} />
                </View>
                <View style={styles.infoCardContent}>
                  <AppText style={styles.infoCardTitle}>{shippingLabel}</AppText>
                </View>
              </View>
            )}
          </View>

          <BadgeRow badges={product.badges} />

          {/* Quantity + ATC */}
          <View style={styles.qtySection}>
            <AppText style={styles.qtyLabel}>{t("product.quantity")}</AppText>
            <QuantitySelector
              quantity={qty}
              onChange={(q) => setQty(q)}
              max={MAX_QTY}
              variant="dropdown"
            />
          </View>

          <View onLayout={handleBuyBoxLayout}>
            <AppButton
              title={inStock ? t("product.addToCart") : t("product.outOfStock")}
              variant="accent"
              size="lg"
              onPress={() => handleAddToCart()}
              loading={adding}
              disabled={!inStock}
              style={styles.addToCartBtn}
            />
          </View>

          {/* Delivery */}
          <View style={styles.deliverySection}>
            <View style={styles.infoCardRow}>
              <View style={[styles.iconBox, { backgroundColor: colors.brandBlueLight, borderColor: "#dbeafe" }]}>
                <Icon name="schedule" size={16} color={colors.brandBlue} />
              </View>
              <View style={styles.infoCardContent}>
                <AppText style={styles.infoCardTitle}>{t("product.expectedShipWithin")}</AppText>
                <AppText variant="caption" color={colors.slate500}>
                  {t("product.businessDays")}
                </AppText>
              </View>
            </View>
          </View>

          {/* Returns + Secure Section */}
          <View style={styles.trustSection}>
            <View style={styles.infoCardRow}>
              <View style={[styles.iconBox, styles.iconBoxNeutral]}>
                <Icon name="replay" size={16} color={colors.slate700} />
              </View>
              <View style={styles.infoCardContent}>
                <AppText style={styles.infoCardTitle}>{t("product.thirtyDayReturns")}</AppText>
                <AppText variant="caption" color={colors.slate500}>{t("product.easyReturns")}</AppText>
              </View>
            </View>

            {/* Secure transaction */}
            <View style={styles.secureRow}>
              <Icon name="lock" size={14} color={colors.success} />
              <AppText variant="caption" color={colors.slate500} weight="medium">{t("product.secureTransaction")}</AppText>
            </View>
          </View>

          {/* Key Features */}
          {product.keyFeatures && product.keyFeatures.length > 0 && (
            <View style={styles.descSection}>
              <AppText style={styles.featuresTitle}>{t("product.keyFeatures")}</AppText>
              {(featuresExpanded ? product.keyFeatures : product.keyFeatures.slice(0, INITIAL_FEATURES_SHOWN)).map((feature, idx) => (
                <View key={idx} style={styles.featureRow}>
                  <View style={styles.featureCheck}>
                    <Icon name="check" size={10} color="#059669" />
                  </View>
                  <AppText variant="body" color={colors.slate600} style={{ flex: 1, lineHeight: 22 }}>
                    {feature}
                  </AppText>
                </View>
              ))}
              {product.keyFeatures.length > INITIAL_FEATURES_SHOWN && (
                <Pressable
                  onPress={() => setFeaturesExpanded((v) => !v)}
                  style={styles.featuresToggle}
                  accessibilityRole="button"
                  accessibilityLabel={featuresExpanded ? t("product.showLess") : t("product.readMore")}
                >
                  <AppText style={styles.featuresToggleText}>
                    {featuresExpanded ? t("product.showLess") : t("product.readMore")}
                  </AppText>
                </Pressable>
              )}
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
              <AppText variant="body" color={colors.slate600}>
                {descExpanded || product.description.length <= DESCRIPTION_PREVIEW_LENGTH
                  ? product.description
                  : product.description.slice(0, DESCRIPTION_PREVIEW_LENGTH).trimEnd() + "…"}
              </AppText>
              {product.description.length > DESCRIPTION_PREVIEW_LENGTH && (
                <Pressable
                  onPress={() => setDescExpanded((v) => !v)}
                  style={styles.featuresToggle}
                  accessibilityRole="button"
                  accessibilityLabel={descExpanded ? t("product.showLess") : t("product.readMore")}
                >
                  <AppText style={styles.featuresToggleText}>
                    {descExpanded ? t("product.showLess") : t("product.readMore")}
                  </AppText>
                </Pressable>
              )}
            </View>
          )}

          {/* Reviews */}
          <View
            style={styles.reviewsWrapper}
            onLayout={(e) => { reviewsYRef.current = e.nativeEvent.layout.y + bodyYRef.current; }}
          >
            <ProductReviews productId={product.productId} />
          </View>
        </View>

        {/* Recommendations */}
        <View style={styles.recommendationsSection}>
          {/* Vendor products */}
          {product.vendorPublicId && product.vendorName && (
            <ProductRecommendationSlider
              title={t("product.moreFrom", { name: product.vendorName })}
              products={vendorMoreQuery.data}
              loading={vendorMoreQuery.isPending}
              accentColor={colors.brandBlue}
              onAddToCart={handleAddToCart}
            />
          )}

          <ProductRecommendationSlider
            title={t("product.frequentlyBoughtTogether")}
            products={fbtQuery.data as PublicProduct[] | undefined}
            loading={fbtQuery.isPending}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title={t("product.customersAlsoViewed")}
            products={alsoViewedQuery.data as PublicProduct[] | undefined}
            loading={alsoViewedQuery.isPending}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title={t("product.similarProducts")}
            products={similarQuery.data as PublicProduct[] | undefined}
            loading={similarQuery.isPending}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <ProductRecommendationSlider
            title={t("product.recommendedForYou")}
            products={pdpRecommendedQuery.data}
            loading={pdpRecommendedQuery.isPending}
            accentColor={colors.brandBlue}
            onAddToCart={handleAddToCart}
          />
          <RecentlyViewedSlider onAddToCart={handleAddToCart} />
        </View>
      </ScrollView>

      {/* Full-screen video player modal — mirrors web's VideoPopover.
          Mounted only when there are playable videos AND the user has
          tapped the "Watch video" badge. The modal owns its own
          tab/active-video state. */}
      {hasVideos && (
        <ProductVideoPlayer
          visible={videoPlayerOpen}
          videos={videoEntries}
          imageUrls={images}
          productTitle={product.title}
          vendorName={product.vendorName}
          onClose={() => setVideoPlayerOpen(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.slate50 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  backBtn: {
    position: "absolute", top: 56, left: spacing[4], zIndex: 20,
  },
  scrollContent: { paddingBottom: spacing[8] },
  body: { paddingHorizontal: spacing[4], paddingTop: spacing[2] },
  productTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "800",
    color: colors.slate900,
    letterSpacing: -0.3,
  },
  vendor: { marginTop: spacing[1], color: colors.slate600 },
  ratingRow: { marginTop: spacing[2], marginBottom: spacing[0.5] },

  // ── Price ─────────────────────────────────────────────────────
  priceBlock: {
    marginTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    paddingTop: spacing[3],
  },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: spacing[2.5] },
  priceLg: {
    fontSize: 30,
    fontWeight: "900",
    color: colors.slate900,
    letterSpacing: -0.5,
  },
  priceOld: {
    fontSize: 18,
    color: colors.slate400,
    fontWeight: "500",
    textDecorationLine: "line-through",
  },
  discountPill: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.md,
    ...shadows.sm,
  },
  discountText: { color: "#b91c1c", fontSize: 12, fontWeight: "bold" },

  // ── Buy Box Info (Availability / Shipping / Delivery) ─────────
  buyBoxInfoSection: {
    marginTop: spacing[5],
    gap: spacing[3.5],
  },
  infoCardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2.5],
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    ...shadows.sm,
  },
  iconBoxNeutral: {
    backgroundColor: colors.slate50,
    borderColor: colors.slate200,
  },
  infoCardContent: {
    flex: 1,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  stockTextGreen: { fontSize: 13, fontWeight: "600", color: colors.success, fontStyle: "italic", marginTop: 2 },
  lowStockText: { fontSize: 12, fontWeight: "600", color: colors.warning, marginTop: 2 },

  // ── Quantity + ATC ────────────────────────────────────────────
  qtySection: {
    flexDirection: "column", alignItems: "stretch", gap: spacing[2],
    marginTop: spacing[6], paddingTop: spacing[5],
    borderTopWidth: 1, borderTopColor: colors.slate200,
  },
  qtyLabel: { fontSize: 12, fontWeight: "bold", color: colors.slate400, textTransform: "uppercase", letterSpacing: 1 },
  addToCartBtn: {
    marginTop: spacing[5],
    borderRadius: borderRadius.xl,
    ...shadows.lg,
  },

  // ── Delivery Section (after ATC) ──────────────────────────────
  deliverySection: {
    marginTop: spacing[6],
  },

  // ── Trust Section (Returns + Secure) ──────────────────────────
  trustSection: {
    marginTop: spacing[5],
    paddingTop: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
    gap: spacing[4],
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1.5],
  },

  // ── Sections ──────────────────────────────────────────────────
  descSection: { marginTop: spacing[6], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.slate200 },
  descTitle: { fontSize: 17, fontWeight: "800", marginBottom: spacing[3], color: colors.slate900, letterSpacing: -0.2 },
  featuresTitle: { fontSize: 15, fontWeight: "700", marginBottom: spacing[2.5], color: colors.slate900 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing[2.5], gap: spacing[2.5] },
  featureCheck: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#d1fae5", alignItems: "center", justifyContent: "center",
    marginTop: 2,
  },
  featuresToggle: { marginTop: spacing[1], paddingVertical: spacing[1] },
  featuresToggleText: { fontSize: 14, fontWeight: "600", color: colors.brandBlue },

  specsTable: {
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.slate200,
    overflow: "hidden", backgroundColor: colors.white, ...shadows.sm,
  },
  specRow: { flexDirection: "row", alignItems: "baseline", paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  specRowAlt: { backgroundColor: colors.slate50 },
  specLabel: { width: 120, fontSize: 13, fontWeight: "600", color: colors.slate600 },
  specValue: { flex: 1, fontSize: 13, fontWeight: "500", color: colors.slate800 },
  specsToggle: { marginTop: spacing[2] },
  specsToggleText: { fontSize: 14, fontWeight: "600", color: colors.brandBlue },

  reviewsWrapper: { marginTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.border },
  recommendationsSection: { marginTop: spacing[2], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[8], paddingBottom: spacing[4] },
});
