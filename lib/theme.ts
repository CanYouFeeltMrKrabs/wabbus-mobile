/**
 * Wabbus Design System — single source of truth for all visual tokens.
 * Every color, spacing value, font size, and shadow used in the app
 * MUST come from here. No magic numbers in component files.
 */

export const colors = {
  // Brand
  brandBlue: "#2d4ecf",
  brandBlueDark: "#0c4eb0",
  brandBlueHover: "#2341b0",
  brandBlueLight: "#eff6ff",
  brandBlueBorder: "#dbeafe",

  brandOrange: "#ff6b00",
  brandOrangeHover: "#e55f00",

  brandYellow: "#ffd43b",
  brandRed: "#e53e3e",
  starGold: "#f5a623",

  // Surfaces
  background: "#f9fafb",
  foreground: "#1a1a2e",
  card: "#ffffff",
  border: "#e5e7eb",
  borderLight: "#f3f4f6",

  // Neutrals
  muted: "#6b7280",
  mutedLight: "#9ca3af",

  // Semantic
  success: "#10b981",
  successLight: "#d1fae5",
  warning: "#f59e0b",
  warningLight: "#fef3c7",
  error: "#ef4444",
  errorDark: "#dc2626",
  errorLight: "#fee2e2",

  // Hero slide palette
  heroBlue: "#2563eb",
  heroPurple: "#7c3aed",
  heroPurpleDecor: "rgba(139,92,246,0.5)",
  heroBlueDecor: "rgba(59,130,246,0.5)",
  heroYellow: "#eab308",
  heroYellowDecor: "rgba(250,204,21,0.6)",
  heroPink: "#ec4899",
  heroSlate: "#1e293b",

  // Primitives
  white: "#ffffff",
  black: "#000000",
  transparent: "transparent",

  // Overlays
  overlayWhite90: "rgba(255,255,255,0.9)",
  overlayWhite40: "rgba(255,255,255,0.4)",
  overlayWhite20: "rgba(255,255,255,0.2)",
  overlayWhite12: "rgba(255,255,255,0.12)",
  overlayBlack20: "rgba(0,0,0,0.2)",

  // Slate scale
  slate50: "#f8fafc",
  slate100: "#f1f5f9",
  slate200: "#e2e8f0",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
  slate500: "#64748b",
  slate600: "#475569",
  slate700: "#334155",
  slate800: "#1e293b",
  slate900: "#0f172a",

  // Gray scale
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray600: "#4b5563",
  gray700: "#374151",
  gray800: "#1f2937",
  gray900: "#111827",
} as const;

export const spacing = {
  0: 0,
  px: 1,
  0.5: 2,
  1: 4,
  1.5: 6,
  2: 8,
  2.5: 10,
  3: 12,
  3.5: 14,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  9: 36,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
  20: 80,
  24: 96,
} as const;

export const fontSize = {
  "2xs": 9,
  xs: 10,
  sm: 12,
  base: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
} as const;

export const fontWeight = {
  normal: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
  extrabold: "800" as const,
  black: "900" as const,
};

export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  full: 9999,
} as const;

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
} as const;

export const hitSlop = { top: 8, right: 8, bottom: 8, left: 8 };
