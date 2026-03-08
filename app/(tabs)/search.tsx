import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import SearchBar from "@/components/ui/SearchBar";
import ProductCard from "@/components/ui/ProductCard";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { searchTypesense } from "@/lib/search";
import { useCart } from "@/lib/cart";
import type { PublicProduct, TypesenseHit } from "@/lib/types";

const SORT_OPTIONS = [
  { value: "", label: "Relevance" },
  { value: "priceAsc", label: "Price: Low" },
  { value: "priceDesc", label: "Price: High" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top Rated" },
  { value: "bestselling", label: "Best Selling" },
];

function hitToProduct(hit: TypesenseHit): PublicProduct {
  const d = hit.document;
  return {
    id: Number(d.id),
    productId: d.id,
    slug: d.slug,
    title: d.title,
    description: d.description,
    image: d.image,
    price: d.price,
    compareAtPrice: d.compareAtPrice,
    defaultVariantId: d.defaultVariantId,
    ratingAvg: d.ratingAvg,
    reviewCount: d.reviewCount,
    soldCount: d.soldCount,
    vendorName: d.vendorName,
    categoryId: d.categoryId,
  };
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { addToCart } = useCart();
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [results, setResults] = useState<PublicProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const doSearch = useCallback(async (q: string, sort?: string) => {
    abortRef.current?.abort();
    if (!q.trim()) {
      setResults([]);
      setTotal(0);
      setSearched(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSearched(true);

    try {
      const data = await searchTypesense({ q, sortBy: sort || undefined, signal: controller.signal });
      setResults(data.results.map(hitToProduct));
      setTotal(data.total);
    } catch (e: any) {
      if (e.name !== "AbortError") {
        setResults([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSubmit = useCallback(() => {
    Keyboard.dismiss();
    doSearch(query, sortBy);
  }, [query, sortBy, doSearch]);

  // Debounced live search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim().length >= 2) doSearch(query, sortBy);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, sortBy, doSearch]);

  const handleSort = useCallback((value: string) => {
    setSortBy(value);
    if (query.trim().length >= 2) doSearch(query, value);
  }, [query, doSearch]);

  const handleAddToCart = useCallback(
    (product: PublicProduct) => {
      if (!product.defaultVariantId) return;
      addToCart({
        productVariantId: product.defaultVariantId,
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
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Search input */}
      <View style={styles.header}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSubmit}
          autoFocus
        />
      </View>

      {loading && !results.length ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : searched && results.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="search-off" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted} style={styles.emptyText}>
            No results for &ldquo;{query}&rdquo;
          </AppText>
        </View>
      ) : results.length > 0 ? (
        <>
          <View style={styles.toolbarRow}>
            <AppText variant="caption">
              {total} result{total !== 1 ? "s" : ""}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[styles.sortPill, sortBy === opt.value && styles.sortPillActive]}
                  onPress={() => handleSort(opt.value)}
                >
                  <AppText
                    variant="caption"
                    color={sortBy === opt.value ? colors.white : colors.muted}
                    weight={sortBy === opt.value ? "semibold" : "normal"}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <FlatList
            data={results}
            numColumns={2}
            keyExtractor={(item) => item.productId}
            columnWrapperStyle={styles.gridRow}
            contentContainerStyle={styles.gridContent}
            renderItem={({ item }) => (
              <View style={styles.gridCell}>
                <ProductCard product={item} onAddToCart={handleAddToCart} />
              </View>
            )}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </>
      ) : (
        <View style={styles.empty}>
          <Icon name="search" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted} style={styles.emptyText}>
            Search for products
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], backgroundColor: colors.brandBlue },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  emptyText: { textAlign: "center" },
  toolbarRow: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: spacing[1], gap: spacing[2] },
  sortRow: { gap: spacing[1.5], marginTop: spacing[1.5] },
  sortPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: {
    backgroundColor: colors.brandBlue,
    borderColor: colors.brandBlue,
  },
  gridRow: { gap: spacing[3], paddingHorizontal: spacing[4] },
  gridContent: { paddingTop: spacing[2], paddingBottom: spacing[10], gap: spacing[3] },
  gridCell: { flex: 1 },
});
