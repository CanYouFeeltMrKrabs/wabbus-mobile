import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import RequireAuth from "@/components/ui/RequireAuth";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/orderHelpers";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

export default function AccountDetailsScreen() {
  return <RequireAuth><AccountDetailsContent /></RequireAuth>;
}

function AccountDetailsContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("account.details.heading")}</AppText>
        <BackButton icon="close" />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <DetailRow label={t("account.details.name")} value={user?.name || "—"} />
          <DetailRow label={t("account.details.email")} value={user?.email || "—"} />
          <DetailRow label={t("account.details.memberSince")} value={formatDate(user?.createdAt)} />
        </View>

        <AppButton title={t("account.details.changePassword")} variant="primary" fullWidth icon="lock" onPress={() => router.push(ROUTES.accountChangePassword)} style={styles.actionBtn} />
        <AppButton title={t("account.details.changeEmail")} variant="accent" fullWidth icon="email" onPress={() => router.push(ROUTES.accountChangeEmail)} style={styles.actionBtn} />

        <View style={styles.dangerSection}>
          <AppButton title={t("account.details.deleteAccount")} variant="danger" fullWidth icon="delete-forever" onPress={() => router.push(ROUTES.accountDeleteAccount)} />
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="caption">{label}</AppText>
      <AppText variant="body" weight="medium">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  card: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[4], ...shadows.sm },
  detailRow: { paddingVertical: spacing[3], borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  actionBtn: { marginBottom: spacing[3] },
  dangerSection: { marginTop: spacing[6], paddingTop: spacing[4], borderTopWidth: 1, borderTopColor: colors.borderLight },
});
