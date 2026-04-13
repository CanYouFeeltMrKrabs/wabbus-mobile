import React, { useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  LayoutAnimation,
  UIManager,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customerFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/orderHelpers";
import { pickDocument, uploadFileAuth, type PickedFile } from "@/lib/fileUpload";
import { colors, spacing, borderRadius, fontSize, shadows } from "@/lib/theme";
import i18n from "@/i18n";
import type { CustomerCaseDetail } from "@/lib/messages-types";

/* ── Types ───────────────────────────────────────────────────── */

type CaseMessage = {
  publicId?: string;
  body: string;
  senderType: string;
  createdAt: string;
  attachmentKey?: string | null;
  attachmentFileName?: string | null;
};

/* ── Status / label helpers ──────────────────────────────────── */

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

function refundStatusLabel(s: string): string {
  if (s === "SUCCEEDED") return "Processed";
  if (s === "PENDING") return "Processing";
  if (s === "FAILED") return "Pending retry";
  return s;
}

function refundStatusColor(s: string) {
  if (s === "SUCCEEDED") return { bg: colors.successLight, fg: colors.success };
  if (s === "PENDING") return { bg: colors.brandBlueLight, fg: colors.brandBlue };
  return { bg: colors.warningLight, fg: colors.warning };
}

/* ── Root ────────────────────────────────────────────────────── */

export default function CaseDetailScreen() {
  return (
    <RequireAuth>
      <CaseDetailContent />
    </RequireAuth>
  );
}

/* ── Main Content ────────────────────────────────────────────── */

function CaseDetailContent() {
  const { t } = useTranslation();
  const { caseNumber } = useLocalSearchParams<{ caseNumber: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();

  /* ── Info expand state ─────────────────────────── */
  const [infoExpanded, setInfoExpanded] = useState(false);

  const toggleInfoPanel = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(
      250,
      LayoutAnimation.Types.easeInEaseOut,
      LayoutAnimation.Properties.opacity,
    ));
    setInfoExpanded((prev) => !prev);
  }, []);

  /* ── Case detail query ─────────────────────────── */
  const {
    data: caseDetail,
    isLoading: detailLoading,
    error: detailError,
  } = useQuery({
    queryKey: queryKeys.messages.cases.detail(caseNumber!),
    queryFn: () => customerFetch<CustomerCaseDetail>(`/cases/${caseNumber}`),
    enabled: !!caseNumber,
  });

  /* ── Case messages query ───────────────────────── */
  const {
    data: caseMessages = [],
    isLoading: messagesLoading,
    refetch: refetchMessages,
  } = useQuery({
    queryKey: queryKeys.messages.cases.messages(caseNumber!),
    queryFn: async () => {
      const data = await customerFetch<{ messages?: CaseMessage[] }>(
        `/cases/${caseNumber}/messages`,
      );
      return Array.isArray(data?.messages)
        ? data.messages
        : Array.isArray(data)
          ? (data as CaseMessage[])
          : [];
    },
    enabled: !!caseNumber,
    refetchInterval: 30_000,
  });

  /* ── Reply state ───────────────────────────────── */
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);

  /* ── Handlers ──────────────────────────────────── */

  const handlePickAttachment = useCallback(async () => {
    const file = await pickDocument();
    if (file) setPendingAttachment(file);
  }, []);

  const handleSend = useCallback(async () => {
    if ((!reply.trim() && !pendingAttachment) || !caseNumber) return;
    setSending(true);
    try {
      let attachmentFields: Record<string, string | number> = {};

      if (pendingAttachment) {
        setUploading(true);
        try {
          const result = await uploadFileAuth({
            presignUrl: "/uploads/support-ticket",
            confirmUrl: "/uploads/support-ticket/confirm",
            file: pendingAttachment,
          });
          attachmentFields = {
            attachmentKey: result.key,
            attachmentFileName: pendingAttachment.name,
            attachmentMimeType: pendingAttachment.mimeType,
            attachmentSize: pendingAttachment.size,
          };
        } finally {
          setUploading(false);
        }
      }

      await customerFetch(`/cases/${caseNumber}/follow-up`, {
        method: "POST",
        body: JSON.stringify({
          note: reply.trim() || (pendingAttachment ? "(attachment)" : ""),
          ...attachmentFields,
        }),
      });
      setReply("");
      setPendingAttachment(null);
      await refetchMessages();
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.cases.list() });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("messages.caseDetail.errorSend"));
    } finally {
      setSending(false);
    }
  }, [reply, pendingAttachment, caseNumber, queryClient, refetchMessages, t]);

  /* ── Loading state ─────────────────────────────── */

  const loading = detailLoading && messagesLoading;

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (detailError || !caseDetail) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {(detailError as Error)?.message ?? t("messages.caseDetail.notFound")}
        </AppText>
        <AppButton
          title={t("messages.caseDetail.goBack")}
          variant="outline"
          onPress={() => router.back()}
          style={{ marginTop: spacing[4] }}
        />
      </View>
    );
  }

  const status = STATUS_CONFIG[caseDetail.status] ?? STATUS_CONFIG.OPEN;
  const intentLabel = INTENT_LABELS[caseDetail.resolutionIntent] ?? caseDetail.resolutionIntent?.replace(/_/g, " ");
  const isClosed = ["CLOSED", "RESOLVED", "RESOLVED_GRACE"].includes(
    (caseDetail.status ?? "").toUpperCase(),
  );
  const sorted = [...caseMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
      keyboardVerticalOffset={0}
    >
      {/* ── Header ─────────────────────────────────── */}
      <View style={styles.header}>
        <BackButton />
        <View style={{ flex: 1, alignItems: "center" }}>
          <AppText variant="title" numberOfLines={1}>
            {t("messages.caseDetail.heading", { id: caseDetail.id })}
          </AppText>
          <View style={[styles.statusChip, { backgroundColor: status.bg }]}>
            <Icon name={status.icon} size={12} color={status.fg} />
            <AppText variant="caption" weight="bold" color={status.fg}>
              {status.label}
            </AppText>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ── Collapsible info strip ─────────────────── */}
      <Pressable
        style={styles.infoStripToggle}
        onPress={toggleInfoPanel}
      >
        <View style={styles.infoStripRow}>
          <View style={styles.infoChips}>
            <View style={[styles.miniChip, { backgroundColor: colors.gray100 }]}>
              <AppText variant="body" weight="semibold" color={colors.gray600}>
                {intentLabel}
              </AppText>
            </View>
            {caseDetail.order?.orderNumber && (
              <View style={[styles.miniChip, { backgroundColor: colors.gray100 }]}>
                <Icon name="receipt" size={14} color={colors.gray500} />
                <AppText variant="body" color={colors.gray500}>
                  #{caseDetail.order.orderNumber}
                </AppText>
              </View>
            )}
          </View>
          <Icon
            name={infoExpanded ? "expand-less" : "expand-more"}
            size={28}
            color={colors.muted}
          />
        </View>
      </Pressable>

      {infoExpanded && (
        <View style={styles.infoPanel}>
          {/* Items */}
          {caseDetail.items.length > 0 && (
            <View style={styles.infoPanelSection}>
              <AppText variant="label" style={styles.infoPanelLabel}>
                Items ({caseDetail.items.length})
              </AppText>
              {caseDetail.items.map((item, idx) => {
                const title =
                  item.orderItem?.productVariant?.product?.title ||
                  item.orderItem?.productVariant?.title ||
                  `Item #${item.orderItem?.publicId ?? "?"}`;
                return (
                  <View key={item.publicId ?? String(idx)} style={styles.infoItemRow}>
                    <AppText variant="bodySmall" numberOfLines={2} style={{ flex: 1 }}>
                      {title}
                    </AppText>
                    <View style={styles.qtyChip}>
                      <AppText variant="caption" weight="bold">×{item.quantity}</AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Refund */}
          {caseDetail.refund && (
            <View style={styles.infoPanelSection}>
              <AppText variant="label" style={styles.infoPanelLabel}>Refund</AppText>
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
              <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[1] }}>
                Initiated {formatDate(caseDetail.refund.createdAt)}
              </AppText>
            </View>
          )}

          {/* Resolution final */}
          {caseDetail.resolutionFinal && (
            <View style={styles.infoPanelSection}>
              <AppText variant="label" style={styles.infoPanelLabel}>Final Resolution</AppText>
              <AppText variant="body">
                {INTENT_LABELS[caseDetail.resolutionFinal] ?? caseDetail.resolutionFinal}
              </AppText>
            </View>
          )}

          {/* Note */}
          {caseDetail.note && (
            <View style={styles.infoPanelSection}>
              <AppText variant="label" style={styles.infoPanelLabel}>Note</AppText>
              <AppText variant="bodySmall" color={colors.muted} numberOfLines={4}>
                {caseDetail.note}
              </AppText>
            </View>
          )}

          {/* Opened date */}
          <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[1] }}>
            Opened {formatDate(caseDetail.createdAt)}
          </AppText>
        </View>
      )}

      {/* ── Messages thread ────────────────────────── */}
      <FlatList
        ref={listRef}
        data={sorted}
        keyExtractor={(m, i) => m.publicId || `msg-${i}`}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          messagesLoading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="small" color={colors.brandBlue} />
              <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[2] }}>
                Loading messages…
              </AppText>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Icon name="chat-bubble-outline" size={40} color={colors.gray300} />
              <AppText variant="bodySmall" color={colors.muted} style={{ marginTop: spacing[3], textAlign: "center" }}>
                No messages yet. Send a follow-up below.
              </AppText>
            </View>
          )
        }
        renderItem={({ item: m }) => {
          const isCustomer = m.senderType === "CUSTOMER";
          return (
            <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRight : styles.bubbleLeft]}>
              <View style={[styles.bubble, isCustomer ? styles.bubbleCustomer : styles.bubbleAdmin]}>
                {!isCustomer && (
                  <AppText
                    variant="caption"
                    weight="semibold"
                    color={colors.foreground}
                    style={styles.senderLabel}
                  >
                    {t("support.ticketDetail.supportLabel")}
                  </AppText>
                )}
                <AppText
                  variant="bodySmall"
                  color={isCustomer ? colors.white : colors.foreground}
                >
                  {m.body}
                </AppText>
                {m.attachmentFileName && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[1], marginTop: spacing[1] }}>
                    <Icon name="attach-file" size={12} color={isCustomer ? "rgba(255,255,255,0.7)" : colors.muted} />
                    <AppText variant="tiny" color={isCustomer ? "rgba(255,255,255,0.7)" : colors.muted}>
                      {m.attachmentFileName}
                    </AppText>
                  </View>
                )}
                <AppText
                  variant="tiny"
                  color={isCustomer ? "rgba(255,255,255,0.7)" : colors.mutedLight}
                  style={styles.time}
                >
                  {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </AppText>
              </View>
            </View>
          );
        }}
      />

      {/* ── Composer ───────────────────────────────── */}
      {!isClosed && (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
          {pendingAttachment && (
            <View style={styles.attachmentPreview}>
              <Icon name="attach-file" size={16} color={colors.brandBlue} />
              <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                {pendingAttachment.name}
              </AppText>
              <Pressable onPress={() => setPendingAttachment(null)} hitSlop={8}>
                <Icon name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          )}
          <View style={styles.composerRow}>
            <Pressable onPress={handlePickAttachment} disabled={uploading} style={{ padding: spacing[1] }} hitSlop={8}>
              <Icon name="attach-file" size={20} color={colors.muted} />
            </Pressable>
            <TextInput
              style={styles.composerInput}
              value={reply}
              onChangeText={setReply}
              placeholder={t("support.ticketDetail.placeholder")}
              placeholderTextColor={colors.mutedLight}
              multiline
              maxLength={2000}
            />
            <Pressable
              onPress={handleSend}
              disabled={(!reply.trim() && !pendingAttachment) || sending || uploading}
              style={[
                styles.sendBtn,
                ((!reply.trim() && !pendingAttachment) || sending || uploading) && { opacity: 0.4 },
              ]}
              hitSlop={8}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Icon name="send" size={22} color={colors.white} />
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Closed banner ──────────────────────────── */}
      {isClosed && (
        <View style={[styles.closedBanner, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
          <Icon name="lock" size={16} color={colors.gray500} />
          <AppText variant="caption" weight="semibold" color={colors.gray500}>
            This case has been {caseDetail.status === "CLOSED" ? "closed" : "resolved"}
          </AppText>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/* ── Styles ───────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
    marginTop: spacing[0.5],
  },

  /* ── Info strip ── */
  infoStripToggle: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  infoStripRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
  },
  infoChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[1.5],
    flex: 1,
  },
  miniChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },

  /* ── Info panel (expanded) ── */
  infoPanel: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[1],
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoPanelSection: {
    marginTop: spacing[3],
  },
  infoPanelLabel: {
    marginBottom: spacing[1.5],
  },
  infoItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginBottom: spacing[1.5],
  },
  qtyChip: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    marginLeft: spacing[2],
  },
  refundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refundBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },

  /* ── Messages ── */
  listContent: { paddingVertical: spacing[3], paddingHorizontal: spacing[3], flexGrow: 1 },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing[12] },
  bubbleRow: { marginBottom: spacing[2], maxWidth: "80%" },
  bubbleRight: { alignSelf: "flex-end" },
  bubbleLeft: { alignSelf: "flex-start" },
  bubble: { padding: spacing[3], borderRadius: borderRadius.xl },
  bubbleCustomer: { backgroundColor: colors.brandBlue, borderBottomRightRadius: borderRadius.sm },
  bubbleAdmin: { backgroundColor: colors.gray100, borderBottomLeftRadius: borderRadius.sm },
  senderLabel: { fontSize: 9, marginBottom: spacing[0.5], textTransform: "uppercase", letterSpacing: 0.3 },
  time: { marginTop: spacing[1], textAlign: "right" },

  /* ── Composer ── */
  composer: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  attachmentPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[2],
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing[2],
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: fontSize.base,
    color: colors.foreground,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[0.5],
  },

  /* ── Closed banner ── */
  closedBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.gray100,
  },
});
