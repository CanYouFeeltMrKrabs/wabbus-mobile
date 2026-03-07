import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import ProductCard from "@/components/ui/ProductCard";
import Icon from "@/components/ui/Icon";
import { publicFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

type VendorInfo = {
  publicId: string;
  businessName: string;
  description?: string;
  products: PublicProduct[];
};

export default function VendorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();
  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    publicFetch<VendorInfo>(`/public/vendors/${id}`)
      .then(setVendor)
      .catch(() => setVendor(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleAddToCart = useCallback(
    (product: PublicProduct) => {
      if (!product.defaultVariantId) return;
      addToCart({ productVariantId: product.defaultVariantId, price: product.price, title: product.title, image: product.image || "", productId: product.productId, slug: product.slug });
    },
    [addToCart],
  );

  if (loading) {
    return <View style={[styles.center, { paddingTop: insets.top }]}><ActivityIndicator size="large" color={colors.brandBlue} /></View>;
  }

  if (!vendor) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="store" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>Vendor not found</AppText>
        <AppButton title="Go Back" variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title" numberOfLines={1} style={{ flex: 1, textAlign: "center" }}>{vendor.businessName}</AppText>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={vendor.products}
        numColumns={2}
        keyExtractor={(item) => item.productId}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.gridContent}
        ListHeaderComponent={
          vendor.description ? (
            <View style={styles.descCard}>
              <AppText variant="body" color={colors.muted}>{vendor.description}</AppText>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.gridCell}>
            <ProductCard product={item} onAddToCart={handleAddToCart} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  descCard: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginHorizontal: spacing[4], marginBottom: spacing[3], ...shadows.sm },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
});
