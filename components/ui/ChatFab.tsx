/**
 * Global floating chat button — appears on most screens, opens live chat.
 * Shows unread indicator when there are unread messages.
 * Hides on auth screens, checkout, and live-chat itself.
 */
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Pressable, StyleSheet, Animated, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import Icon from "./Icon";
import { colors, shadows } from "@/lib/theme";
import { ROUTES } from "@/lib/routes";
import { customerFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const HIDDEN_PATTERNS = [
  "/login",
  "/register",
  "/forgot-password",
  "/checkout",
  "/live-chat",
  "/impersonate",
];

function shouldHide(pathname: string): boolean {
  return HIDDEN_PATTERNS.some((p) => pathname.includes(p));
}

export default function ChatFab() {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn } = useAuth();

  const [hasUnread, setHasUnread] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const visible = !shouldHide(pathname);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: visible ? 1 : 0,
      damping: 18,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, scaleAnim]);

  const checkUnread = useCallback(async () => {
    if (!isLoggedIn) {
      setHasUnread(false);
      return;
    }
    try {
      const data = await customerFetch<{ unread?: number }>("/employee-chat/unread-count");
      setHasUnread((data?.unread ?? 0) > 0);
    } catch {
      /* ignore */
    }
  }, [isLoggedIn]);

  useEffect(() => {
    checkUnread();
    const interval = setInterval(checkUnread, 30_000);
    return () => clearInterval(interval);
  }, [checkUnread]);

  const handlePress = () => {
    router.push(ROUTES.supportLiveChat as any);
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: scaleAnim }], opacity: scaleAnim },
      ]}
      pointerEvents={visible ? "auto" : "none"}
    >
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={handlePress}
      >
        <Icon name="chat" size={26} color={colors.white} />
        {hasUnread && <View style={styles.unreadDot} />}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 100,
    right: 20,
    zIndex: 999,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.lg,
  },
  fabPressed: {
    backgroundColor: colors.brandBlueDark,
  },
  unreadDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.brandRed,
    borderWidth: 2,
    borderColor: colors.white,
  },
});
