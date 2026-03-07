import React from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { colors, spacing } from "@/lib/theme";

export default function PaymentMethodsScreen() {
  return <RequireAuth><PaymentMethodsContent /></RequireAuth>;
}

function PaymentMethodsContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Payment Methods</AppText>
        <View style={{ width: 44 }} />
      </View>
      <View style={styles.empty}>
        <Icon name="credit-card" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>No saved payment methods</AppText>
        <AppText variant="body" color={colors.mutedLight} align="center">
          Payment methods are managed through Stripe during checkout.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3], paddingHorizontal: spacing[8] },
});
