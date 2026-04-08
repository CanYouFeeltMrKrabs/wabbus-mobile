import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, Image, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useCart } from "@/lib/cart";
import { loadWishlist, removeFromWishlist, onWishlistUpdate, type WishlistItem } from "@/lib/wishlist";
import { productImageUrl } from "@/lib/image";
import { formatMoney } from "@/lib/money";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

export default function WishlistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addToCart } = useCart();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await loadWishlist();
    setItems(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const unsub = onWishlistUpdate(refresh);
    return unsub;
  }, [refresh]);

  const handleRemove = useCallback(async (productId: string) => {
    await removeFromWishlist(productId);
  }, []);

  const handleAddToCart = useCallback(async (item: WishlistItem) => {
    await addToCart({
      variantPublicId: item.variantPublicId,
      price: item.price / 100,
      title: item.title,
      image: item.image,
      productId: item.productId,
      slug: item.slug,
    });
    await removeFromWishlist(item.productId);
  }, [addToCart]);

  const handleAddAllToCart = useCallback(async () => {
    for (const item of items) {
      try {
        await addToCart({
          variantPublicId: item.variantPublicId,
          price: item.price / 100,
          title: item.title,
          image: item.image,
          productId: item.productId,
          slug: item.slug,
        });
        await removeFromWishlist(item.productId);
      } catch { /* continue with remaining items */ }
    }
  }, [items, addToCart]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Wishlist</AppText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="favorite-border" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>Your wishlist is empty</AppText>
          <AppText variant="body" color={colors.mutedLight} align="center">
            Save items you love by tapping the heart icon on products
          </AppText>
          <AppButton title="Start Shopping" variant="primary" onPress={() => router.replace(ROUTES.homeFeed)} style={styles.shopBtn} />
        </View>
      ) : (
        <>
          {items.length > 1 && (
            <View style={styles.topAction}>
              <AppText variant="caption">{items.length} items saved</AppText>
              <AppButton title="Add All to Cart" variant="primary" size="sm" onPress={handleAddAllToCart} />
            </View>
          )}
          <FlatList
            data={items}
            numColumns={2}
            keyExtractor={(item) => item.productId}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            renderItem={({ item }) => (
              <View style={styles.gridCell}>
                <View style={styles.card}>
                  <Pressable style={styles.removeBtn} onPress={() => handleRemove(item.productId)}>
                    <Icon name="close" size={14} color={colors.muted} />
                  </Pressable>
                  <Pressable onPress={() => router.push(ROUTES.product(item.productId))}>
                    <Image source={{ uri: productImageUrl(item.image, "card") }} style={styles.cardImage} resizeMode="cover" />
                    <View style={styles.cardInfo}>
                      <AppText variant="label" numberOfLines={2} style={styles.cardTitle}>{item.title}</AppText>
                      <AppText variant="price">{formatMoney(item.price)}</AppText>
                    </View>
                  </Pressable>
                  <AppButton title="Add to Cart" variant="primary" size="sm" fullWidth onPress={() => handleAddToCart(item)} style={styles.cartBtn} />
                </View>
              </View>
            )}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3], paddingHorizontal: spacing[8] },
  shopBtn: { marginTop: spacing[4] },
  topAction: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing[4], paddingBottom: spacing[2] },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
  card: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl, overflow: "hidden",
    borderWidth: 1, borderColor: colors.gray100, ...shadows.sm,
  },
  removeBtn: {
    position: "absolute", top: spacing[1.5], right: spacing[1.5], zIndex: 10,
    backgroundColor: colors.overlayWhite90, borderRadius: borderRadius.full,
    width: 24, height: 24, alignItems: "center", justifyContent: "center",
    ...shadows.sm,
  },
  cardImage: { width: "100%", aspectRatio: 1, backgroundColor: colors.gray50 },
  cardInfo: { padding: spacing[2] },
  cardTitle: { minHeight: 32, marginBottom: spacing[1] },
  cartBtn: { marginHorizontal: spacing[2], marginBottom: spacing[2] },
});
