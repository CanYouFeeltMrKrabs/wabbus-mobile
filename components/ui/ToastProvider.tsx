import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Animated, DeviceEventEmitter, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EVENT_NAME, type ToastPayload, type ToastVariant } from "@/lib/toast";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import Icon from "./Icon";

type ToastItemType = { id: number; message: string; variant: ToastVariant };
let nextId = 0;

const MAX_MESSAGE_LENGTH = 60;
const ADDED_SUFFIX = " added to cart";

function truncateMessage(msg: string): string {
  if (msg.length <= MAX_MESSAGE_LENGTH) return msg;

  if (msg.endsWith(ADDED_SUFFIX)) {
    const titlePart = msg.slice(0, -ADDED_SUFFIX.length);
    const maxTitleLen = MAX_MESSAGE_LENGTH - ADDED_SUFFIX.length - 1;
    if (titlePart.length <= maxTitleLen) return msg;
    return titlePart.slice(0, maxTitleLen).trim() + "…" + ADDED_SUFFIX;
  }

  return msg.slice(0, MAX_MESSAGE_LENGTH - 1).trim() + "…";
}

const ICON_MAP: Record<ToastVariant, { icon: string; color: string }> = {
  success: { icon: "check-circle", color: colors.success },
  info: { icon: "info", color: colors.brandBlue },
  error: { icon: "error", color: colors.error },
};

export default function ToastProvider() {
  const [toasts, setToasts] = useState<ToastItemType[]>([]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const push = (message: string, variant: ToastVariant) => {
      const id = nextId++;
      setToasts([{ id, message: truncateMessage(message), variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2500);
    };

    const sub = DeviceEventEmitter.addListener(EVENT_NAME, (payload: ToastPayload) => {
      push(payload.message, payload.variant);
    });

    return () => {
      sub.remove();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <View style={[styles.container, { bottom: insets.bottom + spacing[12] }]} pointerEvents="none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

function ToastItem({ toast }: { toast: ToastItemType }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const { icon, color } = ICON_MAP[toast.variant];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, translateY]);

  const hasSuffix = toast.message.endsWith(ADDED_SUFFIX);
  const prefixMsg = hasSuffix ? toast.message.slice(0, -ADDED_SUFFIX.length) : toast.message;

  return (
    <Animated.View style={[styles.toastCard, { opacity: fadeAnim, transform: [{ translateY }] }]}>
      <Icon name={icon} size={20} color={color} />
      <Text style={styles.toastText} numberOfLines={1}>
        {prefixMsg}
        {hasSuffix && <Text style={styles.suffixText}>{ADDED_SUFFIX}</Text>}
      </Text>
    </Animated.View>
  );
}

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    zIndex: 9999,
    alignItems: "center",
    gap: spacing[2],
  },
  toastCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate900,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    maxWidth: width - spacing[8],
    ...shadows.lg,
    gap: spacing[2],
    marginBottom: spacing[2],
  },
  toastText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
  suffixText: {
    color: colors.slate300,
    fontWeight: "400",
  },
});
