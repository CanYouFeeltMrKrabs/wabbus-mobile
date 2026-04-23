import React, { useState, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import TicketThread from "@/components/TicketThread";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/orderHelpers";
import { invalidate, useCaseDetail, useCaseMessages } from "@/lib/queries";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import { pickDocument, uploadFileAuth, type PickedFile } from "@/lib/fileUpload";

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

type Props = {
  caseNumber: string;
  onClose: () => void;
  onBack?: () => void;
};

export default function CaseDetailPanel({ caseNumber, onClose, onBack }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const caseDetailQuery = useCaseDetail(caseNumber);
  const detail = caseDetailQuery.data ?? null;
  const loading = caseDetailQuery.isLoading;
  const detailError = caseDetailQuery.error;
  const refetchDetail = caseDetailQuery.refetch;

  const error = detailError ? (detailError.message ?? "Failed to load case") : null;

  const caseMessagesQuery = useCaseMessages(caseNumber, { refetchInterval: 30_000 });
  const caseMessages = caseMessagesQuery.data ?? [];

  const [followUpText, setFollowUpText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handlePickAttachment = useCallback(async () => {
    const file = await pickDocument();
    if (file) setPendingAttachment(file);
  }, []);

  const handleFollowUp = useCallback(async () => {
    if ((!followUpText.trim() && !pendingAttachment) || !caseNumber) return;
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

      await customerFetch(`/cases/by-id/${caseNumber}/follow-up`, {
        method: "POST",
        body: JSON.stringify({
          note: followUpText.trim() || (pendingAttachment ? "(attachment)" : ""),
          ...attachmentFields,
        }),
      });
      setFollowUpText("");
      setPendingAttachment(null);
      void invalidate.messages.cases.messages(caseNumber);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to send follow-up.");
    } finally {
      setSending(false);
    }
  }, [followUpText, pendingAttachment, caseNumber]);

  const headerContent = (
    <View style={[styles.header, { paddingTop: insets.top + spacing[2] }]}>
      <View style={styles.headerLeft}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={8} style={styles.backBtn}>
            <Icon name="arrow-back" size={20} color={colors.foreground} />
          </Pressable>
        )}
        <AppText variant="subtitle" numberOfLines={1}>
          Case {caseNumber}
        </AppText>
      </View>
      <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
        <Icon name="close" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        {headerContent}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View style={styles.container}>
        {headerContent}
        <View style={styles.centered}>
          <Icon name="error-outline" size={48} color={colors.gray300} />
          <AppText variant="bodySmall" color={colors.muted} style={{ marginTop: spacing[3] }}>
            {error ?? "Case not found"}
          </AppText>
          <AppButton
            title="Retry"
            variant="outline"
            size="sm"
            onPress={() => refetchDetail()}
            style={{ marginTop: spacing[3] }}
          />
        </View>
      </View>
    );
  }

  const status = STATUS_CONFIG[detail.status] ?? STATUS_CONFIG.OPEN;
  const intentLabel =
    INTENT_LABELS[detail.resolutionIntent] ??
    detail.resolutionIntent.replace(/_/g, " ");

  return (
    <View style={styles.container}>
      {headerContent}

      {/* ── Badges ── */}
      <View style={styles.badgeStrip}>
        <View style={[styles.chip, { backgroundColor: status.bg }]}>
          <Icon name={status.icon} size={12} color={status.fg} />
          <AppText variant="caption" weight="bold" color={status.fg}>
            {status.label}
          </AppText>
        </View>
        <View style={[styles.chip, { backgroundColor: colors.gray100 }]}>
          <AppText variant="caption" weight="semibold" color={colors.gray600}>
            {intentLabel}
          </AppText>
        </View>
        <View style={[styles.chip, { backgroundColor: colors.gray100 }]}>
          <Icon name="calendar-today" size={10} color={colors.gray500} />
          <AppText variant="caption" color={colors.gray500}>
            {formatDate(detail.createdAt)}
          </AppText>
        </View>
      </View>

      {/* ── Scrollable body ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollInner, { paddingBottom: insets.bottom + spacing[6] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick info */}
        <View style={styles.infoCard}>
          {detail.order?.orderNumber && (
            <View style={styles.infoRow}>
              <Icon name="receipt" size={14} color={colors.muted} />
              <AppText variant="bodySmall">
                Order #{detail.order.orderNumber}
              </AppText>
            </View>
          )}
          {detail.resolutionFinal && (
            <View style={styles.infoRow}>
              <Icon name="check" size={14} color={colors.success} />
              <AppText variant="bodySmall">
                Final:{" "}
                {INTENT_LABELS[detail.resolutionFinal] ??
                  detail.resolutionFinal}
              </AppText>
            </View>
          )}
          {detail.note && (
            <View style={styles.infoRow}>
              <Icon name="notes" size={14} color={colors.muted} />
              <AppText variant="bodySmall" numberOfLines={3}>
                {detail.note}
              </AppText>
            </View>
          )}
        </View>

        {/* Items */}
        {detail.items.length > 0 && (
          <View style={styles.section}>
            <AppText variant="label" style={styles.sectionLabel}>
              Items ({detail.items.length})
            </AppText>
            {detail.items.map((item, idx) => {
              const title =
                item.orderItem?.productVariant?.product?.title ||
                item.orderItem?.productVariant?.title ||
                `Item #${item.orderItem?.publicId ?? "?"}`;
              return (
                <View key={item.publicId ?? String(idx)} style={styles.itemRow}>
                  <View style={styles.itemInfo}>
                    <AppText variant="bodySmall" numberOfLines={2}>
                      {title}
                    </AppText>
                    {item.orderItem?.productVariant?.sku && (
                      <AppText variant="caption">
                        SKU: {item.orderItem.productVariant.sku}
                      </AppText>
                    )}
                  </View>
                  <View style={styles.qtyChip}>
                    <AppText variant="caption" weight="bold">
                      ×{item.quantity}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Refund */}
        {detail.refund && (
          <View style={styles.section}>
            <AppText variant="label" style={styles.sectionLabel}>
              Refund
            </AppText>
            <View style={styles.refundCard}>
              <View style={styles.refundTop}>
                <AppText variant="subtitle">
                  {formatMoney(detail.refund.amountCents)}
                </AppText>
                <View
                  style={[
                    styles.refundBadge,
                    { backgroundColor: refundStatusColor(detail.refund.status).bg },
                  ]}
                >
                  <AppText
                    variant="caption"
                    weight="semibold"
                    color={refundStatusColor(detail.refund.status).fg}
                  >
                    {refundStatusLabel(detail.refund.status)}
                  </AppText>
                </View>
              </View>
              <AppText variant="caption" style={{ marginTop: spacing[1] }}>
                Initiated{" "}
                {formatDate(detail.refund.createdAt)}
              </AppText>
            </View>
          </View>
        )}

        {/* Support thread (linked ticket) */}
        {detail.linkedTicketPublicId && (
          <View style={styles.section}>
            <AppText variant="label" style={styles.sectionLabel}>
              Support Thread
            </AppText>
            <View style={styles.threadBox}>
              <TicketThread ticketPublicId={detail.linkedTicketPublicId} />
            </View>
          </View>
        )}

        {/* Case messages */}
        {caseMessages.length > 0 && (
          <View style={styles.section}>
            <AppText variant="label" style={styles.sectionLabel}>
              Messages ({caseMessages.length})
            </AppText>
            {caseMessages.map((m, idx) => {
              const isCustomer = m.senderType === "CUSTOMER";
              return (
                <View key={m.publicId ?? `cm-${idx}`} style={[styles.msgBubbleRow, isCustomer ? styles.msgRight : styles.msgLeft]}>
                  <View style={[styles.msgBubble, isCustomer ? styles.msgBubbleCustomer : styles.msgBubbleAgent]}>
                    {!isCustomer && (
                      <AppText variant="caption" weight="semibold" color={colors.foreground} style={{ fontSize: 9, textTransform: "uppercase", marginBottom: spacing[0.5] }}>
                        Support
                      </AppText>
                    )}
                    <AppText variant="bodySmall" color={isCustomer ? colors.white : colors.foreground}>
                      {m.body}
                    </AppText>
                    {m.attachmentFileName && (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[1], marginTop: spacing[1] }}>
                        <Icon name="attach-file" size={12} color={isCustomer ? "rgba(255,255,255,0.7)" : colors.muted} />
                        <AppText variant="tiny" color={isCustomer ? "rgba(255,255,255,0.7)" : colors.muted}>{m.attachmentFileName}</AppText>
                      </View>
                    )}
                    <AppText variant="tiny" color={isCustomer ? "rgba(255,255,255,0.7)" : colors.mutedLight} style={{ marginTop: spacing[1], textAlign: "right" }}>
                      {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </AppText>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Follow-up composer */}
        {!["CLOSED", "RESOLVED"].includes(detail.status.toUpperCase()) && (
          <View style={styles.composerSection}>
            <AppText variant="label" style={styles.sectionLabel}>
              {caseMessages.length > 0 ? "Reply" : "Send a Follow-up"}
            </AppText>
            {pendingAttachment && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: spacing[2], backgroundColor: colors.gray100, borderRadius: borderRadius.lg, padding: spacing[2] }}>
                <Icon name="attach-file" size={16} color={colors.brandBlue} />
                <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>{pendingAttachment.name}</AppText>
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
                value={followUpText}
                onChangeText={setFollowUpText}
                placeholder="Type a message..."
                placeholderTextColor={colors.mutedLight}
                multiline
                maxLength={2000}
              />
              <Pressable
                onPress={handleFollowUp}
                disabled={(!followUpText.trim() && !pendingAttachment) || sending || uploading}
                style={[styles.sendBtn, ((!followUpText.trim() && !pendingAttachment) || sending || uploading) && { opacity: 0.4 }]}
                hitSlop={8}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Icon name="send" size={20} color={colors.white} />
                )}
              </Pressable>
            </View>
          </View>
        )}

        {/* Full-page link */}
        <Pressable
          style={styles.fullDetailsRow}
          onPress={() => {
            onClose();
            setTimeout(() => {
              router.push(ROUTES.accountCase(caseNumber) as any);
            }, 300);
          }}
        >
          <AppText variant="label" color={colors.brandBlue}>
            View Full Details
          </AppText>
          <Icon name="open-in-new" size={14} color={colors.brandBlue} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },

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
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing[2], flex: 1 },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray100,
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

  /* ── Badge strip ── */
  badgeStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
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

  /* ── Info card ── */
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    gap: spacing[2],
    ...shadows.sm,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },

  /* ── Sections ── */
  section: { marginTop: spacing[4] },
  sectionLabel: { marginBottom: spacing[2] },

  /* ── Items ── */
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginBottom: spacing[1.5],
    ...shadows.sm,
  },
  itemInfo: { flex: 1, gap: spacing[0.5] },
  qtyChip: {
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    marginLeft: spacing[2],
  },

  /* ── Refund ── */
  refundCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    ...shadows.sm,
  },
  refundTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  refundBadge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },

  /* ── Thread ── */
  threadBox: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    minHeight: 120,
    ...shadows.sm,
  },

  /* ── Case messages ── */
  msgBubbleRow: { marginBottom: spacing[2], maxWidth: "80%" },
  msgRight: { alignSelf: "flex-end" },
  msgLeft: { alignSelf: "flex-start" },
  msgBubble: { padding: spacing[3], borderRadius: borderRadius.xl },
  msgBubbleCustomer: { backgroundColor: colors.brandBlue, borderBottomRightRadius: borderRadius.sm },
  msgBubbleAgent: { backgroundColor: colors.gray100, borderBottomLeftRadius: borderRadius.sm },

  /* ── Composer ── */
  composerSection: { marginTop: spacing[4] },
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
    backgroundColor: colors.white,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[0.5],
  },

  /* ── Full details link ── */
  fullDetailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1.5],
    marginTop: spacing[5],
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
