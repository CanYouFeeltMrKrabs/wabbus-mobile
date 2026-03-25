/**
 * Tab bar layout — 4 tabs: Home, Search, Cart, Account.
 * Active tab: flat orange background filling entire tab area, white icon, no labels.
 * Matches the reference HTML mockup from the design session.
 */
import React, { useState, useRef, useEffect } from "react";
import { View, Pressable, StyleSheet, Animated, DeviceEventEmitter } from "react-native";
import { Tabs, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@/components/ui/Icon";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import { useCart } from "@/lib/cart";
import { formatDollars } from "@/lib/money";
import { colors, spacing, borderRadius } from "@/lib/theme";

const TAB_CONFIG = [
  { name: "index", label: "Home", icon: "home" },
  { name: "search", label: "Search", icon: "search" },
  { name: "cart", label: "Cart", icon: "shopping-cart" },
  { name: "account", label: "Account", icon: "person" },
] as const;

function CustomTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { itemCount, addToCart } = useCart();

  const [stickyProduct, setStickyProduct] = useState<any>(null);
  const animVal = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener("toggleStickyCart", ({ product, visible }) => {
      if (product) setStickyProduct(product);
      if (visible) {
        Animated.spring(animVal, {
          toValue: 1,
          damping: 20,
          stiffness: 150,
          useNativeDriver: true,
        }).start();
      } else {
        animVal.setValue(0);
      }
    });
    return () => sub.remove();
  }, [animVal]);

  const translateYTab = animVal.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const opacityTab = animVal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const translateYCart = animVal.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
  const opacityCart = animVal.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const handleAdd = async () => {
    if (!stickyProduct?.defaultVariantPublicId) return;
    await addToCart({
      variantPublicId: stickyProduct.defaultVariantPublicId,
      price: stickyProduct.price,
      title: stickyProduct.title,
      image: stickyProduct.image || "",
      quantity: 1,
      productId: stickyProduct.productId,
      slug: stickyProduct.slug,
    });
  };

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
      <Animated.View style={[styles.tabRow, { transform: [{ translateY: translateYTab }], opacity: opacityTab }]} pointerEvents={stickyProduct ? "none" : "auto"}>
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
      </Animated.View>

      <Animated.View 
        style={[
          StyleSheet.absoluteFill, 
          styles.stickyCartContainer, 
          { transform: [{ translateY: translateYCart }], opacity: opacityCart, paddingBottom: insets.bottom }
        ]}
        pointerEvents={stickyProduct ? "auto" : "none"}
      >
        {stickyProduct && (
          <View style={styles.stickyCartInner}>
            <View style={styles.stickyTextCol}>
              <AppText style={styles.stickyPrice}>{formatDollars(stickyProduct.price)}</AppText>
              <AppText style={styles.stickyStock}>In Stock</AppText>
            </View>
            <AppButton 
              title="Add to Cart" 
              variant="accent" 
              style={styles.stickyBtn} 
              onPress={handleAdd} 
            />
          </View>
        )}
      </Animated.View>
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
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
  stickyCartContainer: {
    justifyContent: "center",
    paddingHorizontal: spacing[4],
    backgroundColor: colors.white,
  },
  stickyCartInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 42,
  },
  stickyTextCol: {
    flex: 1,
    justifyContent: "center",
  },
  stickyPrice: {
    fontSize: 18,
    fontWeight: "900",
    color: colors.foreground,
  },
  stickyStock: {
    fontSize: 12,
    fontWeight: "bold",
    color: colors.success,
  },
  stickyBtn: {
    paddingHorizontal: spacing[6],
    borderRadius: borderRadius.full,
  },
});
