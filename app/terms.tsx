import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type Section = {
  title: string;
  body?: string;
  intro?: string;
  bullets?: string[];
};

export default function TermsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const sections: Section[] = [
    { title: t("legal.terms.acceptance.title"), body: t("legal.terms.acceptance.body") },
    { title: t("legal.terms.platform.title"), body: t("legal.terms.platform.body") },
    { title: t("legal.terms.accounts.title"), body: t("legal.terms.accounts.body") },
    {
      title: t("legal.terms.ordersPayments.title"),
      bullets: [
        t("legal.terms.ordersPayments.bullet1"),
        t("legal.terms.ordersPayments.bullet2"),
        t("legal.terms.ordersPayments.bullet3"),
      ],
    },
    { title: t("legal.terms.returnsRefunds.title"), body: t("legal.terms.returnsRefunds.body") },
    {
      title: t("legal.terms.prohibitedConduct.title"),
      intro: t("legal.terms.prohibitedConduct.intro"),
      bullets: [
        t("legal.terms.prohibitedConduct.bullet1"),
        t("legal.terms.prohibitedConduct.bullet2"),
        t("legal.terms.prohibitedConduct.bullet3"),
        t("legal.terms.prohibitedConduct.bullet4"),
        t("legal.terms.prohibitedConduct.bullet5"),
      ],
    },
    { title: t("legal.terms.intellectualProperty.title"), body: t("legal.terms.intellectualProperty.body") },
    { title: t("legal.terms.liability.title"), body: t("legal.terms.liability.body") },
    { title: t("legal.terms.governingLaw.title"), body: t("legal.terms.governingLaw.body") },
  ];

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("legal.terms.title")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        <AppText variant="caption" color={colors.muted} style={{ marginBottom: spacing[1] }}>
          {t("legal.terms.company")}
        </AppText>

        {sections.map((s) => (
          <View key={s.title} style={st.section}>
            <AppText variant="subtitle" color={colors.brandBlue} style={{ marginBottom: spacing[2] }}>
              {s.title}
            </AppText>
            {s.intro && <AppText variant="body" color={colors.muted} style={{ marginBottom: spacing[2] }}>{s.intro}</AppText>}
            {s.body && <AppText variant="body" color={colors.muted}>{s.body}</AppText>}
            {s.bullets?.map((b, i) => (
              <View key={i} style={st.bullet}>
                <AppText variant="body" color={colors.brandOrange} style={{ marginRight: spacing[2] }}>{"\u2022"}</AppText>
                <AppText variant="body" color={colors.muted} style={{ flex: 1 }}>{b}</AppText>
              </View>
            ))}
          </View>
        ))}

        <View style={st.contactBox}>
          <AppText variant="subtitle" color={colors.brandBlue} style={{ marginBottom: spacing[2] }}>
            {t("legal.terms.contactUs")}
          </AppText>
          <AppText variant="body" color={colors.muted}>
            {t("legal.terms.contactUsDesc")}
          </AppText>
        </View>

        <View style={{ height: spacing[10] }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  content: { paddingHorizontal: spacing[4] },
  section: { marginBottom: spacing[6] },
  bullet: { flexDirection: "row", alignItems: "flex-start", marginTop: spacing[1], paddingLeft: spacing[2] },
  contactBox: { paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.borderLight },
});
