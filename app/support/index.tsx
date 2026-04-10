import React from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

const SUPPORT_OPTIONS = [
  { icon: "chat", titleKey: "support.optLiveChat", descKey: "support.optLiveChatDesc", route: ROUTES.supportLiveChat },
  { icon: "email", titleKey: "support.optSubmitTicket", descKey: "support.optSubmitTicketDesc", route: ROUTES.supportTicket },
  { icon: "storefront", titleKey: "support.optSellerMessages", descKey: "support.optSellerMessagesDesc", route: ROUTES.supportMessageSellerAll },
  { icon: "forum", titleKey: "support.optMyMessages", descKey: "support.optMyMessagesDesc", route: ROUTES.accountMessages },
  { icon: "receipt-long", titleKey: "support.optMyOrders", descKey: "support.optMyOrdersDesc", route: ROUTES.orders },
];

export default function SupportScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("support.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Icon name="support-agent" size={40} color={colors.brandBlue} />
          <AppText variant="title" style={styles.heroTitle}>{t("support.heroTitle")}</AppText>
          <AppText variant="body" color={colors.muted} align="center">
            {t("support.heroSubtitle")}
          </AppText>
        </View>

        {SUPPORT_OPTIONS.map((opt) => (
          <Pressable
            key={opt.route}
            style={({ pressed }) => [styles.optionCard, pressed && { opacity: 0.9 }]}
            onPress={() => router.push(opt.route as any)}
          >
            <View style={styles.optionIcon}>
              <Icon name={opt.icon} size={24} color={colors.brandBlue} />
            </View>
            <View style={styles.optionText}>
              <AppText variant="label">{t(opt.titleKey)}</AppText>
              <AppText variant="caption">{t(opt.descKey)}</AppText>
            </View>
            <Icon name="chevron-right" size={20} color={colors.gray400} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  heroCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[6],
    alignItems: "center", marginBottom: spacing[4], ...shadows.sm,
  },
  heroTitle: { marginTop: spacing[2], marginBottom: spacing[1] },
  optionCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.card,
    borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[2], ...shadows.sm,
  },
  optionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandBlueLight, alignItems: "center", justifyContent: "center", marginRight: spacing[3] },
  optionText: { flex: 1 },
});
