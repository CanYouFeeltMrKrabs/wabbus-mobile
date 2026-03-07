import React from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { colors, spacing } from "@/lib/theme";

export default function OrderCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.check}>
        <Icon name="check-circle" size={80} color={colors.success} />
      </View>
      <AppText variant="heading" align="center">Order Placed!</AppText>
      <AppText variant="body" color={colors.muted} align="center" style={styles.sub}>
        Thank you for shopping with Wabbus. You&apos;ll receive a confirmation email shortly.
      </AppText>
      <AppButton title="View Orders" variant="primary" fullWidth onPress={() => router.replace("/orders")} style={styles.btn} />
      <AppButton title="Continue Shopping" variant="outline" fullWidth onPress={() => router.replace("/")} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing[8] },
  check: { marginBottom: spacing[6] },
  sub: { marginTop: spacing[2], marginBottom: spacing[8], maxWidth: 280 },
  btn: { marginBottom: spacing[3] },
});
