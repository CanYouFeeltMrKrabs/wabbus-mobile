import React from "react";
import { View, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
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
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/orderHelpers";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import i18n from "@/i18n";
import type { CustomerCaseDetail } from "@/lib/messages-types";

function getStatusConfig(status: string): { label: string; bg: string; fg: string; icon: string } {
  const configs: Record<string, { labelKey: string; bg: string; fg: string; icon: string }> = {
    OPEN: { labelKey: "messages.caseDetail.statusInReview", bg: colors.brandBlueLight, fg: colors.brandBlue, icon: "search" },
    RESOLVED: { labelKey: "messages.caseDetail.statusResolved", bg: colors.successLight, fg: colors.success, icon: "check-circle" },
    CLOSED: { labelKey: "messages.caseDetail.statusClosed", bg: colors.gray100, fg: colors.gray500, icon: "lock" },
  };
  const cfg = configs[status] ?? configs.OPEN;
  return { ...cfg, label: i18n.t(cfg.labelKey) };
}

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

function refundStatusLabel(status: string): string {
  if (status === "SUCCEEDED") return i18n.t("messages.caseDetail.refundProcessed");
  if (status === "PENDING") return i18n.t("messages.caseDetail.refundProcessing");
  if (status === "FAILED") return i18n.t("messages.caseDetail.refundPendingRetry");
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
  const { t } = useTranslation();
  const { caseNumber } = useLocalSearchParams<{ caseNumber: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    data: caseDetail,
    isLoading: loading,
    error: queryError,
    refetch: fetchCase,
  } = useQuery({
    queryKey: queryKeys.messages.cases.detail(caseNumber!),
    queryFn: () => customerFetch<CustomerCaseDetail>(`/cases/${caseNumber}`),
    enabled: !!caseNumber,
  });

  const error = queryError ? ((queryError as Error).message ?? t("messages.caseDetail.failedToLoad")) : null;

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
          {error ?? t("messages.caseDetail.notFound")}
        </AppText>
        <AppButton title={t("messages.caseDetail.retry")} variant="outline" onPress={fetchCase} style={{ marginTop: spacing[4] }} />
        <AppButton title={t("messages.caseDetail.goBack")} variant="ghost" onPress={() => router.back()} style={{ marginTop: spacing[2] }} />
      </View>
    );
  }

  const status = getStatusConfig(caseDetail.status);
  const intentLabel = getIntentLabel(caseDetail.resolutionIntent);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("messages.caseDetail.heading", { id: caseDetail.id })}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.statusCard}>
          <View style={[styles.statusBadgeLarge, { backgroundColor: status.bg }]}>
            <Icon name={status.icon} size={20} color={status.fg} />
            <AppText variant="subtitle" color={status.fg}>{status.label}</AppText>
          </View>
          <AppText variant="caption" style={{ marginTop: spacing[2] }}>
            {t("messages.caseDetail.opened", { date: formatDate(caseDetail.createdAt) })}
          </AppText>
        </View>

        <View style={styles.card}>
          <AppText variant="label">{t("messages.caseDetail.resolution")}</AppText>
          <AppText variant="body" style={{ marginTop: spacing[1] }}>{intentLabel}</AppText>
          {caseDetail.resolutionFinal && (
            <AppText variant="caption" style={{ marginTop: spacing[0.5] }}>
              {t("messages.caseDetail.final", { resolution: getIntentLabel(caseDetail.resolutionFinal) })}
            </AppText>
          )}
        </View>

        {caseDetail.items.length > 0 && (
          <>
            <AppText variant="subtitle" style={styles.sectionTitle}>{t("messages.caseDetail.items")}</AppText>
            {caseDetail.items.map((item, idx) => {
              const title =
                item.orderItem?.productVariant?.product?.title ||
                item.orderItem?.productVariant?.title ||
                t("messages.caseDetail.itemLabel", { id: item.orderItem?.publicId ?? "?" });
              return (
                <View key={item.publicId ?? String(idx)} style={styles.itemCard}>
                  <View style={styles.itemInfo}>
                    <AppText variant="label" numberOfLines={2}>{title}</AppText>
                    <AppText variant="caption">{t("messages.caseDetail.qty", { count: item.quantity })}</AppText>
                    {item.orderItem?.productVariant?.sku && (
                      <AppText variant="caption">{t("messages.caseDetail.sku", { sku: item.orderItem.productVariant.sku })}</AppText>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {caseDetail.refund && (
          <View style={styles.card}>
            <AppText variant="label">{t("messages.caseDetail.refund")}</AppText>
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
              {t("messages.caseDetail.initiated", { date: formatDate(caseDetail.refund.createdAt) })}
            </AppText>
          </View>
        )}

        {caseDetail.linkedTicketPublicId ? (
          <>
            <AppText variant="subtitle" style={styles.sectionTitle}>{t("messages.caseDetail.supportThread")}</AppText>
            <View style={styles.threadContainer}>
              <TicketThread ticketPublicId={caseDetail.linkedTicketPublicId} />
            </View>
          </>
        ) : (
          <View style={styles.contactCard}>
            <Icon name="chat-bubble-outline" size={24} color={colors.muted} />
            <AppText variant="bodySmall" color={colors.muted} style={{ marginTop: spacing[2], textAlign: "center" }}>
              {t("messages.caseDetail.needHelp")}
            </AppText>
            <AppButton
              title={t("messages.caseDetail.contactSupport")}
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
