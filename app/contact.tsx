import React from "react";
import { View, StyleSheet, Linking } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

export default function ContactScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("legal.contact.title")}</AppText>
        <BackButton icon="close" />
      </View>

      <View style={st.content}>
        <View style={st.card}>
          <View style={st.iconCircle}>
            <Icon name="support-agent" size={44} color={colors.brandBlue} />
          </View>
          <AppText variant="subtitle" style={{ textAlign: "center", marginTop: spacing[4] }}>
            {t("legal.contact.customerSupport")}
          </AppText>
          <AppText variant="body" color={colors.muted} style={{ textAlign: "center", marginTop: spacing[3] }}>
            {t("legal.contact.subtitle")}
          </AppText>
          <AppButton
            title={t("legal.contact.emailSupport")}
            variant="primary"
            fullWidth
            icon="mail-outline"
            onPress={() => Linking.openURL("mailto:support@wabbus.com")}
            style={{ marginTop: spacing[6] }}
          />
          <AppButton
            title={t("legal.contact.liveChat")}
            variant="outline"
            fullWidth
            icon="chat"
            onPress={() => router.push(ROUTES.supportLiveChat as any)}
            style={{ marginTop: spacing[3] }}
          />
          <AppText variant="caption" color={colors.muted} style={{ textAlign: "center", marginTop: spacing[5] }}>
            {t("legal.contact.supportEmail")}
          </AppText>
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  content: { flex: 1, paddingHorizontal: spacing[6], justifyContent: "center" },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius["2xl"],
    padding: spacing[8],
    alignItems: "center",
    ...shadows.md,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center",
    justifyContent: "center",
  },
});
