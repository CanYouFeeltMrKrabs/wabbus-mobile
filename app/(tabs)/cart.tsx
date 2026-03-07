/**
 * Cart Screen — matches web version layout:
 * - Cart items with image, title, quantity controls, save for later, remove
 * - Scrollable checkout footer: subtotal, shipping note, estimated total, checkout button
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { addToWishlist, isInWishlist } from "@/lib/wishlist";
import { formatMoney } from "@/lib/money";
import { FALLBACK_IMAGE, API_BASE } from "@/lib/config";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { CartItem, PublicProduct } from "@/lib/types";

function CartItemRow({
  item,
  onUpdateQty,
  onRemove,
  onSaveForLater,
}: {
  item: CartItem;
  onUpdateQty: (publicId: string, qty: number) => void;
  onRemove: (publicId: string) => void;
  onSaveForLater: (item: CartItem) => void;
}) {
  const [saved, setSaved] = useState(false);

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemRow}>
        <Image
          source={{ uri: item.image || FALLBACK_IMAGE }}
          style={styles.itemImage}
          resizeMode="cover"
        />
        <View style={styles.itemInfo}>
          <AppText variant="label" numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText variant="priceSmall" style={styles.itemPrice}>
            {formatMoney(item.unitPriceCents)}
          </AppText>

          {/* Quantity controls */}
          <View style={styles.qtyRow}>
            <AppText variant="caption">Qty:</AppText>
            <View style={styles.qtyControls}>
              <Pressable
                style={styles.qtyBtn}
                onPress={() =>
                  item.quantity > 1
                    ? onUpdateQty(item.publicId, item.quantity - 1)
                    : onRemove(item.publicId)
                }
              >
                <Icon name="remove" size={16} color={colors.foreground} />
              </Pressable>
              <AppText variant="label" style={styles.qtyText}>
                {item.quantity}
              </AppText>
              <Pressable
                style={styles.qtyBtn}
                onPress={() => onUpdateQty(item.publicId, item.quantity + 1)}
              >
                <Icon name="add" size={16} color={colors.foreground} />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.itemActions}>
        <Pressable
          style={styles.actionBtn}
          hitSlop={8}
          onPress={() => { setSaved(true); onSaveForLater(item); }}
          disabled={saved}
        >
          <Icon name={saved ? "favorite" : "favorite-border"} size={16} color={saved ? colors.brandBlueDark : colors.brandBlue} />
          <AppText variant="caption" color={saved ? colors.brandBlueDark : colors.brandBlue}>
            {saved ? "Saved" : "Save for later"}
          </AppText>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          hitSlop={8}
          onPress={() => onRemove(item.publicId)}
        >
          <Icon name="delete-outline" size={16} color={colors.error} />
          <AppText variant="caption" color={colors.error}>
            Remove
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, itemCount, subtotalCents, updateQuantity, removeItem } =
    useCart();
  const { isLoggedIn } = useAuth();

  const handleRemove = useCallback(
    (publicId: string) => {
      Alert.alert("Remove item", "Remove this item from your cart?", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeItem(publicId) },
      ]);
    },
    [removeItem],
  );

  const handleSaveForLater = useCallback(
    async (item: CartItem) => {
      await addToWishlist({
        productId: item.productId || String(item.productVariantId),
        variantId: item.productVariantId,
        title: item.title,
        price: item.unitPriceCents,
        image: item.image || FALLBACK_IMAGE,
        slug: item.slug || "product",
      });
      setTimeout(() => removeItem(item.publicId), 400);
    },
    [removeItem],
  );

  if (items.length === 0) {
    return (
      <View style={[styles.emptyScreen, { paddingTop: insets.top }]}>
        <Icon name="shopping-cart" size={64} color={colors.gray300} />
        <AppText variant="title" color={colors.muted} style={styles.emptyTitle}>
          Your cart is empty
        </AppText>
        <AppText variant="body" color={colors.mutedLight} align="center">
          Browse products and add items to get started.
        </AppText>
        <AppButton
          title="Start Shopping"
          variant="accent"
          onPress={() => router.replace("/")}
          style={styles.emptyBtn}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <AppText variant="title">
          Cart ({itemCount} item{itemCount !== 1 ? "s" : ""})
        </AppText>
      </View>

      {/* Cart items */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.publicId}
        renderItem={({ item }) => (
          <CartItemRow
            item={item}
            onUpdateQty={updateQuantity}
            onRemove={handleRemove}
            onSaveForLater={handleSaveForLater}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          <View style={styles.footer}>
            {/* Summary */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <AppText variant="body">Subtotal</AppText>
                <AppText variant="body" weight="semibold">
                  {formatMoney(subtotalCents)}
                </AppText>
              </View>
              <View style={styles.summaryRow}>
                <AppText variant="body">Shipping & tax</AppText>
                <AppText variant="body" color={colors.success} weight="medium">
                  Calculated at checkout
                </AppText>
              </View>
              <View style={styles.divider} />
              <View style={styles.summaryRow}>
                <AppText variant="subtitle">Estimated Total</AppText>
                <AppText variant="price">{formatMoney(subtotalCents)}</AppText>
              </View>
            </View>

            {/* Checkout button */}
            <AppButton
              title="Proceed to Checkout"
              variant="primary"
              iconRight="arrow-forward"
              fullWidth
              size="lg"
              onPress={() => isLoggedIn ? router.push("/checkout") : router.push("/(auth)/login")}
            />

            {/* Cart Recommendations */}
            <CartRecommendations cart={items} />
          </View>
        }
      />
    </View>
  );
}

function CartRecommendations({ cart }: { cart: CartItem[] }) {
  const router = useRouter();
  const { addToCart } = useCart();
  const [products, setProducts] = useState<PublicProduct[]>([]);

  useEffect(() => {
    if (cart.length === 0) return;
    const productIds = cart
      .map((item) => item.productId)
      .filter(Boolean) as string[];
    if (productIds.length === 0) return;

    fetch(`${API_BASE}/recommendations/cart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productIds }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.products?.length) setProducts(data.products);
      })
      .catch(() => {});
  }, [cart]);

  if (products.length === 0) return null;

  return (
    <View style={styles.recsSection}>
      <View style={styles.recsTitleRow}>
        <View style={styles.recsAccent} />
        <AppText variant="subtitle">You Might Also Like</AppText>
      </View>
      <FlatList
        data={products}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => p.productId}
        contentContainerStyle={styles.recsScroll}
        renderItem={({ item: product }) => (
          <Pressable
            style={styles.recCard}
            onPress={() => router.push(`/product/${product.productId}`)}
          >
            <Image
              source={{ uri: product.image || FALLBACK_IMAGE }}
              style={styles.recImage}
              resizeMode="cover"
            />
            <View style={styles.recInfo}>
              <AppText variant="caption" numberOfLines={2}>{product.title}</AppText>
              <AppText variant="priceSmall">${(Number(product.price) || 0).toFixed(2)}</AppText>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  listContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[4] },
  emptyScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[8],
    gap: spacing[3],
  },
  emptyTitle: { marginTop: spacing[2] },
  emptyBtn: { marginTop: spacing[4] },

  // Cart item card
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.brandBlueBorder,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  itemRow: { flexDirection: "row", gap: spacing[3] },
  itemImage: {
    width: 96,
    height: 96,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemInfo: { flex: 1 },
  itemPrice: { marginTop: spacing[1] },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[2],
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
  },
  qtyBtn: { padding: spacing[1.5] },
  qtyText: { paddingHorizontal: spacing[3] },

  // Actions row
  itemActions: {
    flexDirection: "row",
    gap: spacing[4],
    marginTop: spacing[3],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: spacing[1] },

  // Footer
  footer: { paddingTop: spacing[4], gap: spacing[4] },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...shadows.sm,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing[1.5],
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing[2],
  },

  // Cart Recommendations
  recsSection: { marginTop: spacing[6] },
  recsTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: spacing[3] },
  recsAccent: { width: 4, height: 20, borderRadius: 2, backgroundColor: colors.brandBlue },
  recsScroll: { gap: spacing[2] },
  recCard: {
    width: 140, backgroundColor: colors.card, borderRadius: borderRadius.xl,
    borderWidth: 1, borderColor: colors.gray100, overflow: "hidden", ...shadows.sm,
  },
  recImage: { width: 140, height: 105, backgroundColor: colors.gray50 },
  recInfo: { padding: spacing[2], gap: spacing[1] },
});
