import React from "react";
import {
  InputAccessoryView,
  View,
  Pressable,
  Keyboard,
  StyleSheet,
  Platform,
} from "react-native";
import AppText from "@/components/ui/AppText";
import { colors, spacing } from "@/lib/theme";

export const KEYBOARD_DONE_ID = "keyboard-done-bar";

/**
 * iOS-only keyboard accessory toolbar with a "Done" button.
 *
 * Usage:
 *   1. Render <KeyboardDoneBar /> once in the screen (anywhere in the tree).
 *   2. On every numeric TextInput, set:
 *        inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
 *
 * Renders nothing on Android (InputAccessoryView is iOS-only).
 */
export default function KeyboardDoneBar({ onDone }: { onDone?: () => void }) {
  if (Platform.OS !== "ios") return null;

  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_ID}>
      <View style={styles.bar}>
        <View style={styles.spacer} />
        <Pressable
          onPress={() => {
            onDone?.();
            Keyboard.dismiss();
          }}
          hitSlop={8}
          style={styles.doneBtn}
        >
          <AppText variant="body" weight="semibold" color={colors.brandBlue}>
            Done
          </AppText>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    height: 44,
    paddingHorizontal: spacing[4],
    backgroundColor: colors.slate100,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.slate300,
  },
  spacer: { flex: 1 },
  doneBtn: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
  },
});
