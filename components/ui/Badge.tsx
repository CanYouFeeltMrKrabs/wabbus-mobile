import React from "react";
import { View, StyleSheet } from "react-native";
import AppText from "./AppText";
import { colors, spacing, borderRadius } from "@/lib/theme";

type BadgeType = "discount" | "new" | "bestseller" | "info";

type Props = {
  type: BadgeType;
  label: string;
};

const bgColors: Record<BadgeType, string> = {
  discount: colors.error,
  new: colors.success,
  bestseller: colors.brandOrange,
  info: colors.brandBlue,
};

export default function Badge({ type, label }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColors[type] }]}>
      <AppText variant="tiny" color={colors.white} weight="bold" style={styles.text}>
        {label.toUpperCase()}
      </AppText>
    </View>
  );
}

export function BadgeRow({ badges }: { badges?: Array<{ type: string; label: string; value?: number }> }) {
  if (!badges?.length) return null;

  return (
    <View style={styles.row}>
      {badges.map((b, i) => {
        let type: BadgeType = "info";
        let label = b.label;
        if (b.type === "discount" || b.type === "DISCOUNT") {
          type = "discount";
          label = b.value ? `${b.value}% OFF` : b.label;
        } else if (b.type === "new" || b.type === "NEW") {
          type = "new";
        } else if (b.type === "bestseller" || b.type === "BESTSELLER") {
          type = "bestseller";
        }
        return <Badge key={i} type={type} label={label} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing[1.5],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
  text: { fontSize: 9, letterSpacing: 0.5 },
  row: { flexDirection: "column", gap: spacing[1] },
});
