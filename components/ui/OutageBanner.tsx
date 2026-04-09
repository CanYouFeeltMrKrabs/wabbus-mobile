import React from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";

export default function OutageBanner() {
  const { t } = useTranslation();
  return (
    <View style={st.banner}>
      <Icon name="warning-amber" size={20} color="#d97706" />
      <AppText variant="caption" color="#92400e" style={{ flex: 1 }}>
        {t("common.outageMessage")}
      </AppText>
    </View>
  );
}

const st = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: "#fef3c7",
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: "#fde68a",
    padding: spacing[3],
    marginBottom: spacing[3],
  },
});
