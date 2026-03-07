/**
 * Icon — unified icon wrapper using MaterialIcons from @expo/vector-icons.
 * Centralizes icon rendering so we can swap icon libraries later if needed.
 */
import React from "react";
import { MaterialIcons } from "@expo/vector-icons";
import { colors } from "@/lib/theme";

type Props = {
  name: string;
  size?: number;
  color?: string;
};

export default function Icon({ name, size = 24, color = colors.foreground }: Props) {
  return (
    <MaterialIcons
      name={name as keyof typeof MaterialIcons.glyphMap}
      size={size}
      color={color}
    />
  );
}
