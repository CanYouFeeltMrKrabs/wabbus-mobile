/**
 * ScreenContainer — wraps screen content with safe area insets and
 * optional scroll. Used by most screens for consistent padding and layout.
 */
import React from "react";
import { View, ScrollView, StyleSheet, type ViewStyle, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/lib/theme";

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ("top" | "bottom")[];
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  refreshing?: boolean;
  onRefresh?: () => void;
  bg?: string;
};

export default function ScreenContainer({
  children,
  scroll = true,
  padded = true,
  edges = ["top"],
  style,
  contentStyle,
  refreshing,
  onRefresh,
  bg = colors.background,
}: Props) {
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: bg,
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
    ...style,
  };

  const innerStyle: ViewStyle = {
    ...(padded && { paddingHorizontal: spacing[4] }),
    ...contentStyle,
  };

  if (!scroll) {
    return (
      <View style={containerStyle}>
        <View style={[styles.flex, innerStyle]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, innerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.brandBlue}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
