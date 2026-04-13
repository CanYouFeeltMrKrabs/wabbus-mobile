/**
 * AppText — global text wrapper. ALL text in the app goes through this.
 * Provides themed variants so we never hardcode font sizes or colors.
 * Uses Inter font family with weight-specific files.
 */
import React from "react";
import { Text, type TextProps, type TextStyle } from "react-native";
import { colors, fontSize, fontWeight, resolveFontFamily } from "@/lib/theme";

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

type VariantDef = {
  fontSize: number;
  color: string;
  weight: string;
  textDecorationLine?: TextStyle["textDecorationLine"];
};

const variantDefs: Record<TextVariant, VariantDef> = {
  body:        { fontSize: fontSize.base, color: colors.foreground, weight: fontWeight.normal },
  bodySmall:   { fontSize: fontSize.sm, color: colors.foreground, weight: fontWeight.normal },
  caption:     { fontSize: fontSize.xs, color: colors.muted, weight: fontWeight.normal },
  label:       { fontSize: fontSize.sm, color: colors.foreground, weight: fontWeight.medium },
  heading:     { fontSize: fontSize["2xl"], color: colors.foreground, weight: fontWeight.bold },
  title:       { fontSize: fontSize.lg, color: colors.foreground, weight: fontWeight.bold },
  subtitle:    { fontSize: fontSize.md, color: colors.foreground, weight: fontWeight.semibold },
  price:       { fontSize: fontSize.lg, color: colors.foreground, weight: fontWeight.black },
  priceSmall:  { fontSize: fontSize.base, color: colors.foreground, weight: fontWeight.bold },
  priceStrike: { fontSize: fontSize.xs, color: colors.mutedLight, weight: fontWeight.normal, textDecorationLine: "line-through" },
  small:       { fontSize: fontSize["2xs"], color: colors.muted, weight: fontWeight.normal },
  tiny:        { fontSize: fontSize["2xs"], color: colors.mutedLight, weight: fontWeight.normal },
  button:      { fontSize: fontSize.base, color: colors.white, weight: fontWeight.bold },
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
  const def = variantDefs[variant];
  const resolvedWeight = weightOverride ? fontWeight[weightOverride] : def.weight;

  const baseStyle: TextStyle = {
    fontSize: sizeOverride ? fontSize[sizeOverride] : def.fontSize,
    color: colorOverride ?? def.color,
    fontFamily: resolveFontFamily(resolvedWeight),
    ...(def.textDecorationLine && { textDecorationLine: def.textDecorationLine }),
    ...(align && { textAlign: align }),
  };

  return (
    <Text
      style={[baseStyle, style]}
      {...rest}
    />
  );
}
