import React, { useState, useCallback, useEffect } from "react";
import { View, Pressable, TextInput, StyleSheet } from "react-native";
import Icon from "@/components/ui/Icon";
import AppText from "@/components/ui/AppText";
import { colors, spacing, borderRadius, shadows, fontFamily } from "@/lib/theme";

const QUICK_OPTIONS = [1, 2, 3, 4, 5];

interface QuantitySelectorProps {
  quantity: number;
  onChange: (qty: number) => void;
  max?: number;
}

export default function QuantitySelector({ quantity, onChange, max = 99 }: QuantitySelectorProps) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState(String(quantity));

  // Only sync external quantity changes when we are NOT open (meaning we aren't actively typing)
  useEffect(() => {
    if (!open) {
      setInputVal(String(quantity));
    }
  }, [quantity, open]);

  const handleInputChange = useCallback((text: string) => {
    // Just maintain local string state during typing so the cursor doesn't jump
    const cleaned = text.replace(/\D/g, "");
    setInputVal(cleaned);
  }, []);

  const commitInput = useCallback(() => {
    let num = parseInt(inputVal, 10);
    if (isNaN(num) || num < 1) num = 1;
    if (num > max) num = max;
    
    setInputVal(String(num));
    onChange(num);
  }, [inputVal, onChange, max]);

  const handleSelect = useCallback((num: number) => {
    setInputVal(String(num));
    onChange(num);
    setOpen(false);
  }, [onChange]);

  return (
    <View style={styles.container}>
      {/* Selector row */}
      <View style={styles.selector}>
        <TextInput
          style={styles.selectorInput}
          value={inputVal}
          onChangeText={handleInputChange}
          onBlur={commitInput}
          onSubmitEditing={commitInput}
          onFocus={() => setOpen(false)}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          maxLength={2}
        />
        <Pressable style={styles.chevronBox} onPress={() => setOpen((v) => !v)}>
          <Icon name={open ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={22} color={colors.white} />
        </Pressable>
      </View>

      {/* Inline dropdown */}
      {open && (
        <View style={styles.dropdown}>
          {QUICK_OPTIONS.filter((n) => n <= max).map((num) => (
            <Pressable
              key={num}
              style={[styles.dropdownItem, num === quantity && styles.dropdownItemActive]}
              onPress={() => handleSelect(num)}
            >
              <AppText
                style={[
                  styles.dropdownItemText,
                  num === quantity && styles.dropdownItemTextActive,
                ]}
              >
                {num}
              </AppText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const SELECTOR_H = 44;

const styles = StyleSheet.create({
  container: {
    zIndex: 10,
  },
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
  selectorInput: {
    flex: 1,
    paddingHorizontal: spacing[4],
    fontSize: 15,
    fontWeight: "600",
    fontFamily: fontFamily.semibold,
    color: colors.slate700,
  },
  chevronBox: {
    backgroundColor: colors.brandBlueDark,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdown: {
    marginTop: spacing[1],
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.slate200,
    overflow: "hidden",
    ...shadows.lg,
  },
  dropdownItem: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
  },
  dropdownItemActive: {
    backgroundColor: colors.brandBlueLight,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.slate700,
  },
  dropdownItemTextActive: {
    color: colors.brandBlue,
    fontWeight: "700",
  },
});
