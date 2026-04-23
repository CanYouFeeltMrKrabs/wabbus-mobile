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
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { pickItemTitle, pickItemImage } from "@/lib/orderHelpers";
import { FALLBACK_IMAGE } from "@/lib/config";
import { invalidate, useOrderDetail, useReturnsList, useReplacementCheck } from "@/lib/queries";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import type { ReturnReasonCode, ReturnResolution } from "@/lib/types";

type ReturnOrderItem = {
  publicId?: string | null;
  title?: string | null;
  image?: string | null;
  quantity?: number | null;
  unitPrice?: string | number | null;
  status?: string | null;
  quantityReturned?: number;
  productVariant?: {
    publicId?: string | null;
    title?: string | null;
    product?: {
      title?: string | null;
      imageUrl?: string | null;
      images?: Array<{ key?: string; url?: string }> | null;
    } | null;
  } | null;
};

type ExistingReturn = {
  status: string;
  items?: Array<{
    orderItemPublicId?: string;
    quantityToReturn?: number;
    orderItem?: { publicId?: string };
  }>;
};

type ReasonOption = { code: ReturnReasonCode; labelKey: string };
type ResolutionOption = { code: ReturnResolution; labelKey: string };

const REASON_OPTIONS: ReasonOption[] = [
  { code: "DAMAGED", labelKey: "accountOrders.return.reasonDamaged" },
  { code: "DEFECTIVE", labelKey: "accountOrders.return.reasonDefective" },
  { code: "WRONG_ITEM", labelKey: "accountOrders.return.reasonWrongItem" },
  { code: "NOT_AS_DESCRIBED", labelKey: "accountOrders.return.reasonNotAsDescribed" },
  { code: "DOESNT_FIT", labelKey: "accountOrders.return.reasonDoesntFit" },
  { code: "CHANGED_MIND", labelKey: "accountOrders.return.reasonChangedMind" },
  { code: "OTHER", labelKey: "accountOrders.return.reasonOther" },
];

const RESOLUTION_OPTIONS: ResolutionOption[] = [
  { code: "REFUND", labelKey: "accountOrders.return.resolutionRefund" },
  { code: "STORE_CREDIT", labelKey: "accountOrders.return.resolutionStoreCredit" },
  { code: "REPLACEMENT", labelKey: "accountOrders.return.resolutionReplacement" },
];

export default function ReturnScreen() {
  return (
    <RequireAuth>
      <ReturnContent />
    </RequireAuth>
  );
}

function ReturnContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: order, isLoading: orderLoading } = useOrderDetail(id);

  const { data: returnsRaw, isLoading: returnsLoading } = useReturnsList({
    enabled: !!id,
  });

  const loading = orderLoading || returnsLoading;

  const pendingReturnItems = useMemo(() => {
    const returnsList = (returnsRaw ?? []) as unknown as ExistingReturn[];
    const pending = new Map<string, number>();
    for (const ret of returnsList) {
      if (["CLOSED", "CLOSED_EXPIRED", "REFUNDED", "CREDITED"].includes(ret.status)) continue;
      for (const item of ret.items ?? []) {
        const itemId = item.orderItemPublicId ?? item.orderItem?.publicId;
        const qty = item.quantityToReturn ?? 0;
        if (itemId) pending.set(itemId, (pending.get(itemId) ?? 0) + qty);
      }
    }
    return pending;
  }, [returnsRaw]);

  const [selected, setSelected] = useState<Map<string, number>>(new Map());
  const [reason, setReason] = useState<ReturnReasonCode | null>(null);
  const [resolution, setResolution] = useState<ReturnResolution>("REFUND");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const firstSelectedId = useMemo(() => [...selected.keys()][0] ?? null, [selected]);

  const { data: replacementCheckData } = useReplacementCheck(firstSelectedId);

  const replacementBlocked = !!replacementCheckData?.blocked;
  const replacementBlockReason = replacementCheckData?.code ?? null;

  const availableResolutions = useMemo(() => {
    if (replacementBlocked) return RESOLUTION_OPTIONS.filter((r) => r.code !== "REPLACEMENT");
    return RESOLUTION_OPTIONS;
  }, [replacementBlocked]);

  useEffect(() => {
    if (replacementBlocked && resolution === "REPLACEMENT") setResolution("REFUND");
  }, [replacementBlocked, resolution]);

  const returnableItems = ((order?.items || []) as ReturnOrderItem[]).filter(
    (item) => !["CANCELLED", "REFUNDED"].includes(item.status ?? ""),
  );

  const getAvailable = (item: ReturnOrderItem) => {
    const pending = pendingReturnItems.get(item.publicId ?? "") ?? 0;
    const returned = item.quantityReturned ?? 0;
    return Math.max(0, (item.quantity ?? 0) - returned - pending);
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
        .filter((i) => selected.has(i.publicId ?? ""))
        .map((i) => ({
          orderItemPublicId: i.publicId,
          quantityToReturn: selected.get(i.publicId ?? "") ?? (i.quantity ?? 0),
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

      void invalidate.returns.all();
      void invalidate.orders.detail(id!);
      void invalidate.messages.cases.all();
      setDone(true);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("accountOrders.return.errorSubmit"));
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
        <Icon name="inventory" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} align="center" style={{ marginTop: spacing[3] }}>
          {!order ? t("orders.notFound") : t("accountOrders.return.deliveredOnly")}
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
          {t("accountOrders.return.successHeading")}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2], maxWidth: 280 }}>
          {t("accountOrders.return.successBody")}
        </AppText>
        <AppButton title={t("accountOrders.return.backToOrder")} variant="primary" onPress={() => router.back()} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("accountOrders.return.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="body" color={colors.muted} style={styles.desc}>
          {t("accountOrders.return.subtitle")}
        </AppText>

        {returnableItems.map((item, idx) => {
          const pid = item.publicId ?? "";
          const qty = item.quantity ?? 0;
          const available = getAvailable(item);
          const isDisabled = available <= 0;
          const isSelected = selected.has(pid);
          const selectedQty = selected.get(pid) ?? 1;
          return (
            <View key={pid || idx}>
              <Pressable
                onPress={() => toggleItem(pid, available)}
                disabled={isDisabled}
                style={[styles.itemCard, isSelected && styles.itemSelected, isDisabled && { opacity: 0.5 }]}
              >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                  {isSelected && <Icon name="check" size={14} color={colors.white} />}
                </View>
                <Image source={{ uri: pickItemImage(item) || FALLBACK_IMAGE }} style={styles.itemImg} resizeMode="cover" />
                <View style={styles.itemInfo}>
                  <AppText variant="label" numberOfLines={2}>{pickItemTitle(item)}</AppText>
                  {isDisabled ? (
                    <AppText variant="caption" color={colors.warning}>
                      {(pendingReturnItems.get(pid) ?? 0) > 0 ? t("accountOrders.return.returnPending") : t("accountOrders.return.fullyReturned")}
                    </AppText>
                  ) : available < qty ? (
                    <AppText variant="caption" color={colors.muted}>{t("accountOrders.return.availableOf", { available, total: qty })}</AppText>
                  ) : (
                    <AppText variant="caption">{t("orders.qtyLabel", { count: qty })}</AppText>
                  )}
                </View>
              </Pressable>
              {isSelected && available > 1 && (
                <View style={styles.qtyStepper}>
                  <AppText variant="caption" weight="bold" color={colors.muted}>{t("accountOrders.return.quantity")}</AppText>
                  <View style={styles.qtyControls}>
                    <Pressable
                      onPress={() => setItemQty(pid, Math.max(1, selectedQty - 1))}
                      style={styles.qtyBtn}
                    >
                      <Icon name="remove" size={16} color={colors.brandOrange} />
                    </Pressable>
                    <AppText variant="body" weight="bold" style={{ minWidth: 24, textAlign: "center" }}>
                      {selectedQty}
                    </AppText>
                    <Pressable
                      onPress={() => setItemQty(pid, Math.min(available, selectedQty + 1))}
                      style={[styles.qtyBtn, styles.qtyBtnPlus]}
                    >
                      <Icon name="add" size={16} color={colors.white} />
                    </Pressable>
                    <AppText variant="caption" color={colors.muted}>{t("accountOrders.return.ofTotal", { total: available })}</AppText>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        <AppText variant="subtitle" style={styles.sectionTitle}>{t("accountOrders.return.reasonHeading")}</AppText>
        {REASON_OPTIONS.map((r) => (
          <Pressable key={r.code} onPress={() => setReason(r.code)} style={[styles.reasonRow, reason === r.code && styles.reasonSelected]}>
            <View style={[styles.radio, reason === r.code && styles.radioChecked]} />
            <AppText variant="body">{t(r.labelKey)}</AppText>
          </Pressable>
        ))}

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder={t("accountOrders.return.notePlaceholder")}
          placeholderTextColor={colors.mutedLight}
          multiline
          maxLength={500}
        />

        <AppText variant="subtitle" style={styles.sectionTitle}>{t("accountOrders.return.resolutionHeading")}</AppText>
        {replacementBlocked && replacementBlockReason && (
          <View style={styles.warningBanner}>
            <Icon name="info-outline" size={16} color={colors.warning} />
            <AppText variant="caption" color={colors.warning} style={{ flex: 1 }}>
              {t("accountOrders.return.replacementBlocked", { reason: replacementBlockReason.replace(/_/g, " ").toLowerCase() })}
            </AppText>
          </View>
        )}
        {availableResolutions.map((r) => (
          <Pressable key={r.code} onPress={() => setResolution(r.code)} style={[styles.reasonRow, resolution === r.code && styles.reasonSelected]}>
            <View style={[styles.radio, resolution === r.code && styles.radioChecked]} />
            <AppText variant="body">{t(r.labelKey)}</AppText>
          </Pressable>
        ))}

        <AppButton
          title={submitting ? t("accountOrders.return.submitting") : t("accountOrders.return.requestReturn", { count: selected.size })}
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
