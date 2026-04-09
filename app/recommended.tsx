import React, { useCallback, useMemo } from "react";
import { View, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import ProductGrid from "@/components/ui/ProductGrid";
import { SkeletonGrid } from "@/components/ui/Skeleton";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { customerFetch } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { useCart } from "@/lib/cart";
import { colors, spacing } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

function normalizeProducts(data: unknown): PublicProduct[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.products)) return obj.products as PublicProduct[];
    if (Array.isArray(obj.data)) return obj.data as PublicProduct[];
    if (Array.isArray(obj.items)) return obj.items as PublicProduct[];
  }
  return [];
}

export default function RecommendedScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();

  const { data: recoData, isLoading: loading } = useQuery({
    queryKey: queryKeys.recommendations.home(),
    queryFn: async () => {
      try {
        return await customerFetch<{ personalized?: boolean } & Record<string, unknown>>(
          `/recommendations?context=home&take=200`,
        );
      } catch {
        const res = await fetch(`${API_BASE}/products/public?take=200&skip=0`);
        if (res.ok) return await res.json();
        return null;
      }
    },
  });

  const products = useMemo(() => normalizeProducts(recoData), [recoData]);
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
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">{personalized ? t("recommended.pickedForYou") : t("recommended.recommended")}</AppText>
        <View style={{ width: 44 }} />
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
          <ProductGrid products={products} onAddToCart={handleAddToCart} />
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
