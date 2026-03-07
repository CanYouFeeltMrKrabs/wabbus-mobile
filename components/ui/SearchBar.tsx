import React from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import Icon from "./Icon";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";

type Props = {
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: () => void;
  onPress?: () => void;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
};

export default function SearchBar({
  value,
  onChangeText,
  onSubmit,
  onPress,
  placeholder = "Search products...",
  editable = true,
  autoFocus = false,
}: Props) {
  const Wrapper = onPress && !editable ? Pressable : View;

  return (
    <Wrapper onPress={onPress} style={styles.container}>
      <Icon name="search" size={20} color={colors.mutedLight} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        editable={editable}
        autoFocus={autoFocus}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {value ? (
        <Pressable onPress={() => onChangeText?.("")} hitSlop={8}>
          <Icon name="close" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
    padding: 0,
  },
});
