import React, { useCallback } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import ProductGrid from "@/components/ui/ProductGrid";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { useRecommendationsHome } from "@/lib/queries";
import { useCart } from "@/lib/cart";
import { colors, spacing } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

/**
 * Browse-more recommendations grid.
 *
 * Sealed-layer migration (plan §4b / §E.3): this screen previously owned a
 * raw `useQuery({ queryKey: queryKeys.recommendations.home() })` that wrote
 * the bare API envelope into the same cache entry the home-screen carousel
 * normalised to `{ products, personalized }`. That collision is the second
 * known latent bug (`.cursor/handoff-query-key-shape-collisions.md` §1).
 *
 * Closure: both surfaces now go through `useRecommendationsHome(take)`,
 * which:
 *   1. enforces the canonical `{ products, personalized }` shape via
 *      `parseOrThrow` at write time,
 *   2. parameterises the cache key by `take`, so this screen (take=200)
 *      and the home carousel (take=PRODUCTS_HOME) occupy DISTINCT cache
 *      entries with the SAME schema.
 */
const RECOMMENDED_TAKE = 200;

export default function RecommendedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const { data: recoData, isLoading: loading } = useRecommendationsHome(
    RECOMMENDED_TAKE,
  );

  const products = recoData?.products ?? [];
  const personalized = recoData?.personalized ?? false;

  const handleAddToCart = useCallback(
    (product: PublicProduct) => {
      if (!product.defaultVariantPublicId) return;
      addToCart({
        variantPublicId: product.defaultVariantPublicId,
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
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{personalized ? t("recommended.pickedForYou") : t("recommended.recommended")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: spacing[4] }}>
          <SkeletonGrid count={8} />
        </View>
      ) : products.length === 0 ? (
        <View style={st.center}>
          <AppText variant="subtitle" color={colors.muted}>{t("recommended.noRecommendations")}</AppText>
        </View>
      ) : (
        <ScrollView
          style={st.scroll}
          contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[10] }}
          showsVerticalScrollIndicator={false}
        >
          <ProductGrid products={products as PublicProduct[]} onAddToCart={handleAddToCart} />
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
});
