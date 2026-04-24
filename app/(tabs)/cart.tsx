import React, { useCallback } from "react";
import { View, FlatList, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import CartItemCard from "@/components/ui/CartItemCard";
import CartSummary from "@/components/ui/CartSummary";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import { useRecommendationsStrategy, useRecommendationsCart } from "@/lib/queries";
import { useCart } from "@/lib/cart";
import type { PublicProduct } from "@/lib/types";
import { addToWishlist } from "@/lib/wishlist";
import { FALLBACK_IMAGE } from "@/lib/config";
import { ROUTES } from "@/lib/routes";
import { colors, spacing } from "@/lib/theme";
import type { CartItem } from "@/lib/types";

export default function CartScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, subtotalCents, updateQuantity, removeItem, addToCart } = useCart();

  const trendingNow = useRecommendationsStrategy("trending");
  const cartProductIds = items.map((i) => i.productId).filter(Boolean) as string[];
  const cartRecos = useRecommendationsCart(cartProductIds);

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

  const handleRemove = useCallback(
    (publicId: string) => {
      removeItem(publicId);
    },
    [removeItem],
  );

  const handleSaveForLater = useCallback(
    async (item: CartItem) => {
      await addToWishlist({
        productId: item.productId || item.variantPublicId,
        variantPublicId: item.variantPublicId,
        title: item.title,
        price: item.unitPriceCents,
        image: item.image || FALLBACK_IMAGE,
        slug: item.slug || "product",
      });
      setTimeout(() => removeItem(item.publicId), 400);
    },
    [removeItem],
  );

  const handleCheckout = () => {
    router.push(ROUTES.checkout);
  };

  if (items.length === 0) {
    return (
      <ScrollView
        style={[styles.emptyScrollRoot, { paddingTop: insets.top }]}
        contentContainerStyle={styles.emptyScrollContent}
      >
        <View style={styles.emptyHero}>
          <Icon name="shopping-cart" size={64} color={colors.gray300} />
          <AppText variant="title" color={colors.muted} style={styles.emptyTitle}>
            {t("cart.emptyTitle")}
          </AppText>
          <AppText variant="body" color={colors.mutedLight} align="center">
            {t("cart.emptyDescription")}
          </AppText>
          <AppButton
            title={t("cart.continueShopping")}
            variant="primary"
            onPress={() => router.push(ROUTES.homeFeed)}
            icon="arrow-forward"
            style={styles.emptyBtn}
          />
        </View>
        <ProductRecommendationSlider
          title={t("cart.trendingNow")}
          products={trendingNow.data as PublicProduct[] | undefined}
          loading={trendingNow.isPending}
          accentColor={colors.rose500}
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText variant="heading">{t("cart.heading")}</AppText>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.publicId}
        renderItem={({ item }) => (
          <CartItemCard
            item={item}
            onUpdateQty={updateQuantity}
            onRemove={handleRemove}
            onSaveForLater={handleSaveForLater}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View style={styles.footerInner}>
            <ProductRecommendationSlider
              title={t("common.youMightAlsoLike")}
              products={cartRecos.data as PublicProduct[] | undefined}
              loading={cartRecos.isPending}
              accentColor={colors.brandBlue}
              onAddToCart={handleAddToCart}
            />
          </View>
        }
      />

      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <CartSummary
          subtotalCents={subtotalCents}
          onCheckout={handleCheckout}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[4],
  },
  listContent: {
    paddingHorizontal: spacing[4],
    paddingBottom: 220, // Enough padding to scroll past the newly sticky footer
  },
  emptyScrollRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyScrollContent: {
    paddingBottom: spacing[10],
  },
  emptyHero: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[8],
    paddingTop: spacing[16],
    paddingBottom: spacing[8],
    gap: spacing[3],
  },
  emptyTitle: {
    marginTop: spacing[2],
  },
  emptyBtn: {
    marginTop: spacing[4],
  },
  footerInner: {
    paddingTop: spacing[2],
    paddingBottom: spacing[8],
  },
  stickyFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate200,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 10,
  },
});
