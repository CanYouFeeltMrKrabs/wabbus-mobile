import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import Icon from "@/components/ui/Icon";
import AppText from "@/components/ui/AppText";
import { colors } from "@/lib/theme";

interface QuantitySelectorProps {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
}

export default function QuantitySelector({ quantity, onIncrease, onDecrease }: QuantitySelectorProps) {
  return (
    <View style={styles.qtyBox}>
      <Pressable style={styles.qtyBtn} onPress={onDecrease}>
        <Icon name="remove" size={20} color={colors.slate600} />
      </Pressable>
      <AppText style={styles.qtyValue}>{quantity}</AppText>
      <Pressable style={styles.qtyBtn} onPress={onIncrease}>
        <Icon name="add" size={20} color={colors.slate600} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  qtyBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 8,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  qtyBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  qtyValue: {
    width: 48,
    height: 40,
    lineHeight: 40,
    textAlign: "center",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.slate200,
    fontWeight: "600",
    fontSize: 16,
    backgroundColor: colors.white,
  },
});
