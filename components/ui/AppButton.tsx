/**
 * AppButton — themed button with primary/secondary/accent/outline variants.
 * All tappable actions should use this instead of raw Pressable/TouchableOpacity.
 */
import React from "react";
import {
  Pressable,
  ActivityIndicator,
  StyleSheet,
  type ViewStyle,
  type PressableProps,
} from "react-native";
import AppText from "./AppText";
import Icon from "./Icon";
import { colors, spacing, borderRadius, fontWeight, fontSize } from "@/lib/theme";

type Variant = "primary" | "secondary" | "accent" | "outline" | "ghost" | "danger";

type Props = PressableProps & {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: string;
  iconRight?: string;
  fullWidth?: boolean;
  size?: "sm" | "md" | "lg";
};

const variantBg: Record<Variant, { bg: string; bgPressed: string; text: string; border?: string }> = {
  primary:   { bg: colors.brandBlue, bgPressed: colors.brandBlueDark, text: colors.white },
  secondary: { bg: colors.gray100, bgPressed: colors.gray200, text: colors.foreground },
  accent:    { bg: colors.brandOrange, bgPressed: colors.brandOrangeHover, text: colors.white },
  outline:   { bg: colors.transparent, bgPressed: colors.gray50, text: colors.brandBlue, border: colors.brandBlue },
  ghost:     { bg: colors.transparent, bgPressed: colors.gray100, text: colors.foreground },
  danger:    { bg: colors.error, bgPressed: "#dc2626", text: colors.white },
};

const sizes = {
  sm: { paddingVertical: spacing[1.5], paddingHorizontal: spacing[3], fontSize: fontSize.sm },
  md: { paddingVertical: spacing[2.5], paddingHorizontal: spacing[4], fontSize: fontSize.base },
  lg: { paddingVertical: spacing[3.5], paddingHorizontal: spacing[6], fontSize: fontSize.md },
};

export default function AppButton({
  title,
  variant = "primary",
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  size = "md",
  disabled,
  style,
  ...rest
}: Props) {
  const v = variantBg[variant];
  const s = sizes[size];

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? v.bgPressed : v.bg,
          paddingVertical: s.paddingVertical,
          paddingHorizontal: s.paddingHorizontal,
          borderColor: v.border || colors.transparent,
          borderWidth: v.border ? 1.5 : 0,
          opacity: disabled ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
        style as ViewStyle,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={v.text} />
      ) : (
        <>
          {icon && <Icon name={icon} size={s.fontSize + 2} color={v.text} />}
          <AppText
            variant="button"
            color={v.text}
            style={{ fontSize: s.fontSize, fontWeight: fontWeight.bold }}
          >
            {title}
          </AppText>
          {iconRight && <Icon name={iconRight} size={s.fontSize + 2} color={v.text} />}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    borderRadius: borderRadius.lg,
  },
  fullWidth: {
    width: "100%",
  },
});
