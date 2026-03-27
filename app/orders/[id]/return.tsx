import React, { useEffect, useMemo, useState } from "react";
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
import { FALLBACK_IMAGE } from "@/lib/config";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import type { Order, ReturnReasonCode, ReturnResolution } from "@/lib/types";

type ReturnOrderItem = {
  publicId: string;
  title: string;
  image: string | null;
  quantity: number;
  unitPriceCents: number;
  status: string;
  quantityReturned?: number;
};

type ExistingReturn = {
  status: string;
  items?: Array<{
    orderItemPublicId?: string;
    quantityToReturn?: number;
    orderItem?: { publicId?: string };
  }>;
};

const REASONS: { code: ReturnReasonCode; label: string }[] = [
  { code: "DAMAGED", label: "Item arrived damaged" },
  { code: "DEFECTIVE", label: "Item is defective" },
  { code: "WRONG_ITEM", label: "Received wrong item" },
  { code: "NOT_AS_DESCRIBED", label: "Not as described" },
  { code: "DOESNT_FIT", label: "Doesn't fit" },
  { code: "CHANGED_MIND", label: "Changed my mind" },
  { code: "OTHER", label: "Other" },
];

const ALL_RESOLUTIONS: { code: ReturnResolution; label: string }[] = [
  { code: "REFUND", label: "Refund to original payment" },
  { code: "STORE_CREDIT", label: "Store credit" },
  { code: "REPLACEMENT", label: "Replacement" },
];

export default function ReturnScreen() {
  return (
    <RequireAuth>
      <ReturnContent />
    </RequireAuth>
  );
}

function ReturnContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [reason, setReason] = useState<ReturnReasonCode | null>(null);
  const [resolution, setResolution] = useState<ReturnResolution>("REFUND");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [pendingReturnItems, setPendingReturnItems] = useState<Map<string, number>>(new Map());
  const [replacementBlocked, setReplacementBlocked] = useState(false);
  const [replacementBlockReason, setReplacementBlockReason] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      customerFetch<any>(`/orders/${id}`),
      customerFetch<any>("/returns").catch(() => null),
    ])
      .then(([orderData, returnsData]) => {
        setOrder(orderData.order ?? orderData);

        const returnsList: ExistingReturn[] =
          Array.isArray(returnsData?.data) ? returnsData.data :
          Array.isArray(returnsData) ? returnsData : [];

        const pending = new Map<string, number>();
        for (const ret of returnsList) {
          if (["CLOSED", "CLOSED_EXPIRED", "REFUNDED", "CREDITED"].includes(ret.status)) continue;
          for (const item of ret.items ?? []) {
            const itemId = item.orderItemPublicId ?? item.orderItem?.publicId;
            const qty = item.quantityToReturn ?? 0;
            if (itemId) pending.set(itemId, (pending.get(itemId) ?? 0) + qty);
          }
        }
        setPendingReturnItems(pending);
      })
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [id]);

  const firstSelectedId = useMemo(() => [...selected.keys()][0] ?? null, [selected]);

  useEffect(() => {
    if (!firstSelectedId) {
      setReplacementBlocked(false);
      setReplacementBlockReason(null);
      return;
    }
    customerFetch<{ blocked?: boolean; code?: string }>(
      `/returns/replacement-check/${firstSelectedId}`,
    )
      .then((data) => {
        setReplacementBlocked(!!data.blocked);
        setReplacementBlockReason(data.code ?? null);
      })
      .catch(() => {
        setReplacementBlocked(false);
        setReplacementBlockReason(null);
      });
  }, [firstSelectedId]);

  const availableResolutions = useMemo(() => {
    if (replacementBlocked) return ALL_RESOLUTIONS.filter((r) => r.code !== "REPLACEMENT");
    return ALL_RESOLUTIONS;
  }, [replacementBlocked]);

  useEffect(() => {
    if (replacementBlocked && resolution === "REPLACEMENT") setResolution("REFUND");
  }, [replacementBlocked, resolution]);

  const returnableItems = ((order?.items || []) as ReturnOrderItem[]).filter(
    (item) => !["CANCELLED", "REFUNDED"].includes(item.status),
  );

  const getAvailable = (item: ReturnOrderItem) => {
    const pending = pendingReturnItems.get(item.publicId) ?? 0;
    const returned = item.quantityReturned ?? 0;
    return Math.max(0, item.quantity - returned - pending);
  };

  const toggleItem = (publicId: string, available: number) => {
    if (available <= 0) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.set(publicId, Math.min(1, available));
      return next;
    });
  };

  const setItemQty = (publicId: string, qty: number) => {
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(publicId, qty);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!reason || selected.size === 0) return;

    setSubmitting(true);
    try {
      const items = returnableItems
        .filter((i) => selected.has(i.publicId))
        .map((i) => ({
          orderItemPublicId: i.publicId,
          quantityToReturn: selected.get(i.publicId) ?? i.quantity,
        }));

      await customerFetch("/returns", {
        method: "POST",
        body: JSON.stringify({
          items,
          reasonCode: reason,
          reasonNote: note || undefined,
          requestedResolution: resolution,
        }),
      });

      setDone(true);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Unable to submit return request.");
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

  if (!order || order.status !== "DELIVERED") {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="package-variant" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} align="center" style={{ marginTop: spacing[3] }}>
          {!order ? "Order not found" : "Returns are only available for delivered orders."}
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
          Return Requested
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2], maxWidth: 280 }}>
          Your return request has been submitted. We'll review it and get back to you.
        </AppText>
        <AppButton title="Back to Order" variant="primary" onPress={() => router.back()} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Return Items</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="body" color={colors.muted} style={styles.desc}>
          Select items to return and choose a reason.
        </AppText>

        {returnableItems.map((item) => {
          const available = getAvailable(item);
          const isDisabled = available <= 0;
          const isSelected = selected.has(item.publicId);
          const selectedQty = selected.get(item.publicId) ?? 1;
          return (
            <View key={item.publicId}>
              <Pressable
                onPress={() => toggleItem(item.publicId, available)}
                disabled={isDisabled}
                style={[styles.itemCard, isSelected && styles.itemSelected, isDisabled && { opacity: 0.5 }]}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Icon name="check" size={14} color={colors.white} />}
                </View>
                <Image source={{ uri: item.image || FALLBACK_IMAGE }} style={styles.itemImg} resizeMode="cover" />
                <View style={styles.itemInfo}>
                  <AppText variant="label" numberOfLines={2}>{item.title}</AppText>
                  {isDisabled ? (
                    <AppText variant="caption" color={colors.warning}>
                      {(pendingReturnItems.get(item.publicId) ?? 0) > 0 ? "Return pending" : "Fully returned"}
                    </AppText>
                  ) : available < item.quantity ? (
                    <AppText variant="caption" color={colors.muted}>{available} of {item.quantity} available</AppText>
                  ) : (
                    <AppText variant="caption">Qty: {item.quantity}</AppText>
                  )}
                </View>
              </Pressable>
              {isSelected && available > 1 && (
                <View style={styles.qtyStepper}>
                  <AppText variant="caption" weight="bold" color={colors.muted}>Quantity</AppText>
                  <View style={styles.qtyControls}>
                    <Pressable
                      onPress={() => setItemQty(item.publicId, Math.max(1, selectedQty - 1))}
                      style={styles.qtyBtn}
                    >
                      <Icon name="remove" size={16} color={colors.brandOrange} />
                    </Pressable>
                    <AppText variant="body" weight="bold" style={{ minWidth: 24, textAlign: "center" }}>
                      {selectedQty}
                    </AppText>
                    <Pressable
                      onPress={() => setItemQty(item.publicId, Math.min(available, selectedQty + 1))}
                      style={[styles.qtyBtn, styles.qtyBtnPlus]}
                    >
                      <Icon name="add" size={16} color={colors.white} />
                    </Pressable>
                    <AppText variant="caption" color={colors.muted}>of {available}</AppText>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <AppText variant="subtitle" style={styles.sectionTitle}>Reason</AppText>
        {REASONS.map((r) => (
          <Pressable key={r.code} onPress={() => setReason(r.code)} style={[styles.reasonRow, reason === r.code && styles.reasonSelected]}>
            <View style={[styles.radio, reason === r.code && styles.radioChecked]} />
            <AppText variant="body">{r.label}</AppText>
          </Pressable>
        ))}

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Additional details (optional)"
          placeholderTextColor={colors.mutedLight}
          multiline
          maxLength={500}
        />

        <AppText variant="subtitle" style={styles.sectionTitle}>Preferred Resolution</AppText>
        {replacementBlocked && replacementBlockReason && (
          <View style={styles.warningBanner}>
            <Icon name="info-outline" size={16} color={colors.warning} />
            <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
              Replacement is not available for this item ({replacementBlockReason.replace(/_/g, " ").toLowerCase()}).
            </AppText>
          </View>
        )}
        {availableResolutions.map((r) => (
          <Pressable key={r.code} onPress={() => setResolution(r.code)} style={[styles.reasonRow, resolution === r.code && styles.reasonSelected]}>
            <View style={[styles.radio, resolution === r.code && styles.radioChecked]} />
            <AppText variant="body">{r.label}</AppText>
          </Pressable>
        ))}

        <AppButton
          title={submitting ? "Submitting..." : `Request Return for ${selected.size} Item${selected.size !== 1 ? "s" : ""}`}
          variant="primary"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={selected.size === 0 || !reason}
          onPress={handleSubmit}
          style={{ marginTop: spacing[4] }}
        />
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
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginBottom: spacing[3],
  },
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
  qtyStepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginLeft: 22 + spacing[3] + spacing[3],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
  },
  qtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.brandOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnPlus: {
    backgroundColor: colors.brandOrange,
    borderColor: colors.brandOrange,
  },
});
