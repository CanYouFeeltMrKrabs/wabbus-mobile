import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import { formatDollars } from "@/lib/money";
import { colors, spacing, shadows } from "@/lib/theme";

interface ProductStickyFooterProps {
  price: number;
  isAdding: boolean;
  onAddToCart: () => void;
}

export default function ProductStickyFooter({ price, isAdding, onAddToCart }: ProductStickyFooterProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
      <View style={styles.bottomBarLeft}>
         <AppText style={styles.bottomBarPrice}>{formatDollars(price)}</AppText>
         <AppText style={styles.bottomBarStock}>In Stock</AppText>
      </View>

      <AppButton
        title={isAdding ? "Adding..." : "Add to Cart"}
        variant="primary"
        loading={isAdding}
        onPress={onAddToCart}
        style={styles.addBtn}
        textStyle={{ fontWeight: 'bold', fontSize: 16 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingTop: spacing[4],
    backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.slate200,
    ...shadows.lg,
  },
  bottomBarLeft: {
     flexDirection: 'column',
  },
  bottomBarPrice: { fontSize: 20, fontWeight: "900", color: colors.foreground },
  bottomBarStock: { fontSize: 14, fontWeight: "bold", color: colors.success },
  addBtn: {
    backgroundColor: colors.brandOrange, // The signature web orange!
    borderRadius: 12,
    paddingHorizontal: spacing[8],
    paddingVertical: 14,
  },
});
