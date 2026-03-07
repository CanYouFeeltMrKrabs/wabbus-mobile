import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { colors, spacing } from "@/lib/theme";

export default function CheckoutScreen() {
  return <RequireAuth><CheckoutContent /></RequireAuth>;
}

function CheckoutContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Icon name="close" size={24} color={colors.foreground} />
        </Pressable>
        <AppText variant="title">Checkout</AppText>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <Icon name="construction" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={styles.placeholder}>
          Checkout will be implemented with Stripe integration.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing[8] },
  placeholder: { textAlign: "center", marginTop: spacing[3] },
});
