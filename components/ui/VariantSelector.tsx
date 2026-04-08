import React, { useMemo, useCallback } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import AppText from "./AppText";
import { colors, spacing, borderRadius } from "@/lib/theme";

export type VariantOptionValueData = {
  optionValue: {
    id: number;
    label: string;
    option: { id: number; name: string; sortOrder: number };
  };
};

export type VariantData = {
  publicId: string;
  title?: string | null;
  price: number;
  compareAtPrice: number | null;
  inventory?: { quantity: number; reserved: number } | null;
  optionValues?: VariantOptionValueData[];
  shippingPriceCents?: number | null;
};

type OptionGroupData = {
  groups: { label: string; values: string[] }[];
  parsed: { variant: VariantData; parts: string[] }[];
};

function buildFromStructuredData(variants: VariantData[]): OptionGroupData | null {
  const first = variants.find((v) => v.optionValues && v.optionValues.length > 0);
  if (!first?.optionValues?.length) return null;

  const sortedOptions = [...first.optionValues].sort(
    (a, b) => a.optionValue.option.sortOrder - b.optionValue.option.sortOrder,
  );

  const groupMap = new Map<number, { label: string; sortOrder: number; values: Map<string, true> }>();
  for (const ov of sortedOptions) {
    const opt = ov.optionValue.option;
    if (!groupMap.has(opt.id)) {
      groupMap.set(opt.id, { label: opt.name, sortOrder: opt.sortOrder, values: new Map() });
    }
  }

  for (const variant of variants) {
    if (!variant.optionValues) continue;
    for (const ov of variant.optionValues) {
      const group = groupMap.get(ov.optionValue.option.id);
      if (group) group.values.set(ov.optionValue.label, true);
    }
  }

  const orderedGroups = [...groupMap.entries()].sort(([, a], [, b]) => a.sortOrder - b.sortOrder);
  const groups = orderedGroups.map(([, g]) => ({
    label: g.label,
    values: [...g.values.keys()],
  }));
  const optionIds = orderedGroups.map(([id]) => id);

  const parsed = variants
    .filter((v) => v.optionValues && v.optionValues.length > 0)
    .map((v) => {
      const ovMap = new Map<number, string>();
      for (const ov of v.optionValues!) {
        ovMap.set(ov.optionValue.option.id, ov.optionValue.label);
      }
      return { variant: v, parts: optionIds.map((id) => ovMap.get(id) ?? "") };
    });

  return { groups, parsed };
}

function parseOptionGroups(variants: VariantData[]): OptionGroupData | null {
  const parsed = variants
    .filter((v) => v.title && v.title !== "Default")
    .map((v) => ({
      variant: v,
      parts: (v.title ?? "").split(" / ").map((s) => s.trim()),
    }));

  if (parsed.length === 0) return null;
  const partCount = parsed[0].parts.length;
  if (!parsed.every((p) => p.parts.length === partCount)) return null;

  const groupLabels: string[] = [];
  for (let i = 0; i < partCount; i++) {
    const values = [...new Set(parsed.map((p) => p.parts[i]))];
    const looksLikeColor = values.some((v) =>
      /silver|black|white|red|blue|green|gold|rose|copper|gray|grey|navy|pink|brown|purple|beige|charcoal|teal|ivory|bronze|chrome|nickel|brass|platinum/i.test(v),
    );
    const looksLikeSize = values.some((v) =>
      /\b(xs|s|m|l|xl|xxl|small|medium|large|standard|deluxe|mini|compact|king|queen|twin|full|\d+-piece|\d+pc|\d+"|\d+oz|\d+ml)\b/i.test(v),
    );
    if (looksLikeColor) groupLabels.push("Color");
    else if (looksLikeSize) groupLabels.push("Size");
    else groupLabels.push(partCount === 1 ? "Option" : `Option ${i + 1}`);
  }

  const groups = Array.from({ length: partCount }, (_, i) => ({
    label: groupLabels[i],
    values: [...new Set(parsed.map((p) => p.parts[i]))],
  }));

  return { groups, parsed };
}

type Props = {
  variants: VariantData[];
  selectedVariantId: string;
  onSelectVariant: (publicId: string) => void;
};

export default function VariantSelector({ variants, selectedVariantId, onSelectVariant }: Props) {
  const optionData = useMemo(
    () => buildFromStructuredData(variants) ?? parseOptionGroups(variants),
    [variants],
  );

  const currentParts = useMemo(() => {
    if (!optionData) return [];
    const match = optionData.parsed.find((p) => p.variant.publicId === selectedVariantId);
    return match?.parts ?? optionData.parsed[0]?.parts ?? [];
  }, [optionData, selectedVariantId]);

  const handleSelect = useCallback(
    (groupIdx: number, value: string) => {
      if (!optionData) return;
      const newParts = [...currentParts];
      newParts[groupIdx] = value;
      const match = optionData.parsed.find((p) =>
        p.parts.every((part, i) => part === newParts[i]),
      );
      if (match) onSelectVariant(match.variant.publicId);
    },
    [optionData, currentParts, onSelectVariant],
  );

  if (!optionData || variants.length <= 1) return null;

  return (
    <View style={styles.container}>
      {optionData.groups.map((group, gIdx) => (
        <View key={group.label} style={styles.group}>
          <View style={styles.labelRow}>
            <AppText style={styles.groupLabel}>{group.label}: </AppText>
            <AppText style={styles.groupValue}>{currentParts[gIdx]}</AppText>
          </View>
          <View style={styles.pillRow}>
            {group.values.map((value) => {
              const isSelected = currentParts[gIdx] === value;
              const wouldBeParts = [...currentParts];
              wouldBeParts[gIdx] = value;
              const matchingVariant = optionData.parsed.find((p) =>
                p.parts.every((part, i) => part === wouldBeParts[i]),
              );
              const available = matchingVariant
                ? (matchingVariant.variant.inventory?.quantity ?? 0) -
                    (matchingVariant.variant.inventory?.reserved ?? 0) >
                  0
                : true;

              return (
                <Pressable
                  key={value}
                  onPress={() => available && handleSelect(gIdx, value)}
                  disabled={!available}
                  style={[
                    styles.pill,
                    isSelected && styles.pillSelected,
                    !available && styles.pillDisabled,
                  ]}
                >
                  <AppText
                    style={[
                      styles.pillText,
                      isSelected && styles.pillTextSelected,
                      !available && styles.pillTextDisabled,
                    ]}
                  >
                    {value}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing[3], marginTop: spacing[4] },
  group: { gap: spacing[1.5] },
  labelRow: { flexDirection: "row", alignItems: "center" },
  groupLabel: { fontSize: 14, fontWeight: "600", color: colors.slate700 },
  groupValue: { fontSize: 14, fontWeight: "400", color: colors.slate900 },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  pill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.slate200,
    backgroundColor: colors.white,
  },
  pillSelected: {
    borderColor: colors.brandBlue,
    backgroundColor: colors.brandBlueLight,
  },
  pillDisabled: {
    borderColor: colors.slate100,
    backgroundColor: colors.slate50,
  },
  pillText: { fontSize: 14, fontWeight: "500", color: colors.slate700 },
  pillTextSelected: { color: colors.brandBlue, fontWeight: "600" },
  pillTextDisabled: { color: colors.slate300, textDecorationLine: "line-through" },
});
