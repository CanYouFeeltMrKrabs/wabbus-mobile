/**
 * ProductGrid — 2-column product grid used on Home, Recommended, etc.
 * Wraps ProductCard in a responsive grid layout.
 *
 * Pure layout component. Per-card on-screen viewability (used to gate
 * preview-video autoplay) is handled by `useOnScreenViewability` inside
 * each `ProductCard` via the global tracker in
 * `lib/onScreenViewability.ts` — there is NO container-level provider
 * here. This grid works correctly inside any scroll surface (plain
 * ScrollView, FlatList, no scroll at all) without parent integration.
 */
import React from "react";
import { View, StyleSheet } from "react-native";
import ProductCard from "./ProductCard";
import { spacing } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

type Props = {
  products: PublicProduct[];
  onAddToCart?: (product: PublicProduct) => void;
};

export default function ProductGrid({ products, onAddToCart }: Props) {
  const rows: PublicProduct[][] = [];
  for (let i = 0; i < products.length; i += 2) {
    rows.push(products.slice(i, i + 2));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((product) => (
            <View key={product.productId} style={styles.cell}>
              <ProductCard product={product} onAddToCart={onAddToCart} />
            </View>
          ))}
          {row.length === 1 && <View style={styles.cell} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing[3] },
  row: { flexDirection: "row", gap: spacing[3] },
  cell: { flex: 1 },
});
