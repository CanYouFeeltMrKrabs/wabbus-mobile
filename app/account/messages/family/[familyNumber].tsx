import React from "react";
import { View, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import TicketThread from "@/components/TicketThread";
import { useQuery } from "@tanstack/react-query";
import { customerFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { formatDate } from "@/lib/orderHelpers";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import i18n from "@/i18n";
import type { CustomerCase } from "@/lib/messages-types";

function getStatusConfig(status: string): { label: string; bg: string; fg: string; icon: string } {
  const configs: Record<string, { labelKey: string; bg: string; fg: string; icon: string }> = {
    OPEN: { labelKey: "messages.caseDetail.statusInReview", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
    OPEN_PENDING_FLAG_OR_DECISION: { labelKey: "messages.caseDetail.statusInReview", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
    AWAITING_VENDOR: { labelKey: "messages.caseDetail.statusInReview", bg: colors.warningLight, fg: colors.warning, icon: "schedule" },
    AWAITING_CUSTOMER: { labelKey: "messages.familyDetail.statusActionNeeded", bg: "#f3e8ff", fg: "#7c3aed", icon: "priority-high" },
    AWAITING_SUPPORT: { labelKey: "messages.caseDetail.statusInReview", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "support-agent" },
    IN_PROGRESS: { labelKey: "messages.familyDetail.statusInProgress", bg: "#e0f2fe", fg: "#0891b2", icon: "sync" },
    RESOLVED: { labelKey: "messages.caseDetail.statusResolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
    RESOLVED_GRACE: { labelKey: "messages.caseDetail.statusResolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
    CLOSED: { labelKey: "messages.caseDetail.statusClosed", bg: colors.gray100, fg: colors.gray500, icon: "lock" },
  };
  const cfg = configs[status] ?? configs.OPEN;
  return { ...cfg, label: i18n.t(cfg.labelKey) };
}

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

function getIntentLabel(intent: string): string {
  const keys: Record<string, string> = {
    REFUND: "messages.caseDetail.intentRefund",
    STORE_CREDIT: "messages.caseDetail.intentStoreCredit",
    REPLACEMENT: "messages.caseDetail.intentReplacement",
    RETURN: "messages.caseDetail.intentReturn",
    MISSING_PACKAGE: "messages.caseDetail.intentMissingPackage",
  };
  return keys[intent] ? i18n.t(keys[intent]) : intent;
}

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
      i18n.t("messages.itemFallback")
  );
}

export default function FamilyDetailScreen() {
  return <RequireAuth><FamilyDetailContent /></RequireAuth>;
}

function FamilyDetailContent() {
  const { t } = useTranslation();
  const { familyNumber } = useLocalSearchParams<{ familyNumber: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    data: cases = [],
    isLoading: loading,
    error: queryError,
    refetch: fetchCases,
  } = useQuery({
    queryKey: queryKeys.messages.cases.familyMessages(familyNumber!),
    queryFn: async () => {
      const data = await customerFetch<any>("/cases/mine?limit=200");
      const all: CustomerCase[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      return all.filter((c) => c.caseFamily?.familyNumber === familyNumber);
    },
    enabled: !!familyNumber,
  });

  const error = queryError ? ((queryError as Error).message ?? t("messages.familyDetail.failedToLoad")) : null;

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
        <AppButton title={t("messages.familyDetail.retry")} variant="outline" onPress={() => fetchCases()} style={{ marginTop: spacing[4] }} />
        <AppButton title={t("messages.familyDetail.goBack")} variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing[2] }} />
      </View>
    );
  }

  if (cases.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="folder-open" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {t("messages.familyDetail.noCasesInFamily")}
        </AppText>
        <AppButton title={t("messages.familyDetail.goBack")} variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const aggStatus = aggregateStatus(cases);
  const aggCfg = getStatusConfig(aggStatus);
  const ticketPublicId = cases.find((c) => c.linkedTicketPublicId)?.linkedTicketPublicId ?? null;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("messages.familyDetail.heading", { familyNumber })}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View>
              <AppText variant="subtitle">{t("messages.familyDetail.caseFamily")}</AppText>
              <AppText variant="caption">{cases.length === 1 ? t("messages.familyDetail.casesCount", { count: cases.length }) : t("messages.familyDetail.casesCountPlural", { count: cases.length })}</AppText>
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
          const cfg = getStatusConfig(c.status);
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
                {getIntentLabel(c.resolutionIntent)}
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
            <AppText variant="subtitle" style={styles.sectionTitle}>{t("messages.familyDetail.supportThread")}</AppText>
            <View style={styles.threadContainer}>
              <TicketThread ticketPublicId={ticketPublicId} />
            </View>
          </>
        ) : (
          <View style={styles.contactCard}>
            <Icon name="chat-bubble-outline" size={24} color={colors.muted} />
            <AppText variant="bodySmall" color={colors.muted} style={{ marginTop: spacing[2], textAlign: "center" }}>
              {t("messages.familyDetail.needHelp")}
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
