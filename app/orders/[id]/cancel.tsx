import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { FALLBACK_IMAGE } from "@/lib/config";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import type { Order, OrderItem, CancelReasonCode } from "@/lib/types";

const REASONS: { code: CancelReasonCode; label: string }[] = [
  { code: "CHANGED_MIND", label: "Changed my mind" },
  { code: "FOUND_CHEAPER", label: "Found a better price" },
  { code: "ORDERED_WRONG", label: "Ordered by mistake" },
  { code: "NO_LONGER_NEEDED", label: "No longer needed" },
  { code: "OTHER", label: "Other" },
];

export default function CancelOrderScreen() {
  return (
    <RequireAuth>
      <CancelContent />
    </RequireAuth>
  );
}

function CancelContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!id) return;
    customerFetch<any>(`/orders/${id}`)
      .then((data) => setOrder(data.order ?? data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  const cancellableItems = (order?.items || []).filter(
    (item) => !["CANCELLED", "SHIPPED", "DELIVERED"].includes(item.status),
  );

  const toggleItem = (publicId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  };

  const estimatedRefund = cancellableItems
    .filter((i) => selected.has(i.publicId))
    .reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

  const handleSubmit = async () => {
    if (!reason || selected.size === 0) return;
    setSubmitting(true);
    try {
      const promises = cancellableItems
        .filter((i) => selected.has(i.publicId))
        .map((item) =>
          customerFetch(`/orders/${id}/items/${item.publicId}/cancel`, {
            method: "POST",
            body: JSON.stringify({ reasonCode: reason, ...(note ? { note } : {}) }),
          }).catch(() => {}),
        );
      await Promise.all(promises);
      setDone(true);
    } catch {
      Alert.alert("Error", "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (!order || order.status !== "PAID") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="cancel" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} align="center" style={{ marginTop: spacing[3] }}>
          {!order ? "Order not found" : "This order can no longer be cancelled."}
        </AppText>
        <AppButton title="Go Back" variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="check-circle" size={48} color={colors.success} />
        <AppText variant="heading" style={{ marginTop: spacing[4] }}>
          Cancellation Requested
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2], maxWidth: 280 }}>
          {selected.size} item{selected.size > 1 ? "s" : ""} cancelled. Estimated refund: {formatMoney(estimatedRefund)}
        </AppText>
        <AppButton title="Back to Order" variant="primary" onPress={() => router.back()} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Cancel Items</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="body" color={colors.muted} style={styles.desc}>
          Select the items you want to cancel.
        </AppText>

        {cancellableItems.length === 0 ? (
          <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[6] }}>
            No items are eligible for cancellation.
          </AppText>
        ) : (
          <>
            {cancellableItems.map((item) => {
              const isSelected = selected.has(item.publicId);
              return (
                <Pressable key={item.publicId} onPress={() => toggleItem(item.publicId)} style={[styles.itemCard, isSelected && styles.itemSelected]}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Icon name="check" size={14} color={colors.white} />}
                  </View>
                  <Image source={{ uri: item.image || FALLBACK_IMAGE }} style={styles.itemImg} resizeMode="cover" />
                  <View style={styles.itemInfo}>
                    <AppText variant="label" numberOfLines={2}>{item.title}</AppText>
                    <AppText variant="caption">Qty: {item.quantity}</AppText>
                    <AppText variant="priceSmall">{formatMoney(item.unitPriceCents * item.quantity)}</AppText>
                  </View>
                </Pressable>
              );
            })}

            <AppText variant="subtitle" style={styles.sectionTitle}>
              Reason for cancellation
            </AppText>
            {REASONS.map((r) => (
              <Pressable key={r.code} onPress={() => setReason(r.code)} style={[styles.reasonRow, reason === r.code && styles.reasonSelected]}>
                <View style={[styles.radio, reason === r.code && styles.radioChecked]} />
                <AppText variant="body">{r.label}</AppText>
              </Pressable>
            ))}

            {reason === "OTHER" && (
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Tell us more (optional)"
                placeholderTextColor={colors.mutedLight}
                multiline
                maxLength={500}
              />
            )}

            {selected.size > 0 && (
              <View style={styles.summaryCard}>
                <AppText variant="label">Estimated refund</AppText>
                <AppText variant="price">{formatMoney(estimatedRefund)}</AppText>
              </View>
            )}

            <AppButton
              title={submitting ? "Cancelling..." : `Cancel ${selected.size} Item${selected.size !== 1 ? "s" : ""}`}
              variant="danger"
              fullWidth
              size="lg"
              loading={submitting}
              disabled={selected.size === 0 || !reason}
              onPress={handleSubmit}
              style={{ marginTop: spacing[4] }}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing[6] },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  desc: { marginBottom: spacing[4] },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    marginBottom: spacing[2],
    gap: spacing[3],
    ...shadows.sm,
  },
  itemSelected: { borderWidth: 1.5, borderColor: colors.brandBlue },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.brandBlue, borderColor: colors.brandBlue },
  itemImg: { width: 56, height: 56, borderRadius: borderRadius.lg },
  itemInfo: { flex: 1, gap: spacing[0.5] },
  sectionTitle: { marginTop: spacing[6], marginBottom: spacing[3] },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[4],
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
  },
  reasonSelected: { borderWidth: 1.5, borderColor: colors.brandBlue },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.gray300,
  },
  radioChecked: { borderColor: colors.brandBlue, borderWidth: 6 },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.white,
    minHeight: 80,
    textAlignVertical: "top",
    marginTop: spacing[2],
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginTop: spacing[4],
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...shadows.sm,
  },
});
