import React from "react";
import { View, StyleSheet } from "react-native";
import AppText from "./AppText";
import Icon from "./Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type BadgeType = "sale" | "new" | "bestseller" | "info";

type Props = {
  type: BadgeType;
  label: string;
  showIcon?: boolean;
};

const bgColors: Record<BadgeType, string> = {
  sale: colors.brandRed,
  new: colors.success,
  bestseller: colors.warning,
  info: colors.brandBlue,
};

export default function Badge({ type, label, showIcon }: Props) {
  return (
    <View style={[styles.badge, { backgroundColor: bgColors[type] }, shadows.sm]}>
      {showIcon && (
        <Icon name="star" size={9} color={colors.white} />
      )}
      <AppText variant="tiny" color={colors.white} weight="extrabold" style={styles.text}>
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
        let showIcon = false;

        const t = b.type.toUpperCase();
        if (t === "SALE" || t === "DISCOUNT") {
          type = "sale";
          label = b.value ? `${b.value}% OFF` : b.label;
        } else if (t === "NEW") {
          type = "new";
        } else if (t === "BESTSELLER") {
          type = "bestseller";
          showIcon = true;
        }
        return <Badge key={i} type={type} label={label} showIcon={showIcon} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: spacing[1.5],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
    alignSelf: "flex-start",
  },
  text: { fontSize: 9, letterSpacing: 0.5 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
});
