import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

export default function AccountDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Account Details</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <DetailRow label="First Name" value={user?.firstName || "—"} />
          <DetailRow label="Last Name" value={user?.lastName || "—"} />
          <DetailRow label="Email" value={user?.email || "—"} />
          <DetailRow label="Member Since" value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"} />
        </View>

        <AppButton title="Change Password" variant="outline" fullWidth icon="lock" onPress={() => {}} style={styles.actionBtn} />
        <AppButton title="Change Email" variant="outline" fullWidth icon="email" onPress={() => {}} />
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
});
