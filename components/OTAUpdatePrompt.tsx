/**
 * OTA Update Prompt — checks for available Expo updates on app foreground
 * and shows a non-blocking banner when an update has been downloaded.
 *
 * Gracefully no-ops when expo-updates native module is unavailable
 * (e.g. development builds, Expo Go).
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "./ui/AppText";
import AppButton from "./ui/AppButton";
import Icon from "./ui/Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type UpdatesModule = typeof import("expo-updates");
let Updates: UpdatesModule | null = null;

try {
  Updates = require("expo-updates");
} catch {
  if (__DEV__) console.log("expo-updates not available — OTA prompt disabled");
}

export default function OTAUpdatePrompt() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [updateReady, setUpdateReady] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const slideAnim = useRef(new Animated.Value(-120)).current;

  const checkForUpdate = useCallback(async () => {
    if (!Updates || __DEV__) return;

    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) return;

      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        setUpdateReady(true);
      }
    } catch {
      /* silent — don't interrupt user */
    }
  }, []);

  // Check on mount and when app comes to foreground
  useEffect(() => {
    checkForUpdate();

    const handleAppState = (state: AppStateStatus) => {
      if (state === "active") checkForUpdate();
    };
    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [checkForUpdate]);

  // Slide in when update is ready
  useEffect(() => {
    if (updateReady) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 60,
        friction: 10,
      }).start();
    }
  }, [updateReady, slideAnim]);

  const handleRestart = useCallback(async () => {
    if (!Updates) return;
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: -120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setUpdateReady(false));
  }, [slideAnim]);

  if (!updateReady) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: insets.top + spacing[2], transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Icon name="system-update" size={20} color={colors.white} />
        </View>
        <View style={styles.text}>
          <AppText variant="body" weight="semibold" color={colors.white}>
            {t("updates.title")}
          </AppText>
          <AppText variant="bodySmall" color="rgba(255,255,255,0.85)">
            {t("updates.message")}
          </AppText>
        </View>
      </View>
      <View style={styles.actions}>
        <AppButton
          title={t("updates.dismiss")}
          variant="ghost"
          size="sm"
          onPress={handleDismiss}
          textStyle={{ color: "rgba(255,255,255,0.8)" }}
        />
        <AppButton
          title={restarting ? t("updates.restarting") : t("updates.restart")}
          variant="outline"
          size="sm"
          onPress={handleRestart}
          disabled={restarting}
          loading={restarting}
          textStyle={{ color: colors.white }}
          style={styles.restartBtn}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    zIndex: 9999,
    backgroundColor: colors.brandBlue,
    borderRadius: borderRadius.xl,
    padding: spacing[3.5],
    ...shadows.lg,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    gap: spacing[0.5],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[2.5],
  },
  restartBtn: {
    borderColor: "rgba(255,255,255,0.5)",
  },
});
