/**
 * Universal recommendation carousel — supports all web strategies.
 * Accepts either a direct apiUrl or context+strategy params to build one.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import ProductCard from "./ProductCard";
import AppText from "./AppText";
import { customerFetch } from "@/lib/api";
import { publicFetch } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { colors, spacing } from "@/lib/theme";
import type { PublicProduct } from "@/lib/types";

type Props = {
  title: string;
  /** Fully formed endpoint (takes precedence) */
  apiUrl?: string;
  /** Alternative: build URL from context params */
  context?: "home" | "product" | "category" | "post_purchase";
  strategy?: "trending" | "deals" | "new_arrivals" | "similar" | string;
  productId?: string;
  categorySlug?: string;
  orderId?: string;
  type?: string;
  limit?: number;
  accentColor?: string;
  authenticated?: boolean;
};

function buildUrl(props: Props): string | null {
  if (props.apiUrl) return props.apiUrl;

  const params = new URLSearchParams();
  if (props.context) params.set("context", props.context);
  if (props.strategy) params.set("strategy", props.strategy);
  if (props.productId) params.set("productId", props.productId);
  if (props.categorySlug) params.set("categorySlug", props.categorySlug);
  if (props.orderId) params.set("orderId", props.orderId);
  if (props.type) params.set("type", props.type);
  params.set("take", String(props.limit ?? 10));

  return `/recommendations?${params.toString()}`;
}

export default function RecommendationCarousel(props: Props) {
  const { title, accentColor = colors.brandBlue, authenticated = false, limit = 10 } = props;
  const { addItem } = useCart();
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = buildUrl(props);
    if (!url) {
      setLoading(false);
      return;
    }

    const doFetch = authenticated ? customerFetch : publicFetch;
    doFetch<any>(url)
      .then((data) => {
        const list = Array.isArray(data)
          ? data
          : data?.products ?? data?.data ?? [];
        setProducts(list.slice(0, limit));
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.section}>
        <AppText variant="subtitle" color={accentColor} style={styles.title}>
          {title}
        </AppText>
        <ActivityIndicator size="small" color={accentColor} />
      </View>
    );
  }

  if (products.length === 0) return null;

  return (
    <View style={styles.section}>
      <AppText variant="subtitle" color={accentColor} style={styles.title}>
        {title}
      </AppText>
      <FlatList
        horizontal
        data={products}
        keyExtractor={(p) => p.productId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <ProductCard product={item} onAddToCart={addItem} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing[6] },
  title: { paddingHorizontal: spacing[4], marginBottom: spacing[3] },
  listContent: { paddingHorizontal: spacing[3] },
  cardWrap: { width: 160, marginRight: spacing[3] },
});
