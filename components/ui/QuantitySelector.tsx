import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Pressable, TextInput, StyleSheet, Modal, FlatList, Platform } from "react-native";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import KeyboardDoneBar, { KEYBOARD_DONE_ID } from "@/components/ui/KeyboardDoneBar";
import { colors, borderRadius, shadows, fontFamily, spacing } from "@/lib/theme";

const DROPDOWN_OPTIONS: (number | string)[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, "10+"];

interface QuantitySelectorProps {
  quantity: number;
  onChange: (qty: number) => void;
  max?: number;
  /** "stepper" = +/- buttons (cart), "dropdown" = chevron dropdown (PDP) */
  variant?: "stepper" | "dropdown";
}

export default function QuantitySelector({
  quantity,
  onChange,
  max = 99,
  variant = "stepper",
}: QuantitySelectorProps) {
  const [inputVal, setInputVal] = useState(String(quantity));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isTypingRef = useRef(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<TextInput>(null);
  // Tracks the last stepper +/- tap time. Used to suppress stale server
  // responses from overwriting the optimistic inputVal during rapid tapping.
  const lastStepperTapRef = useRef(0);
  const STEPPER_GUARD_MS = 800;

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (isTypingRef.current) return;
    // Don't let a stale server response overwrite the display value
    // while the user is actively tapping +/-.
    if (Date.now() - lastStepperTapRef.current < STEPPER_GUARD_MS) return;
    setInputVal(String(quantity));
  }, [quantity]);

  const handleInputChange = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, "");
    setInputVal(cleaned);
  }, []);

  const commitInput = useCallback(() => {
    isTypingRef.current = false;
    let num = parseInt(inputVal, 10);
    if (isNaN(num) || num < 1) num = 1;
    if (num > max) num = max;

    setInputVal(String(num));
    if (num !== quantity) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      onChange(num);
    }
  }, [inputVal, onChange, max, quantity]);

  const notifyChange = useCallback((newQty: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(newQty);
    }, 400);
  }, [onChange]);

  const handleDecrement = useCallback(() => {
    lastStepperTapRef.current = Date.now();
    setInputVal((prev) => {
      const current = parseInt(prev, 10);
      if (!isNaN(current) && current > 1) {
        const newQty = current - 1;
        notifyChange(newQty);
        return String(newQty);
      }
      return prev;
    });
  }, [notifyChange]);

  const handleIncrement = useCallback(() => {
    lastStepperTapRef.current = Date.now();
    setInputVal((prev) => {
      const current = parseInt(prev, 10);
      if (!isNaN(current) && current < max) {
        const newQty = current + 1;
        notifyChange(newQty);
        return String(newQty);
      }
      return prev;
    });
  }, [max, notifyChange]);

  const handleDropdownSelect = useCallback((option: number | string) => {
    if (option === "10+") {
      // Close dropdown, clear input, and focus for manual entry
      setDropdownOpen(false);
      setInputVal("");
      isTypingRef.current = true;
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    setInputVal(String(option));
    onChange(option as number);
    setDropdownOpen(false);
  }, [onChange]);

  const renderBtnStyle = ({ pressed }: { pressed: boolean }, disabled: boolean) => [
    styles.btn,
    pressed && !disabled && styles.btnPressed,
    disabled && styles.btnDisabled,
  ];

  if (variant === "dropdown") {
    return (
      <View style={styles.container}>
        <KeyboardDoneBar onDone={commitInput} />
        <View style={styles.dropdownRow}>
          <TextInput
            ref={inputRef}
            style={styles.dropdownInput}
            value={inputVal}
            onChangeText={handleInputChange}
            onBlur={commitInput}
            onSubmitEditing={commitInput}
            onFocus={() => { isTypingRef.current = true; }}
            keyboardType="number-pad"
            inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
            selectTextOnFocus
            maxLength={2}
          />
          <Pressable
            style={({ pressed }) => [
              styles.chevronBtn,
              pressed && styles.chevronBtnPressed,
            ]}
            onPress={() => setDropdownOpen(!dropdownOpen)}
          >
            <Icon
              name={dropdownOpen ? "keyboard-arrow-up" : "keyboard-arrow-down"}
              size={22}
              color={colors.white}
            />
          </Pressable>
        </View>

        <Modal
          visible={dropdownOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setDropdownOpen(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setDropdownOpen(false)}>
            <View style={styles.dropdownMenu}>
              <FlatList
                data={DROPDOWN_OPTIONS}
                keyExtractor={(item) => String(item)}
                scrollEnabled={false}
                renderItem={({ item: option }) => {
                  const isSelected = typeof option === "number" && String(option) === inputVal;
                  return (
                    <Pressable
                      onPress={() => handleDropdownSelect(option)}
                      style={({ pressed }) => [
                        styles.dropdownOption,
                        isSelected && styles.dropdownOptionSelected,
                        pressed && styles.dropdownOptionPressed,
                      ]}
                    >
                      <AppText
                        variant="body"
                        weight={isSelected ? "bold" : "normal"}
                        color={isSelected ? colors.brandBlue : colors.slate700}
                      >
                        {option}
                      </AppText>
                      {isSelected && (
                        <Icon name="check" size={18} color={colors.brandBlue} />
                      )}
                    </Pressable>
                  );
                }}
              />
            </View>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardDoneBar onDone={commitInput} />
      <View style={styles.selector}>
        <Pressable
          style={(state) => renderBtnStyle(state, quantity <= 1)}
          onPress={handleDecrement}
          disabled={quantity <= 1}
        >
          <Icon name="remove" size={20} color={quantity <= 1 ? colors.slate300 : colors.slate700} />
        </Pressable>

        <TextInput
          style={styles.selectorInput}
          value={inputVal}
          onChangeText={handleInputChange}
          onBlur={commitInput}
          onSubmitEditing={commitInput}
          onFocus={() => { isTypingRef.current = true; }}
          keyboardType="number-pad"
          inputAccessoryViewID={Platform.OS === "ios" ? KEYBOARD_DONE_ID : undefined}
          selectTextOnFocus
          maxLength={2}
        />

        <Pressable
          style={(state) => renderBtnStyle(state, quantity >= max)}
          onPress={handleIncrement}
          disabled={quantity >= max}
        >
          <Icon name="add" size={20} color={quantity >= max ? colors.slate300 : colors.slate700} />
        </Pressable>
      </View>
    </View>
  );
}

const SELECTOR_H = 44;

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
  },

  // ── Stepper variant ──
  selector: {
    flexDirection: "row",
    alignItems: "stretch",
    height: SELECTOR_H,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.white,
    overflow: "hidden",
    ...shadows.sm,
  },
  btn: {
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate50,
  },
  btnPressed: {
    backgroundColor: colors.slate100,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  selectorInput: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: fontFamily.semibold,
    color: colors.slate800,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.slate200,
    padding: 0,
  },

  // ── Dropdown variant ──
  dropdownRow: {
    flexDirection: "row",
    alignItems: "stretch",
    height: SELECTOR_H,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    ...shadows.sm,
  },
  dropdownInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: fontFamily.semibold,
    color: colors.slate800,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: colors.slate200,
    borderTopLeftRadius: borderRadius.xl,
    borderBottomLeftRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: 0,
  },
  chevronBtn: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandBlue,
    borderTopRightRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  chevronBtnPressed: {
    opacity: 0.85,
  },

  // ── Dropdown menu (modal) ──
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  dropdownMenu: {
    width: 200,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    ...shadows.lg,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
  dropdownOptionSelected: {
    backgroundColor: colors.brandBlueLight,
  },
  dropdownOptionPressed: {
    backgroundColor: colors.slate50,
  },
});
