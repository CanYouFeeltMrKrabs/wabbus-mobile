import React, { useEffect, useState, useCallback } from "react";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import TicketThread from "@/components/TicketThread";
import { customerFetch } from "@/lib/api";
import { formatDate } from "@/lib/orderHelpers";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { CustomerCase } from "@/lib/messages-types";

const STATUS_CONFIG: Record<string, { label: string; bg: string; fg: string; icon: string }> = {
  OPEN: { label: "In Review", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
  OPEN_PENDING_FLAG_OR_DECISION: { label: "In Review", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
  AWAITING_VENDOR: { label: "In Review", bg: colors.warningLight, fg: colors.warning, icon: "schedule" },
  AWAITING_CUSTOMER: { label: "Action Needed", bg: "#f3e8ff", fg: "#7c3aed", icon: "priority-high" },
  AWAITING_SUPPORT: { label: "In Review", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "support-agent" },
  IN_PROGRESS: { label: "In Progress", bg: "#e0f2fe", fg: "#0891b2", icon: "sync" },
  RESOLVED: { label: "Resolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
  RESOLVED_GRACE: { label: "Resolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
  CLOSED: { label: "Closed", bg: colors.gray100, fg: colors.gray500, icon: "lock" },
};

const URGENCY_ORDER = [
  "AWAITING_CUSTOMER",
  "AWAITING_SUPPORT",
  "OPEN_PENDING_FLAG_OR_DECISION",
  "AWAITING_VENDOR",
  "IN_PROGRESS",
  "OPEN",
  "RESOLVED_GRACE",
  "RESOLVED",
  "CLOSED",
];

const INTENT_LABELS: Record<string, string> = {
  REFUND: "Refund",
  STORE_CREDIT: "Store Credit",
  REPLACEMENT: "Replacement",
  RETURN: "Return",
  MISSING_PACKAGE: "Missing Package",
};

function aggregateStatus(cases: CustomerCase[]): string {
  let best = "CLOSED";
  let bestIdx = URGENCY_ORDER.length;
  for (const c of cases) {
    const idx = URGENCY_ORDER.indexOf(c.status);
    if (idx >= 0 && idx < bestIdx) {
      best = c.status;
      bestIdx = idx;
    }
  }
  return best;
}

function isCaseInactive(status: string): boolean {
  return status === "CLOSED" || status === "RESOLVED" || status === "RESOLVED_GRACE";
}

function itemTitles(c: CustomerCase): string[] {
  return c.items.map(
    (it) =>
      it.orderItem?.productVariant?.product?.title ||
      it.orderItem?.productVariant?.title ||
      "Item"
  );
}

export default function FamilyDetailScreen() {
  return <RequireAuth><FamilyDetailContent /></RequireAuth>;
}

function FamilyDetailContent() {
  const { familyNumber } = useLocalSearchParams<{ familyNumber: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cases, setCases] = useState<CustomerCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCases = useCallback(() => {
    if (!familyNumber) return;
    setLoading(true);
    setError(null);
    customerFetch<any>("/cases/mine?limit=200")
      .then((data) => {
        const all: CustomerCase[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        const filtered = all.filter(
          (c) => c.caseFamily?.familyNumber === familyNumber
        );
        setCases(filtered);
      })
      .catch((e) => {
        setError(e?.message ?? "Failed to load cases");
        setCases([]);
      })
      .finally(() => setLoading(false));
  }, [familyNumber]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {error}
        </AppText>
        <AppButton title="Retry" variant="outline" onPress={fetchCases} style={{ marginTop: spacing[4] }} />
        <AppButton title="Go Back" variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing[2] }} />
      </View>
    );
  }

  if (cases.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="folder-open" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>
          No cases found in this family
        </AppText>
        <AppButton title="Go Back" variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const aggStatus = aggregateStatus(cases);
  const aggCfg = STATUS_CONFIG[aggStatus] ?? STATUS_CONFIG.OPEN;
  const ticketPublicId = cases.find((c) => c.linkedTicketPublicId)?.linkedTicketPublicId ?? null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Family {familyNumber}</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <AppText variant="subtitle">Case Family</AppText>
              <AppText variant="caption">{cases.length} case{cases.length !== 1 ? "s" : ""}</AppText>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: aggCfg.bg }]}>
              <Icon name={aggCfg.icon} size={14} color={aggCfg.fg} />
              <AppText variant="caption" weight="bold" color={aggCfg.fg}>
                {aggCfg.label}
              </AppText>
            </View>
          </View>
        </View>

        {cases.map((c) => {
          const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.OPEN;
          const inactive = isCaseInactive(c.status);
          const titles = itemTitles(c);
          const itemsSummary =
            titles.slice(0, 2).join(", ") +
            (titles.length > 2 ? ` +${titles.length - 2}` : "");

          return (
            <Pressable
              key={c.caseNumber}
              style={({ pressed }) => [
                styles.caseCard,
                inactive && styles.caseCardInactive,
                pressed && { opacity: inactive ? 0.4 : 0.85 },
              ]}
              onPress={() => router.push(ROUTES.accountCase(c.caseNumber))}
            >
              <View style={styles.caseCardHeader}>
                <View style={styles.caseCardTitleRow}>
                  <AppText variant="label">{c.caseNumber}</AppText>
                  <View style={[styles.statusBadgeSmall, { backgroundColor: cfg.bg }]}>
                    <AppText variant="tiny" weight="bold" color={cfg.fg}>
                      {cfg.label}
                    </AppText>
                  </View>
                </View>
                <Icon name="chevron-right" size={18} color={colors.mutedLight} />
              </View>
              <AppText variant="caption" style={{ marginTop: spacing[1] }}>
                {INTENT_LABELS[c.resolutionIntent] ?? c.resolutionIntent}
                {itemsSummary ? ` · ${itemsSummary}` : ""}
              </AppText>
              <AppText variant="tiny" style={{ marginTop: spacing[1] }}>
                {formatDate(c.createdAt)}
              </AppText>
            </Pressable>
          );
        })}

        {ticketPublicId ? (
          <>
            <AppText variant="subtitle" style={styles.sectionTitle}>Support Thread</AppText>
            <View style={styles.threadContainer}>
              <TicketThread ticketPublicId={ticketPublicId} />
            </View>
          </>
        ) : (
          <View style={styles.contactCard}>
            <Icon name="chat-bubble-outline" size={24} color={colors.muted} />
            <AppText variant="bodySmall" color={colors.muted} style={{ marginTop: spacing[2], textAlign: "center" }}>
              Need help with these cases? Open a support ticket for assistance.
            </AppText>
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
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  summaryTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[2.5],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  statusBadgeSmall: {
    paddingHorizontal: spacing[1.5],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },
  caseCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[2],
    ...shadows.sm,
  },
  caseCardInactive: {
    opacity: 0.5,
  },
  caseCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  caseCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  sectionTitle: { marginTop: spacing[4], marginBottom: spacing[3] },
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
