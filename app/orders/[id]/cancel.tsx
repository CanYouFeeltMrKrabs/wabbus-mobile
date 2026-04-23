import React, { useState } from "react";
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
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { pickItemTitle, pickItemImage, pickUnitPriceCents } from "@/lib/orderHelpers";
import { FALLBACK_IMAGE } from "@/lib/config";
import { invalidate, useOrderDetail } from "@/lib/queries";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import type { CancelReasonCode } from "@/lib/types";

export default function CancelOrderScreen() {
  return (
    <RequireAuth>
      <CancelContent />
    </RequireAuth>
  );
}

function CancelContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const REASONS: { code: CancelReasonCode; label: string }[] = [
    { code: "CHANGED_MIND", label: t("accountOrders.cancel.reasonChangedMind") },
    { code: "FOUND_CHEAPER", label: t("accountOrders.cancel.reasonFoundCheaper") },
    { code: "ORDERED_WRONG", label: t("accountOrders.cancel.reasonOrderedWrong") },
    { code: "NO_LONGER_NEEDED", label: t("accountOrders.cancel.reasonNoLongerNeeded") },
    { code: "OTHER", label: t("accountOrders.cancel.reasonOther") },
  ];

  // Sealed-layer migration (plan §3.2 — orders.detail caller). Hand-rolled
  // useQuery + envelope unwrap replaced with the canonical hook.
  const { data: order, isLoading: loading } = useOrderDetail(id);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<CancelReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const cancellableItems = (order?.items || []).filter(
    (item) => !["CANCELLED", "SHIPPED", "DELIVERED"].includes(item.status ?? ""),
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
    .filter((i) => selected.has(i.publicId ?? ""))
    .reduce((sum, i) => sum + pickUnitPriceCents(i) * (i.quantity ?? 0), 0);

  const handleSubmit = async () => {
    if (!reason || selected.size === 0) return;
    setSubmitting(true);
    try {
      const promises = cancellableItems
        .filter((i) => selected.has(i.publicId ?? ""))
        .map((item) =>
          customerFetch(`/orders/by-public-id/${id}/items/${item.publicId}/cancel`, {
            method: "POST",
            body: JSON.stringify({ reasonCode: reason, ...(note ? { note } : {}) }),
          }).catch(() => {}),
        );
      await Promise.all(promises);
      // Cancellation effect spans both this order's detail and the orders
      // list (status changes ripple through). invalidate.orders.all() covers
      // both via prefix match. Routed through the sealed namespace so no
      // caller can construct an orders queryKey by hand (plan §3.2 Step E).
      void invalidate.orders.all();
      setDone(true);
    } catch {
      Alert.alert(t("common.error"), t("accountOrders.cancel.errorSubmit"));
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
          {!order ? t("orders.notFound") : t("accountOrders.cancel.cannotCancel")}
        </AppText>
        <AppButton title={t("orders.goBack")} variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="check-circle" size={48} color={colors.success} />
        <AppText variant="heading" style={{ marginTop: spacing[4] }}>
          {t("accountOrders.cancel.successHeading")}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2], maxWidth: 280 }}>
          {t("accountOrders.cancel.successBody", { count: selected.size, amount: formatMoney(estimatedRefund) })}
        </AppText>
        <AppButton title={t("accountOrders.cancel.backToOrder")} variant="primary" onPress={() => router.back()} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("accountOrders.cancel.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="body" color={colors.muted} style={styles.desc}>
          {t("accountOrders.cancel.subtitle")}
        </AppText>

        {cancellableItems.length === 0 ? (
          <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[6] }}>
            {t("accountOrders.cancel.noEligible")}
          </AppText>
        ) : (
          <>
            {cancellableItems.map((item) => {
              const pid = item.publicId ?? "";
              const isSelected = selected.has(pid);
              return (
                <Pressable key={pid} onPress={() => toggleItem(pid)} style={[styles.itemCard, isSelected && styles.itemSelected]}>
                  <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <Icon name="check" size={14} color={colors.white} />}
                  </View>
                  <Image source={{ uri: pickItemImage(item) || FALLBACK_IMAGE }} style={styles.itemImg} resizeMode="cover" />
                  <View style={styles.itemInfo}>
                    <AppText variant="label" numberOfLines={2}>{pickItemTitle(item)}</AppText>
                    <AppText variant="caption">{t("orders.qtyLabel", { count: item.quantity ?? 0 })}</AppText>
                    <AppText variant="priceSmall">{formatMoney(pickUnitPriceCents(item) * (item.quantity ?? 0))}</AppText>
                  </View>
                </Pressable>
              );
            })}

            <AppText variant="subtitle" style={styles.sectionTitle}>
              {t("accountOrders.cancel.reasonHeading")}
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
                placeholder={t("accountOrders.cancel.notePlaceholder")}
                placeholderTextColor={colors.mutedLight}
                multiline
                maxLength={500}
              />
            )}

            {selected.size > 0 && (
              <View style={styles.summaryCard}>
                <AppText variant="label">{t("accountOrders.cancel.estimatedRefund")}</AppText>
                <AppText variant="price">{formatMoney(estimatedRefund)}</AppText>
              </View>
            )}

            <AppButton
              title={submitting ? t("accountOrders.cancel.cancelling") : t("accountOrders.cancel.cancelNItems", { count: selected.size })}
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
