import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";

function CheckItem({ text }: { text: string }) {
  return (
    <View style={st.checkRow}>
      <Icon name="check-circle" size={16} color={colors.brandOrange} style={{ marginTop: 2 }} />
      <AppText variant="body" color={colors.muted} style={{ flex: 1 }}>{text}</AppText>
    </View>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={st.bullet}>
      <AppText variant="body" color={colors.brandOrange} style={{ marginRight: spacing[2] }}>{"\u2022"}</AppText>
      <AppText variant="body" color={colors.muted} style={{ flex: 1 }}>{text}</AppText>
    </View>
  );
}

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const usageItems = [
    t("legal.privacy.usage.item1"),
    t("legal.privacy.usage.item2"),
    t("legal.privacy.usage.item3"),
    t("legal.privacy.usage.item4"),
    t("legal.privacy.usage.item5"),
    t("legal.privacy.usage.item6"),
    t("legal.privacy.usage.item7"),
    t("legal.privacy.usage.item8"),
    t("legal.privacy.usage.item9"),
  ];

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("legal.privacy.title")}</AppText>
        <BackButton icon="close" />
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        <AppText variant="caption" color={colors.muted} style={{ marginBottom: spacing[1] }}>
          {t("legal.privacy.company")}
        </AppText>

        <View style={st.section}>
          <AppText variant="subtitle" color={colors.brandBlue} style={st.heading}>{t("legal.privacy.intro.title")}</AppText>
          <AppText variant="body" color={colors.muted}>
            {t("legal.privacy.intro.body")}
          </AppText>
        </View>

        <View style={st.section}>
          <AppText variant="subtitle" color={colors.brandBlue} style={st.heading}>{t("legal.privacy.marketplace.title")}</AppText>
          <AppText variant="body" color={colors.muted} style={{ marginBottom: spacing[2] }}>
            {t("legal.privacy.marketplace.body")}
          </AppText>
          <BulletItem text={t("legal.privacy.marketplace.bullet1")} />
          <BulletItem text={t("legal.privacy.marketplace.bullet2")} />
          <BulletItem text={t("legal.privacy.marketplace.bullet3")} />

          <AppText variant="label" style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>{t("legal.privacy.marketplace.orderHeading")}</AppText>
          <BulletItem text={t("legal.privacy.marketplace.orderBullet1")} />
          <BulletItem text={t("legal.privacy.marketplace.orderBullet2")} />
          <BulletItem text={t("legal.privacy.marketplace.orderBullet3")} />
          <BulletItem text={t("legal.privacy.marketplace.orderBullet4")} />
          <BulletItem text={t("legal.privacy.marketplace.orderBullet5")} />
        </View>

        <View style={st.section}>
          <AppText variant="subtitle" color={colors.brandBlue} style={st.heading}>{t("legal.privacy.collection.title")}</AppText>
          <AppText variant="body" color={colors.muted} style={{ marginBottom: spacing[3] }}>
            {t("legal.privacy.collection.body")}
          </AppText>

          <AppText variant="label" style={{ marginBottom: spacing[2] }}>{t("legal.privacy.collection.customerHeading")}</AppText>
          <BulletItem text={t("legal.privacy.collection.customerBullet1")} />
          <BulletItem text={t("legal.privacy.collection.customerBullet2")} />
          <BulletItem text={t("legal.privacy.collection.customerBullet3")} />
          <BulletItem text={t("legal.privacy.collection.customerBullet4")} />
          <BulletItem text={t("legal.privacy.collection.customerBullet5")} />
          <BulletItem text={t("legal.privacy.collection.customerBullet6")} />

          <View style={st.infoBox}>
            <AppText variant="caption" weight="bold">{t("legal.privacy.collection.noCardNotice")}</AppText>
            <AppText variant="caption" color={colors.muted}> {t("legal.privacy.collection.noCardNoticeDesc")}</AppText>
          </View>

          <AppText variant="label" style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>{t("legal.privacy.collection.autoHeading")}</AppText>
          <BulletItem text={t("legal.privacy.collection.autoBullet1")} />
          <BulletItem text={t("legal.privacy.collection.autoBullet2")} />
          <BulletItem text={t("legal.privacy.collection.autoBullet3")} />
          <BulletItem text={t("legal.privacy.collection.autoBullet4")} />

          <View style={st.infoBox}>
            <AppText variant="caption" color={colors.muted}>
              {t("legal.privacy.collection.noAnalyticsNotice")}
            </AppText>
          </View>
        </View>

        <View style={st.section}>
          <AppText variant="subtitle" color={colors.brandBlue} style={st.heading}>{t("legal.privacy.usage.title")}</AppText>
          <AppText variant="body" color={colors.muted} style={{ marginBottom: spacing[3] }}>
            {t("legal.privacy.usage.body")}
          </AppText>
          {usageItems.map((item) => (
            <CheckItem key={item} text={item} />
          ))}
          <AppText variant="label" style={{ marginTop: spacing[3] }}>
            {t("legal.privacy.usage.noAdvertisingNotice")}
          </AppText>
        </View>

        <View style={st.contactBox}>
          <AppText variant="subtitle" color={colors.brandBlue} style={{ marginBottom: spacing[2] }}>
            {t("legal.privacy.contactUs")}
          </AppText>
          <AppText variant="body" color={colors.muted}>
            {t("legal.privacy.contactUsDesc")}
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
  heading: { marginBottom: spacing[2] },
  bullet: { flexDirection: "row", alignItems: "flex-start", marginTop: spacing[1], paddingLeft: spacing[2] },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2], marginTop: spacing[2] },
  infoBox: { backgroundColor: colors.gray50, padding: spacing[3], borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.borderLight, marginTop: spacing[3] },
  contactBox: { paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.borderLight },
});
