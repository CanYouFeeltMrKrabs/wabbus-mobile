import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import {
  fetchRootCategories,
  fetchCategoryChildren,
  getCategoryIcon,
  type CategoryLink,
} from "@/lib/categories";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type BreadcrumbItem = { id: number; name: string };

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [categories, setCategories] = useState<CategoryLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    const data = await fetchRootCategories();
    setCategories(data);
    setBreadcrumbs([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  const navigateInto = async (cat: CategoryLink) => {
    setLoading(true);
    const children = await fetchCategoryChildren(cat.id);
    if (children.length > 0) {
      setCategories(children);
      setBreadcrumbs((prev) => [...prev, { id: cat.id, name: cat.name }]);
    } else {
      router.push(ROUTES.category(cat.slug));
    }
    setLoading(false);
  };

  const navigateBack = async () => {
    if (breadcrumbs.length <= 1) {
      await loadRoot();
      return;
    }
    const parent = breadcrumbs[breadcrumbs.length - 2];
    setLoading(true);
    const children = await fetchCategoryChildren(parent.id);
    setCategories(children);
    setBreadcrumbs((prev) => prev.slice(0, -1));
    setLoading(false);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {breadcrumbs.length > 0 ? (
          <AppButton title="" variant="ghost" icon="arrow-back" onPress={navigateBack} style={{ width: 44 }} />
        ) : (
          <View style={{ width: 44 }} />
        )}
        <AppText variant="title">
          {breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : "All Categories"}
        </AppText>
        <View style={{ width: 44 }} />
      </View>

      {breadcrumbs.length > 0 && (
        <View style={styles.breadcrumbBar}>
          <Pressable onPress={loadRoot}>
            <AppText variant="caption" color={colors.brandBlue}>All</AppText>
          </Pressable>
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={b.id}>
              <Icon name="chevron-right" size={12} color={colors.muted} />
              <AppText
                variant="caption"
                color={i === breadcrumbs.length - 1 ? colors.foreground : colors.brandBlue}
                weight={i === breadcrumbs.length - 1 ? "semibold" : "normal"}
              >
                {b.name}
              </AppText>
            </React.Fragment>
          ))}
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : categories.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="folder-open" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>No categories found</AppText>
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(c) => String(c.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              onPress={() => navigateInto(item)}
            >
              <View style={styles.iconCircle}>
                <Icon name={getCategoryIcon(item.slug)} size={28} color={colors.brandBlue} />
              </View>
              <AppText variant="label" align="center" numberOfLines={2} style={styles.cardLabel}>
                {item.name}
              </AppText>
              <Icon name="chevron-right" size={16} color={colors.gray400} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  breadcrumbBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    flexWrap: "wrap",
  },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  list: { paddingHorizontal: spacing[3], paddingBottom: spacing[10] },
  row: { gap: spacing[3], marginBottom: spacing[3] },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    alignItems: "center",
    ...shadows.sm,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[2],
  },
  cardLabel: { marginBottom: spacing[1] },
});
