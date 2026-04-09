/**
 * Tab bar layout — 4 tabs: Home, Search, Cart, Account.
 * Active tab: flat orange background filling entire tab area, white icon, no labels.
 *
 * A sticky "Add to Cart" bar slides up above the tab bar when the PDP emits
 * toggleStickyCart — matching the web StickyMobileCart behavior.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, Image, Pressable, StyleSheet, Animated, Easing, DeviceEventEmitter } from "react-native";
import { Tabs, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/ui/Icon";
import AppText from "@/components/ui/AppText";
import { useCart } from "@/lib/cart";
import { formatDollars } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

const TAB_CONFIG = [
  { name: "index", label: "Home", icon: "home" },
  { name: "search", label: "Search", icon: "search" },
  { name: "cart", label: "Cart", icon: "shopping-cart" },
  { name: "account", label: "Account", icon: "person" },
] as const;

type StickyPayload = {
  image: string | null;
  title: string;
  productId: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  inStock: boolean;
  shippingLabel: string | null;
  variantPublicId: string | null;
};

const STICKY_BAR_HEIGHT = 56;

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { itemCount, addToCart } = useCart();

  const [stickyData, setStickyData] = useState<StickyPayload | null>(null);
  const stickyVisible = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(1)).current;

  const dismissBar = useCallback(() => {
    stickyVisible.current = false;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => setStickyData(null));
  }, [fadeAnim, slideAnim]);

  useEffect(() => {
    if (!pathname.includes("/product/") && stickyVisible.current) {
      dismissBar();
    }
  }, [pathname, dismissBar]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("toggleStickyCart", ({ payload, visible }) => {
      if (payload) setStickyData(payload);
      if (visible && !stickyVisible.current) {
        stickyVisible.current = true;
        slideAnim.setValue(1);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(slideAnim, {
            toValue: 0,
            tension: 80,
            friction: 10,
            useNativeDriver: true,
          }),
        ]).start();
      } else if (!visible && stickyVisible.current) {
        dismissBar();
      }
    });
    return () => sub.remove();
  }, [fadeAnim, slideAnim, dismissBar]);

  const stickyTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, STICKY_BAR_HEIGHT],
  });

  const handleAdd = async () => {
    if (!stickyData?.variantPublicId) return;
    await addToCart({
      variantPublicId: stickyData.variantPublicId,
      price: stickyData.price,
      title: stickyData.title,
      image: stickyData.image || "",
      quantity: 1,
      productId: stickyData.productId,
      slug: stickyData.slug,
    });
  };

  const thumbUri = stickyData?.image ? productImageUrl(stickyData.image, "thumb") : null;
  const hasDiscount = stickyData?.compareAtPrice != null && stickyData.compareAtPrice > stickyData.price;

  return (
    <View style={styles.wrapper}>
      {/* Sticky cart bar — floats above the tab bar */}
      <Animated.View
        style={[
          styles.stickyBar,
          { transform: [{ translateY: stickyTranslateY }], opacity: fadeAnim },
        ]}
        pointerEvents={stickyData ? "auto" : "none"}
      >
        {stickyData && (
          <View style={styles.stickyInner}>
            {thumbUri && (
              <View style={styles.stickyThumbWrap}>
                <Image source={{ uri: thumbUri }} style={styles.stickyThumb} resizeMode="contain" />
              </View>
            )}

            <View style={styles.stickyInfoCol}>
              <View style={styles.stickyPriceRow}>
                <AppText style={styles.stickyPrice}>
                  {formatDollars(stickyData.price)}
                </AppText>
                {hasDiscount && (
                  <AppText style={styles.stickyCompare}>
                    {formatDollars(stickyData.compareAtPrice!)}
                  </AppText>
                )}
              </View>
              <View style={styles.stickyMetaRow}>
                <AppText style={[
                  styles.stickyStock,
                  { color: stickyData.inStock ? colors.success : colors.error },
                ]}>
                  {stickyData.inStock ? "In Stock" : "Out of Stock"}
                </AppText>
                {stickyData.shippingLabel && (
                  <>
                    <AppText style={styles.stickyDot}>·</AppText>
                    <AppText style={[
                      styles.stickyShipping,
                      stickyData.shippingLabel === "Free Shipping" && { color: colors.success, fontWeight: "700" },
                    ]}>
                      {stickyData.shippingLabel}
                    </AppText>
                  </>
                )}
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.stickyBtn,
                pressed && styles.stickyBtnPressed,
                !stickyData.inStock && { opacity: 0.5 },
              ]}
              onPress={handleAdd}
              disabled={!stickyData.inStock}
            >
              <Icon name="add-shopping-cart" size={18} color={colors.white} />
              <AppText style={styles.stickyBtnText}>Add to Cart</AppText>
            </Pressable>
          </View>
        )}
      </Animated.View>

      {/* Tab bar — always visible */}
      <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
        <View style={styles.tabRow}>
          {state.routes.map((route: any, index: number) => {
            const focused = state.index === index;
            const config = TAB_CONFIG[index];
            if (!config) return null;

            return (
              <Pressable
                key={route.key}
                style={[
                  styles.tab,
                  { backgroundColor: focused ? colors.brandOrange : colors.transparent },
                ]}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!event.defaultPrevented) {
                    navigation.navigate(route.name, route.params);
                  }
                }}
              >
                <View>
                  <Icon
                    name={config.icon}
                    size={24}
                    color={focused ? colors.white : colors.muted}
                  />
                  {config.name === "cart" && itemCount > 0 && (
                    <View style={styles.cartBadge}>
                      <AppText variant="tiny" color={colors.white} weight="bold" style={styles.cartBadgeText}>
                        {itemCount > 99 ? "99+" : String(itemCount)}
                      </AppText>
                    </View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="search" />
      <Tabs.Screen name="cart" />
      <Tabs.Screen name="account" />
      <Tabs.Screen name="product/[id]" options={{ href: null }} />
      <Tabs.Screen name="category/[slug]" options={{ href: null }} />
      <Tabs.Screen name="categories" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  tabBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 10,
  },
  tabRow: {
    flexDirection: "row",
    height: 42,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: colors.brandRed,
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  cartBadgeText: {
    fontSize: 9,
    lineHeight: 12,
  },

  /* ── Sticky cart bar ──────────────────────────────────── */
  stickyBar: {
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.92)",
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(226,232,240,0.9)",
    shadowColor: colors.slate900,
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.14,
    shadowRadius: 24,
    elevation: 16,
  },
  stickyInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1.5],
    paddingHorizontal: spacing[2.5],
    paddingVertical: spacing[1.5],
    minHeight: STICKY_BAR_HEIGHT,
  },
  stickyThumbWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.slate100,
    backgroundColor: colors.slate50,
  },
  stickyThumb: {
    width: "100%",
    height: "100%",
  },
  stickyInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  stickyPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing[1],
  },
  stickyPrice: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.slate900,
    letterSpacing: -0.3,
  },
  stickyCompare: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.slate400,
    textDecorationLine: "line-through",
  },
  stickyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    marginTop: 1,
  },
  stickyStock: {
    fontSize: 11,
    fontWeight: "700",
  },
  stickyDot: {
    fontSize: 11,
    color: colors.slate300,
  },
  stickyShipping: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.slate500,
  },
  stickyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    backgroundColor: colors.brandOrange,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[4],
    height: 40,
    ...shadows.md,
  },
  stickyBtnPressed: {
    backgroundColor: colors.brandOrangeHover,
  },
  stickyBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.white,
  },
});
