import React, { useState } from "react";
import { View, Image, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { CartItem } from "@/lib/types";

const MAX_CART_QTY = 99;

interface CartItemCardProps {
  item: CartItem;
  onUpdateQty: (publicId: string, qty: number) => void;
  onRemove: (publicId: string) => void;
  onSaveForLater: (item: CartItem) => void;
}

export default function CartItemCard({ item, onUpdateQty, onRemove, onSaveForLater }: CartItemCardProps) {
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const lineTotal = item.unitPriceCents * item.quantity;
  const atMax = item.quantity >= MAX_CART_QTY;

  const navigateToProduct = () => {
    if (item.productId) router.push(ROUTES.product(item.productId));
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Pressable onPress={navigateToProduct}>
          <Image
            source={{ uri: productImageUrl(item.image, "thumb") }}
            style={styles.image}
            resizeMode="cover"
          />
        </Pressable>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Pressable onPress={navigateToProduct} style={{ flex: 1 }}>
              <AppText variant="label" numberOfLines={2} style={styles.title}>
                {item.title}
              </AppText>
            </Pressable>
            <AppText variant="label" weight="semibold" style={styles.price}>
              {formatMoney(lineTotal)}
            </AppText>
          </View>

          {item.variantLabel && (
            <AppText variant="caption" color={colors.slate500} style={{ marginTop: spacing[0.5] }}>
              {item.variantLabel}
            </AppText>
          )}

          {item.vendorName && (
            <AppText variant="caption" color={colors.slate400} style={{ marginTop: spacing[0.5] }} numberOfLines={1}>
              Sold by <AppText variant="caption" color={colors.slate500} weight="medium">{item.vendorName}</AppText>
            </AppText>
          )}

          <View style={styles.qtyRow}>
            <AppText variant="caption" color={colors.muted}>Qty:</AppText>
            <View style={styles.qtyBox}>
              <Pressable
                style={[styles.qtyBtn, item.quantity <= 1 && styles.qtyBtnDisabled]}
                onPress={() => item.quantity > 1 ? onUpdateQty(item.publicId, item.quantity - 1) : undefined}
                disabled={item.quantity <= 1}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="remove" size={16} color={item.quantity <= 1 ? colors.slate300 : colors.foreground} />
              </Pressable>
              <AppText variant="label" style={styles.qtyValue}>{item.quantity}</AppText>
              <Pressable
                style={[styles.qtyBtn, atMax && styles.qtyBtnDisabled]}
                onPress={() => !atMax ? onUpdateQty(item.publicId, item.quantity + 1) : undefined}
                disabled={atMax}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="add" size={16} color={atMax ? colors.slate300 : colors.foreground} />
              </Pressable>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.saveBtn, saved && styles.saveBtnActive]}
              onPress={() => { setSaved(true); onSaveForLater(item); }}
              disabled={saved}
            >
              <Icon name={saved ? "favorite" : "favorite-border"} size={14} color={saved ? colors.brandBlueDark : colors.muted} />
              <AppText variant="caption" color={saved ? colors.brandBlueDark : colors.muted}>
                {saved ? "Saved" : "Save for later"}
              </AppText>
            </Pressable>

            <Pressable style={styles.removeBtn} onPress={() => onRemove(item.publicId)}>
               <Icon name="delete-outline" size={14} color={colors.error} />
               <AppText variant="caption" color={colors.error} weight="medium">Remove</AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(10, 68, 151, 0.2)",
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  row: {
    flexDirection: "row",
    gap: spacing[4],
  },
  image: {
    width: 96,
    height: 96,
    borderRadius: 8,
    backgroundColor: colors.gray100,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing[2],
  },
  title: {
    flex: 1,
    color: colors.foreground,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "bold",
  },
  price: {
    color: colors.foreground,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "bold",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[2],
    gap: spacing[2],
  },
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 8,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  qtyBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnDisabled: {
    opacity: 0.4,
  },
  qtyValue: {
    width: 40,
    height: 32,
    lineHeight: 32,
    textAlign: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.slate200,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: spacing[4],
    marginTop: 12,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: borderRadius.full,
  },
  saveBtnActive: {
    borderColor: colors.brandBlueBorder,
    backgroundColor: colors.brandBlueLight,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[3],
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.2)",
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(254, 226, 226, 0.5)",
  },
});
