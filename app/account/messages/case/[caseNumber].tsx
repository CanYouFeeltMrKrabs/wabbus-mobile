import React, { useEffect, useState, useCallback } from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import TicketThread from "@/components/TicketThread";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { CustomerCaseDetail } from "@/lib/messages-types";

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  OPEN: { label: "In Review", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
  RESOLVED: { label: "Resolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
  CLOSED: { label: "Closed", bg: colors.gray100, fg: colors.gray500, icon: "lock" },
};

const INTENT_LABELS: Record<string, string> = {
  REFUND: "Refund",
  STORE_CREDIT: "Store Credit",
  REPLACEMENT: "Replacement",
  RETURN: "Return",
  MISSING_PACKAGE: "Missing Package",
};

function refundStatusLabel(status: string): string {
  if (status === "SUCCEEDED") return "Processed";
  if (status === "PENDING") return "Processing";
  if (status === "FAILED") return "Pending retry";
  return status;
}

function refundStatusColor(status: string): { bg: string; fg: string } {
  if (status === "SUCCEEDED") return { bg: colors.successLight, fg: colors.success };
  if (status === "PENDING") return { bg: colors.brandBlueLight, fg: colors.brandBlue };
  return { bg: colors.warningLight, fg: colors.warning };
}

export default function CaseDetailScreen() {
  return <RequireAuth><CaseDetailContent /></RequireAuth>;
}

function CaseDetailContent() {
  const { caseNumber } = useLocalSearchParams<{ caseNumber: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [caseDetail, setCaseDetail] = useState<CustomerCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCase = useCallback(() => {
    if (!caseNumber) return;
    setLoading(true);
    setError(null);
    customerFetch<CustomerCaseDetail>(`/cases/${caseNumber}`)
      .then(setCaseDetail)
      .catch((e) => {
        setError(e?.message ?? "Failed to load case");
        setCaseDetail(null);
      })
      .finally(() => setLoading(false));
  }, [caseNumber]);

  useEffect(() => { fetchCase(); }, [fetchCase]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (error || !caseDetail) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {error ?? "Case not found"}
        </AppText>
        <AppButton title="Retry" variant="outline" onPress={fetchCase} style={{ marginTop: spacing[4] }} />
        <AppButton title="Go Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing[2] }} />
      </View>
    );
  }

  const status = STATUS_CONFIG[caseDetail.status] ?? STATUS_CONFIG.OPEN;
  const intentLabel = INTENT_LABELS[caseDetail.resolutionIntent] ?? caseDetail.resolutionIntent;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Case {caseDetail.id}</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View style={[styles.statusBadgeLarge, { backgroundColor: status.bg }]}>
            <Icon name={status.icon} size={20} color={status.fg} />
            <AppText variant="subtitle" color={status.fg}>{status.label}</AppText>
          </View>
          <AppText variant="caption" style={{ marginTop: spacing[2] }}>
            Opened {new Date(caseDetail.createdAt).toLocaleDateString()}
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText variant="label">Resolution</AppText>
          <AppText variant="body" style={{ marginTop: spacing[1] }}>{intentLabel}</AppText>
          {caseDetail.resolutionFinal && (
            <AppText variant="caption" style={{ marginTop: spacing[0.5] }}>
              Final: {INTENT_LABELS[caseDetail.resolutionFinal] ?? caseDetail.resolutionFinal}
            </AppText>
          )}
        </View>

        {caseDetail.items.length > 0 && (
          <>
            <AppText variant="subtitle" style={styles.sectionTitle}>Items</AppText>
            {caseDetail.items.map((item, idx) => {
              const title =
                item.orderItem?.productVariant?.product?.title ||
                item.orderItem?.productVariant?.title ||
                `Item #${item.orderItem?.publicId ?? "?"}`;
              return (
                <View key={item.publicId ?? String(idx)} style={styles.itemCard}>
                  <View style={styles.itemInfo}>
                    <AppText variant="label" numberOfLines={2}>{title}</AppText>
                    <AppText variant="caption">Qty: {item.quantity}</AppText>
                    {item.orderItem?.productVariant?.sku && (
                      <AppText variant="caption">SKU: {item.orderItem.productVariant.sku}</AppText>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {caseDetail.refund && (
          <View style={styles.card}>
            <AppText variant="label">Refund</AppText>
            <View style={styles.refundRow}>
              <AppText variant="subtitle">{formatMoney(caseDetail.refund.amountCents)}</AppText>
              <View style={[styles.refundBadge, { backgroundColor: refundStatusColor(caseDetail.refund.status).bg }]}>
                <AppText
                  variant="caption"
                  weight="semibold"
                  color={refundStatusColor(caseDetail.refund.status).fg}
                >
                  {refundStatusLabel(caseDetail.refund.status)}
                </AppText>
              </View>
            </View>
            <AppText variant="caption" style={{ marginTop: spacing[1] }}>
              Initiated {new Date(caseDetail.refund.createdAt).toLocaleDateString()}
            </AppText>
          </View>
        )}

        {caseDetail.linkedTicketPublicId ? (
          <>
            <AppText variant="subtitle" style={styles.sectionTitle}>Support Thread</AppText>
            <View style={styles.threadContainer}>
              <TicketThread ticketPublicId={caseDetail.linkedTicketPublicId} />
            </View>
          </>
        ) : (
          <View style={styles.contactCard}>
            <Icon name="chat-bubble-outline" size={24} color={colors.muted} />
            <AppText variant="bodySmall" color={colors.muted} style={{ marginTop: spacing[2], textAlign: "center" }}>
              Need help with this case?
            </AppText>
            <AppButton
              title="Contact Support"
              variant="primary"
              size="sm"
              style={{ marginTop: spacing[3] }}
              onPress={() => {}}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  statusCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    alignItems: "center",
    ...shadows.sm,
  },
  statusBadgeLarge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    ...shadows.sm,
  },
  sectionTitle: { marginTop: spacing[2], marginBottom: spacing[3] },
  itemCard: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    marginBottom: spacing[2],
    ...shadows.sm,
  },
  itemInfo: { flex: 1, gap: spacing[0.5] },
  refundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing[2],
  },
  refundBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },
  threadContainer: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    minHeight: 120,
    ...shadows.sm,
  },
  contactCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[6],
    marginTop: spacing[4],
    alignItems: "center",
    ...shadows.sm,
  },
});
