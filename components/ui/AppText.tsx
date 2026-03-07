/**
 * AppText — global text wrapper. ALL text in the app goes through this.
 * Provides themed variants so we never hardcode font sizes or colors.
 */
import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { colors, fontSize, fontWeight } from "@/lib/theme";

export type TextVariant =
  | "body"
  | "bodySmall"
  | "caption"
  | "label"
  | "heading"
  | "title"
  | "subtitle"
  | "price"
  | "priceSmall"
  | "priceStrike"
  | "small"
  | "tiny"
  | "button";

type Props = TextProps & {
  variant?: TextVariant;
  color?: string;
  weight?: keyof typeof fontWeight;
  size?: keyof typeof fontSize;
  align?: TextStyle["textAlign"];
};

const variants: Record<TextVariant, TextStyle> = {
  body:        { fontSize: fontSize.base, color: colors.foreground, fontWeight: fontWeight.normal },
  bodySmall:   { fontSize: fontSize.sm, color: colors.foreground, fontWeight: fontWeight.normal },
  caption:     { fontSize: fontSize.xs, color: colors.muted, fontWeight: fontWeight.normal },
  label:       { fontSize: fontSize.sm, color: colors.foreground, fontWeight: fontWeight.medium },
  heading:     { fontSize: fontSize["2xl"], color: colors.foreground, fontWeight: fontWeight.bold },
  title:       { fontSize: fontSize.lg, color: colors.foreground, fontWeight: fontWeight.bold },
  subtitle:    { fontSize: fontSize.md, color: colors.foreground, fontWeight: fontWeight.semibold },
  price:       { fontSize: fontSize.lg, color: colors.brandOrange, fontWeight: fontWeight.black },
  priceSmall:  { fontSize: fontSize.base, color: colors.brandOrange, fontWeight: fontWeight.bold },
  priceStrike: { fontSize: fontSize.xs, color: colors.mutedLight, fontWeight: fontWeight.normal, textDecorationLine: "line-through" },
  small:       { fontSize: fontSize["2xs"], color: colors.muted, fontWeight: fontWeight.normal },
  tiny:        { fontSize: 8, color: colors.mutedLight, fontWeight: fontWeight.normal },
  button:      { fontSize: fontSize.base, color: colors.white, fontWeight: fontWeight.bold },
};

export default function AppText({
  variant = "body",
  color: colorOverride,
  weight: weightOverride,
  size: sizeOverride,
  align,
  style,
  ...rest
}: Props) {
  const base = variants[variant];
  return (
    <Text
      style={[
        base,
        colorOverride !== undefined && { color: colorOverride },
        weightOverride !== undefined && { fontWeight: fontWeight[weightOverride] },
        sizeOverride !== undefined && { fontSize: fontSize[sizeOverride] },
        align !== undefined && { textAlign: align },
        style,
      ]}
      {...rest}
    />
  );
}
