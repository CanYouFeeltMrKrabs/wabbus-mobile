import React from "react";
import { View, StyleSheet, ScrollView, Linking, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

const STANDARDS = [
  { titleKey: "legal.accessibility.standard1Title", descKey: "legal.accessibility.standard1Desc", icon: "code" },
  { titleKey: "legal.accessibility.standard2Title", descKey: "legal.accessibility.standard2Desc", icon: "keyboard" },
  { titleKey: "legal.accessibility.standard3Title", descKey: "legal.accessibility.standard3Desc", icon: "contrast" },
  { titleKey: "legal.accessibility.standard4Title", descKey: "legal.accessibility.standard4Desc", icon: "devices" },
];

export default function AccessibilityScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("legal.accessibility.title")}</AppText>
        <BackButton icon="close" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <AppText variant="body" color={colors.slate600} style={styles.intro}>
          {t("legal.accessibility.intro")}
        </AppText>

        {/* WCAG badge */}
        <View style={styles.complianceCard}>
          <Icon name="verified" size={28} color={colors.brandBlue} />
          <View style={styles.complianceText}>
            <AppText variant="label">{t("legal.accessibility.complianceTitle")}</AppText>
            <AppText variant="body" color={colors.slate600} style={{ marginTop: spacing[1], lineHeight: 22 }}>
              {t("legal.accessibility.complianceBody")}
            </AppText>
          </View>
        </View>

        {/* Standards */}
        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("legal.accessibility.standardsTitle")}
        </AppText>
        <AppText variant="body" color={colors.slate600} style={styles.sectionBody}>
          {t("legal.accessibility.standardsBody")}
        </AppText>

        {STANDARDS.map((s) => (
          <View key={s.titleKey} style={styles.standardCard}>
            <Icon name={s.icon as any} size={20} color={colors.brandOrange} style={{ marginTop: 2 }} />
            <View style={styles.standardText}>
              <AppText variant="label">{t(s.titleKey)}</AppText>
              <AppText variant="body" color={colors.slate600} style={{ lineHeight: 22, marginTop: spacing[0.5] }}>
                {t(s.descKey)}
              </AppText>
            </View>
          </View>
        ))}

        {/* Inclusive Shopping */}
        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("legal.accessibility.inclusiveTitle")}
        </AppText>
        <AppText variant="body" color={colors.slate600} style={styles.sectionBody}>
          {t("legal.accessibility.inclusiveBody")}
        </AppText>

        {/* ADA */}
        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("legal.accessibility.adaTitle")}
        </AppText>
        <AppText variant="body" color={colors.slate600} style={styles.sectionBody}>
          {t("legal.accessibility.adaBody")}
        </AppText>

        {/* Feedback */}
        <View style={styles.feedbackSection}>
          <AppText variant="subtitle" style={{ marginBottom: spacing[2] }}>
            {t("legal.accessibility.feedbackTitle")}
          </AppText>
          <AppText variant="body" color={colors.slate600} style={{ lineHeight: 22, marginBottom: spacing[4] }}>
            {t("legal.accessibility.feedbackBody")}
          </AppText>
          <Pressable
            style={styles.contactBtn}
            onPress={() => Linking.openURL("mailto:support@wabbus.com")}
          >
            <Icon name="support-agent" size={18} color={colors.white} />
            <AppText variant="button" color={colors.white}>
              {t("legal.accessibility.contactSupport")}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
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
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  intro: { lineHeight: 24, marginBottom: spacing[5] },
  complianceCard: {
    flexDirection: "row",
    gap: spacing[3],
    backgroundColor: colors.brandBlueLight,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.brandBlueBorder,
    marginBottom: spacing[6],
  },
  complianceText: { flex: 1 },
  sectionTitle: { marginBottom: spacing[2], marginTop: spacing[2] },
  sectionBody: { lineHeight: 24, marginBottom: spacing[4] },
  standardCard: {
    flexDirection: "row",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing[4],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  standardText: { flex: 1 },
  feedbackSection: {
    marginTop: spacing[4],
    paddingTop: spacing[5],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.brandBlue,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing[3.5],
    ...shadows.lg,
  },
});
