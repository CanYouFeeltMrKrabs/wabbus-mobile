/**
 * TopCategoriesBar — orange scrollable category strip matching the web version.
 * Scrolls with page content (NOT sticky — per the web design).
 */
import React, { useEffect, useState } from "react";
import { View, ScrollView, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import AppText from "./AppText";
import Icon from "./Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";
import {
  fetchCategoriesClient,
  getCategoryIcon,
  CATEGORY_SHORT_NAMES,
  type CategoryLink,
} from "@/lib/categories";
import { ROUTES } from "@/lib/routes";

export default function TopCategoriesBar() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryLink[]>([]);

  useEffect(() => {
    fetchCategoriesClient().then((data) => {
      if (data && data.length > 0) {
        setCategories(data);
      }
    });
  }, []);

  // Use a pristine fallback mirroring the exact web screenshot options so the bar NEVER disappears even on local API failure
  const displayCategories = categories.length > 0 ? categories : [
    { id: 1, name: "Furniture", slug: "commercial-home-furniture" },
    { id: 2, name: "Kitchenware", slug: "home-and-kitchen" },
    { id: 3, name: "Household", slug: "everyday-household" },
    { id: 4, name: "Clothing", slug: "clothing-and-underwear" },
    { id: 5, name: "Baby", slug: "baby-maternity" },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {displayCategories.map((c) => (
          <Pressable
            key={c.slug}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            onPress={() => router.push(ROUTES.category(c.slug))}
          >
            <Icon
              name={getCategoryIcon(c.slug)}
              size={16}
              color={colors.white}
            />
            <AppText
              variant="tiny"
              color={colors.white}
              weight="bold"
              style={styles.label}
            >
              {(CATEGORY_SHORT_NAMES[c.slug] ?? c.name).toUpperCase()}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.brandOrange,
    height: 42,
    justifyContent: "center",
  },
  scroll: {
    paddingHorizontal: spacing[3],
    gap: spacing[2],
    alignItems: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
  },
  pillPressed: {
    backgroundColor: colors.overlayWhite20,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.2,
  },
});
