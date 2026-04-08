import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "./AppText";
import Icon from "./Icon";
import { useNetwork } from "@/lib/network";
import { colors, spacing } from "@/lib/theme";

export default function OfflineBanner() {
  const { isConnected, isInternetReachable } = useNetwork();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-80)).current;

  const offline = !isConnected || isInternetReachable === false;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: offline ? 0 : -80,
      damping: 20,
      stiffness: 200,
      useNativeDriver: true,
    }).start();
  }, [offline, translateY]);

  return (
    <Animated.View
      style={[
        styles.banner,
        { paddingTop: insets.top + spacing[1], transform: [{ translateY }] },
      ]}
      pointerEvents={offline ? "auto" : "none"}
    >
      <Icon name="wifi-off" size={16} color={colors.white} />
      <AppText variant="caption" color={colors.white} weight="semibold" style={styles.text}>
        No internet connection
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing[2],
    backgroundColor: colors.gray800,
  },
  text: {
    marginLeft: spacing[2],
  },
});
