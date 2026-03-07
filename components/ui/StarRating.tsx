import React from "react";
import { View, StyleSheet } from "react-native";
import AppText from "./AppText";
import Icon from "./Icon";
import { colors, spacing } from "@/lib/theme";

type Props = {
  rating: number;
  count?: number;
  sold?: number;
  size?: number;
};

export default function StarRating({ rating, count, sold, size = 12 }: Props) {
  const fullStars = Math.floor(rating);
  const hasHalf = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

  return (
    <View style={styles.row}>
      <View style={styles.stars}>
        {Array.from({ length: fullStars }, (_, i) => (
          <Icon key={`f${i}`} name="star" size={size} color={colors.brandOrange} />
        ))}
        {hasHalf && <Icon name="star-half" size={size} color={colors.brandOrange} />}
        {Array.from({ length: emptyStars }, (_, i) => (
          <Icon key={`e${i}`} name="star-border" size={size} color={colors.gray200} />
        ))}
      </View>
      {(count !== undefined || sold !== undefined) && (
        <AppText variant="small" style={styles.meta}>
          {count !== undefined && `(${count})`}
          {count !== undefined && sold !== undefined && " · "}
          {sold !== undefined && `${sold} sold`}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginTop: spacing[0.5] },
  stars: { flexDirection: "row", gap: 1 },
  meta: { marginLeft: spacing[1] },
});
