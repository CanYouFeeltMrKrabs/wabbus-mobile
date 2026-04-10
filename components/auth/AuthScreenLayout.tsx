/**
 * Auth shell — white backdrop + centered `.auth-card` chrome.
 */
import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { colors, spacing } from "@/lib/theme";
import { authStyles, AUTH_CARD_MAX } from "./authStyles";

type Props = {
  children: React.ReactNode;
  onClose: () => void;
};

export function AuthHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={authStyles.headerGroup}>
      <AppText style={authStyles.authTitle}>{title}</AppText>
      <AppText style={authStyles.authSubtitle}>{subtitle}</AppText>
    </View>
  );
}

export default function AuthScreenLayout({ children, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const year = new Date().getFullYear();
  const horizontalPad = spacing[6];
  const useCompactCard = width < 520;

  return (
    <KeyboardAvoidingView
      style={authStyles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[authStyles.flex, { backgroundColor: colors.white }]}>
        <Pressable
          onPress={onClose}
          hitSlop={16}
          style={[styles.closeBtn, { top: insets.top + spacing[2], left: horizontalPad }]}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Icon name="close" size={28} color={colors.slate600} />
        </Pressable>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + spacing[16],
              paddingBottom: spacing[10],
              paddingHorizontal: horizontalPad,
            },
          ]}
        >
          <View
            style={[
              authStyles.card,
              useCompactCard && authStyles.cardCompactPad,
              { maxWidth: AUTH_CARD_MAX },
            ]}
          >
            {children}
          </View>

          <AppText style={authStyles.copyright}>
            {t("auth.copyright", { year })}
          </AppText>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  closeBtn: {
    position: "absolute",
    zIndex: 2,
    padding: spacing[1],
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
});
