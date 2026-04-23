import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Pressable, TextInput, StyleSheet } from "react-native";
import Icon from "@/components/ui/Icon";
import { colors, borderRadius, shadows, fontFamily } from "@/lib/theme";

interface QuantitySelectorProps {
  quantity: number;
  onChange: (qty: number) => void;
  max?: number;
}

export default function QuantitySelector({ quantity, onChange, max = 99 }: QuantitySelectorProps) {
  const [inputVal, setInputVal] = useState(String(quantity));
  const isTypingRef = useRef(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Only sync external quantity changes when we are NOT actively typing
  useEffect(() => {
    if (!isTypingRef.current) {
      setInputVal(String(quantity));
    }
  }, [quantity]);

  const handleInputChange = useCallback((text: string) => {
    // Just maintain local string state during typing so the cursor doesn't jump
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

  const renderBtnStyle = ({ pressed }: { pressed: boolean }, disabled: boolean) => [
    styles.btn,
    pressed && !disabled && styles.btnPressed,
    disabled && styles.btnDisabled,
  ];

  return (
    <View style={styles.container}>
      <View style={styles.selector}>
        <Pressable 
          style={(state) => renderBtnStyle(state, quantity <= 1)}
          onPress={handleDecrement}
          disabled={quantity <= 1}
        >
          <Icon name="remove" size={20} color={quantity <= 1 ? colors.slate300 : colors.brandBlue} />
        </Pressable>
        
        <TextInput
          style={styles.selectorInput}
          value={inputVal}
          onChangeText={handleInputChange}
          onBlur={commitInput}
          onSubmitEditing={commitInput}
          onFocus={() => { isTypingRef.current = true; }}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          maxLength={2}
        />
        
        <Pressable 
          style={(state) => renderBtnStyle(state, quantity >= max)}
          onPress={handleIncrement}
          disabled={quantity >= max}
        >
          <Icon name="add" size={20} color={quantity >= max ? colors.slate300 : colors.brandBlue} />
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
});
