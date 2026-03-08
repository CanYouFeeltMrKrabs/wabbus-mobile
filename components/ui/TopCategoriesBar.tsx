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

export default function TopCategoriesBar() {
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryLink[]>([]);

  useEffect(() => {
    fetchCategoriesClient().then(setCategories);
  }, []);

  if (!categories.length) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {categories.map((c) => (
          <Pressable
            key={c.slug}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
            onPress={() => router.push(`/category/${c.slug}`)}
          >
            <Icon
              name={getCategoryIcon(c.slug)}
              size={14}
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
    height: 36,
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
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
  },
  pillPressed: {
    backgroundColor: colors.overlayWhite20,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
});
