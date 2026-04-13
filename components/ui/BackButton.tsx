import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { useRouter, useNavigation } from "expo-router";
import Icon from "./Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type Props = {
  onPress?: () => void;
  /** Override icon — defaults to "arrow-back" */
  icon?: string;
  /** Override icon color */
  color?: string;
  style?: any;
};

export default function BackButton({ onPress, icon = "arrow-back", color, style }: Props) {
  const router = useRouter();
  const navigation = useNavigation();

  const handleBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <Pressable
      onPress={onPress ?? handleBack}
      hitSlop={12}
      style={[styles.btn, style]}
    >
      <Icon name={icon} size={24} color={color ?? colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlayWhite90,
    borderRadius: borderRadius.full,
    ...shadows.md,
  },
});
