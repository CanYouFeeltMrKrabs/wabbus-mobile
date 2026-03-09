import React from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import TicketThread from "@/components/TicketThread";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { CustomerCase } from "@/lib/messages-types";

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; fg: string; icon: string }
> = {
  OPEN: { label: "In Review", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
  OPEN_PENDING_FLAG_OR_DECISION: { label: "In Review", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
  AWAITING_VENDOR: { label: "Awaiting Vendor", bg: colors.warningLight, fg: colors.warning, icon: "schedule" },
  AWAITING_CUSTOMER: { label: "Action Needed", bg: "#f3e8ff", fg: "#7c3aed", icon: "priority-high" },
  AWAITING_SUPPORT: { label: "In Review", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "support-agent" },
  IN_PROGRESS: { label: "In Progress", bg: "#e0f2fe", fg: "#0891b2", icon: "sync" },
  RESOLVED: { label: "Resolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
  RESOLVED_GRACE: { label: "Resolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
  CLOSED: { label: "Closed", bg: colors.gray100, fg: colors.gray500, icon: "lock" },
};

const INTENT_LABELS: Record<string, string> = {
  REFUND: "Refund",
  STORE_CREDIT: "Store Credit",
  REPLACEMENT: "Replacement",
  RETURN: "Return",
  MISSING_PACKAGE: "Missing Package",
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
      "Item",
  );
}

type Props = {
  familyNumber: string;
  cases: CustomerCase[];
  onClose: () => void;
  onCasePress: (caseNumber: string) => void;
};

export default function FamilyDetailPanel({
  familyNumber,
  cases,
  onClose,
  onCasePress,
}: Props) {
  const insets = useSafeAreaInsets();
  const aggStatus = aggregateStatus(cases);
  const aggCfg = STATUS_CONFIG[aggStatus] ?? STATUS_CONFIG.OPEN;
  const ticketPublicId =
    cases.find((c) => c.linkedTicketPublicId)?.linkedTicketPublicId ?? null;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing[2] }]}>
        <View style={styles.headerLeft}>
          <View style={styles.familyIconBox}>
            <Icon name="folder" size={18} color={colors.brandBlue} />
          </View>
          <AppText variant="subtitle" numberOfLines={1}>
            Family {familyNumber}
          </AppText>
        </View>
        <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
          <Icon name="close" size={20} color={colors.muted} />
        </Pressable>
      </View>

      {/* ── Summary strip ── */}
      <View style={styles.summaryStrip}>
        <View style={[styles.chip, { backgroundColor: aggCfg.bg }]}>
          <Icon name={aggCfg.icon} size={12} color={aggCfg.fg} />
          <AppText variant="caption" weight="bold" color={aggCfg.fg}>
            {aggCfg.label}
          </AppText>
        </View>
        <View style={[styles.chip, { backgroundColor: colors.gray100 }]}>
          <AppText variant="caption" weight="semibold" color={colors.gray600}>
            {cases.length} case{cases.length !== 1 ? "s" : ""}
          </AppText>
        </View>
      </View>

      {/* ── Cases list ── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollInner,
          { paddingBottom: insets.bottom + spacing[6] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="label" style={styles.sectionLabel}>
          Cases
        </AppText>

        {cases.map((c) => {
          const cfg = STATUS_CONFIG[c.status] ?? STATUS_CONFIG.OPEN;
          const inactive = isCaseInactive(c.status);
          const titles = itemTitles(c);
          const summary =
            titles.slice(0, 2).join(", ") +
            (titles.length > 2 ? ` +${titles.length - 2}` : "");
          const intentLabel =
            INTENT_LABELS[c.resolutionIntent] ?? c.resolutionIntent.replace(/_/g, " ");

          return (
            <Pressable
              key={c.caseNumber}
              style={({ pressed }) => [
                styles.caseCard,
                inactive && styles.caseCardInactive,
                pressed && { opacity: inactive ? 0.4 : 0.85 },
              ]}
              onPress={() => onCasePress(c.caseNumber)}
            >
              <View style={styles.caseCardTop}>
                <View style={styles.caseCardTitleRow}>
                  <AppText variant="label">{c.caseNumber}</AppText>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <AppText variant="tiny" weight="bold" color={cfg.fg}>
                      {cfg.label}
                    </AppText>
                  </View>
                </View>
                <Icon name="chevron-right" size={16} color={colors.mutedLight} />
              </View>

              <View style={styles.caseMeta}>
                <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                  {intentLabel}
                  {summary ? ` · ${summary}` : ""}
                </AppText>
                <AppText variant="caption">
                  {new Date(c.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </AppText>
              </View>
            </Pressable>
          );
        })}

        {/* Support thread */}
        {ticketPublicId ? (
          <View style={styles.section}>
            <AppText variant="label" style={styles.sectionLabel}>
              Support Thread
            </AppText>
            <View style={styles.threadBox}>
              <TicketThread ticketPublicId={ticketPublicId} />
            </View>
          </View>
        ) : (
          <View style={styles.contactCard}>
            <Icon name="chat-bubble-outline" size={20} color={colors.muted} />
            <AppText
              variant="caption"
              color={colors.muted}
              style={{ marginTop: spacing[1], textAlign: "center" }}
            >
              Need help with these cases? Open a support ticket for assistance.
            </AppText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  /* ── Header ── */
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    flex: 1,
  },
  familyIconBox: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray100,
    marginLeft: spacing[2],
  },

  /* ── Summary ── */
  summaryStrip: {
    flexDirection: "row",
    gap: spacing[1.5],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },

  /* ── Scroll ── */
  scroll: { flex: 1 },
  scrollInner: { paddingHorizontal: spacing[4], paddingTop: spacing[3] },

  /* ── Sections ── */
  section: { marginTop: spacing[4] },
  sectionLabel: { marginBottom: spacing[2] },

  /* ── Case cards ── */
  caseCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginBottom: spacing[2],
    ...shadows.sm,
  },
  caseCardInactive: { opacity: 0.5 },
  caseCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  caseCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  statusBadge: {
    paddingHorizontal: spacing[1.5],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },
  caseMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing[1.5],
  },

  /* ── Thread ── */
  threadBox: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    minHeight: 120,
    ...shadows.sm,
  },

  /* ── Contact ── */
  contactCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginTop: spacing[4],
    alignItems: "center",
    ...shadows.sm,
  },
});
