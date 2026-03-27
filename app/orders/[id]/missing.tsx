import React, { useEffect, useRef, useState } from "react";
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
import type { Order, MissingIssueReason, ReturnResolution } from "@/lib/types";

type MissingOrderItem = {
  publicId: string;
  title: string;
  image: string | null;
  quantity: number;
  unitPriceCents: number;
  status: string;
  quantityReturned?: number;
  vendor?: { name: string; publicId?: string | null } | null;
  shipmentItems?: Array<{
    quantity: number;
    shipment: { publicId?: string | null; direction?: string | null };
  }> | null;
  caseItems?: Array<{ caseNumber?: string }> | null;
};

type EligibilityResult = { orderItemPublicId: string; blocked: boolean; reason?: string };

const ISSUE_REASONS: { code: MissingIssueReason; label: string }[] = [
  { code: "NEVER_SHIPPED", label: "Never shipped" },
  { code: "TRACKING_STOPPED", label: "Tracking stopped updating" },
  { code: "LOST_IN_TRANSIT", label: "Lost in transit" },
  { code: "DELIVERED_NOT_RECEIVED", label: "Marked delivered but not received" },
  { code: "OTHER", label: "Other" },
];

const RESOLUTIONS: { code: ReturnResolution; label: string }[] = [
  { code: "REFUND", label: "Refund" },
  { code: "STORE_CREDIT", label: "Store credit" },
  { code: "REPLACEMENT", label: "Send replacement" },
];

export default function MissingPackageScreen() {
  return (
    <RequireAuth>
      <MissingContent />
    </RequireAuth>
  );
}

function MissingContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issueReason, setIssueReason] = useState<MissingIssueReason | null>(null);
  const [resolution, setResolution] = useState<ReturnResolution>("REFUND");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [blockedItems, setBlockedItems] = useState<Map<string, string>>(new Map());
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [availableCompensation, setAvailableCompensation] = useState<string[] | null>(null);
  const eligibilityLoadId = useRef(0);
  const [pendingCaseItems, setPendingCaseItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await customerFetch<any>(`/orders/${id}`);
        if (!cancelled) setOrder(data.order ?? data);
      } catch {
        if (!cancelled) setOrder(null);
      }

      try {
        const raw = await customerFetch<any>("/cases/mine");
        const cases: any[] = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
        if (!cancelled) {
          const pending = new Set<string>();
          for (const c of cases) {
            if (c.order?.publicId !== id) continue;
            if (c.status === "CLOSED") continue;
            for (const ci of c.items ?? []) {
              const pubId = ci.orderItem?.publicId ?? ci.orderItemPublicId;
              if (pubId) pending.add(pubId);
            }
          }
          setPendingCaseItems(pending);
        }
      } catch {
        // non-critical
      }

      if (!cancelled) setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [id]);

  const eligibleItems = (order?.items || []).filter(
    (item: any) => !["CANCELLED", "REFUNDED"].includes(item.status),
  ) as MissingOrderItem[];

  useEffect(() => {
    if (selected.size === 0 || !order?.publicId) {
      setBlockedItems(new Map());
      return;
    }

    const loadId = ++eligibilityLoadId.current;
    const itemsPayload = eligibleItems
      .filter((i) => selected.has(i.publicId))
      .map((i) => ({
        orderItemPublicId: i.publicId,
        shipmentPublicId: i.shipmentItems?.[0]?.shipment?.publicId ?? undefined,
        qtyRequested: i.quantity,
      }));

    setCheckingEligibility(true);
    customerFetch<any>("/cases/check-eligibility", {
      method: "POST",
      body: JSON.stringify({ orderPublicId: order.publicId, items: itemsPayload }),
    })
      .then((data) => {
        if (loadId !== eligibilityLoadId.current) return;
        const results: EligibilityResult[] = data.items ?? [];
        const blocked = new Map<string, string>();
        const eligible: any[] = [];
        for (const r of results) {
          if (r.blocked) blocked.set(r.orderItemPublicId, r.reason ?? "Not eligible");
          else eligible.push(r);
        }
        setBlockedItems(blocked);

        let intersected: string[] = [];
        if (eligible.length > 0) {
          intersected = [...(eligible[0].availableCompensation ?? [])];
          for (let i = 1; i < eligible.length; i++) {
            const set = new Set<string>(eligible[i].availableCompensation ?? []);
            intersected = intersected.filter((c) => set.has(c));
          }
        }
        setAvailableCompensation(intersected.length > 0 ? intersected : null);
        if (intersected.length > 0 && !intersected.includes(resolution)) {
          setResolution("" as ReturnResolution);
        }
      })
      .catch(() => {
        if (loadId === eligibilityLoadId.current) {
          setBlockedItems(new Map());
          setAvailableCompensation(null);
        }
      })
      .finally(() => {
        if (loadId === eligibilityLoadId.current) setCheckingEligibility(false);
      });
  }, [selected, order?.publicId]);

  const allSelectedBlocked =
    selected.size > 0 && [...selected].every((id) => blockedItems.has(id));

  const toggleItem = (publicId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!issueReason || selected.size === 0 || allSelectedBlocked) return;

    setSubmitting(true);
    try {
      const items = eligibleItems
        .filter((i) => selected.has(i.publicId) && !blockedItems.has(i.publicId))
        .map((i) => ({
          orderItemPublicId: i.publicId,
          shipmentPublicId: i.shipmentItems?.[0]?.shipment?.publicId ?? null,
          qtyRequested: i.quantity,
          _vendorKey: i.vendor?.publicId ?? i.vendor?.name ?? "__default__",
        }));

      if (items.length === 0) {
        Alert.alert("Ineligible", "All selected items are ineligible for a missing package claim.");
        setSubmitting(false);
        return;
      }

      const fullNote = note ? `[${issueReason}] ${note}` : `[${issueReason}]`;

      const vendorGroups = new Map<string, typeof items>();
      for (const item of items) {
        const key = item._vendorKey;
        if (!vendorGroups.has(key)) vendorGroups.set(key, []);
        vendorGroups.get(key)!.push(item);
      }

      const failures: string[] = [];

      for (const [, groupItems] of vendorGroups) {
        try {
          await customerFetch("/cases/missing", {
            method: "POST",
            body: JSON.stringify({
              orderPublicId: order!.publicId,
              items: groupItems.map(({ orderItemPublicId, shipmentPublicId, qtyRequested }) => ({
                orderItemPublicId,
                shipmentPublicId,
                qtyRequested,
              })),
              requestedResolution: resolution,
              note: fullNote,
            }),
          });
        } catch (e: any) {
          failures.push(e.message || "Failed for a vendor group");
        }
      }

      if (failures.length === vendorGroups.size) {
        Alert.alert("Error", failures[0] || "Unable to submit missing package report.");
      } else if (failures.length > 0) {
        Alert.alert(
          "Partial Success",
          `Report submitted for ${vendorGroups.size - failures.length} of ${vendorGroups.size} vendor group(s). Some submissions failed.`,
        );
        setDone(true);
      } else {
        setDone(true);
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Unable to submit missing package report.");
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

  const blocked = !order || ["PENDING", "CANCELLED", "COMPLETED"].includes(order.status);

  if (blocked) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="package-variant-closed" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} align="center" style={{ marginTop: spacing[3] }}>
          {!order ? "Order not found" : "Missing package reports are not available for this order."}
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
          Report Submitted
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2], maxWidth: 280 }}>
          We've opened a case for your missing package. You'll receive updates via email and in your messages.
        </AppText>
        <AppButton title="Back to Order" variant="primary" onPress={() => router.back()} style={{ marginTop: spacing[6] }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Missing Package</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="body" color={colors.muted} style={styles.desc}>
          Tell us which items are missing and what happened.
        </AppText>

        {eligibleItems.map((item) => {
          const hasPendingCase = pendingCaseItems.has(item.publicId);
          const isSelected = selected.has(item.publicId);
          const blockReason = blockedItems.get(item.publicId);
          return (
            <Pressable
              key={item.publicId}
              onPress={() => { if (!hasPendingCase) toggleItem(item.publicId); }}
              style={[styles.itemCard, isSelected && styles.itemSelected, hasPendingCase && { opacity: 0.5 }]}
            >
              <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                {isSelected && <Icon name="check" size={14} color={colors.white} />}
              </View>
              <Image source={{ uri: item.image || FALLBACK_IMAGE }} style={styles.itemImg} resizeMode="cover" />
              <View style={styles.itemInfo}>
                <AppText variant="label" numberOfLines={2}>{item.title}</AppText>
                <AppText variant="caption">Qty: {item.quantity}</AppText>
                {hasPendingCase && (
                  <AppText variant="caption" color={colors.warning}>
                    Already has an open case
                  </AppText>
                )}
                {isSelected && blockReason && (
                  <AppText variant="caption" color={colors.warning}>
                    {blockReason.replace(/_/g, " ")}
                  </AppText>
                )}
              </View>
            </Pressable>
          );
        })}

        {checkingEligibility && selected.size > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: spacing[2] }}>
            <ActivityIndicator size="small" color={colors.brandBlue} />
            <AppText variant="caption" color={colors.muted}>Checking eligibility...</AppText>
          </View>
        )}

        <AppText variant="subtitle" style={styles.sectionTitle}>What happened?</AppText>
        {ISSUE_REASONS.map((r) => (
          <Pressable key={r.code} onPress={() => setIssueReason(r.code)} style={[styles.reasonRow, issueReason === r.code && styles.reasonSelected]}>
            <View style={[styles.radio, issueReason === r.code && styles.radioChecked]} />
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
        {(availableCompensation
          ? RESOLUTIONS.filter((r) => availableCompensation.includes(r.code))
          : RESOLUTIONS
        ).map((r) => (
          <Pressable key={r.code} onPress={() => setResolution(r.code)} style={[styles.reasonRow, resolution === r.code && styles.reasonSelected]}>
            <View style={[styles.radio, resolution === r.code && styles.radioChecked]} />
            <AppText variant="body">{r.label}</AppText>
          </Pressable>
        ))}

        <AppButton
          title={submitting ? "Submitting..." : allSelectedBlocked ? "Selected items ineligible" : "Submit Report"}
          variant="primary"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={selected.size === 0 || !issueReason || allSelectedBlocked || checkingEligibility}
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
});
