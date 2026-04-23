import React, { useState, useRef, useCallback } from "react";
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
import { invalidate, useTicketDetail } from "@/lib/queries";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";
import { pickDocument, uploadFileAuth, type PickedFile } from "@/lib/fileUpload";
import { ALLOWED_ATTACH_TYPES, MAX_ATTACH_SIZE } from "@/lib/constants";
import i18n from "@/i18n";

function getTicketStatusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: "support.ticketDetail.statusOpen",
    IN_PROGRESS: "support.ticketDetail.statusInProgress",
    CLOSED: "support.ticketDetail.statusClosed",
    ARCHIVED: "support.ticketDetail.statusArchived",
    RESOLVED: "support.ticketDetail.statusResolved",
  };
  const s = status ?? "";
  const key = map[s.toUpperCase()];
  return key ? i18n.t(key) : s.replace(/_/g, " ");
}

export default function TicketDetailScreen() {
  return (
    <RequireAuth>
      <TicketDetailContent />
    </RequireAuth>
  );
}

function TicketDetailContent() {
  const { t } = useTranslation();
  const { ticketId } = useLocalSearchParams<{ ticketId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const ticketQuery = useTicketDetail(ticketId, { refetchInterval: 30_000 });
  const ticket = ticketQuery.data;
  const loading = ticketQuery.isLoading;
  const refetch = ticketQuery.refetch;

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleAttach = useCallback(async () => {
    try {
      const file = await pickDocument({ type: ALLOWED_ATTACH_TYPES });
      if (!file) return;
      if (!ALLOWED_ATTACH_TYPES.includes(file.mimeType)) {
        Alert.alert(t("common.error"), "Only JPEG, PNG, and WebP images are supported.");
        return;
      }
      if (file.size > MAX_ATTACH_SIZE) {
        Alert.alert(t("common.error"), "File is too large. Max 10 MB.");
        return;
      }
      setPendingAttachment(file);
    } catch {
      // user cancelled
    }
  }, [t]);

  const handleSend = async () => {
    if ((!reply.trim() && !pendingAttachment) || !ticketId) return;
    setSending(true);
    try {
      // Upload attachment first if present
      let attachment: { key: string; fileName: string; mimeType: string; size: number } | undefined;
      if (pendingAttachment) {
        setUploading(true);
        try {
          const uploaded = await uploadFileAuth({
            presignUrl: "/uploads/customer-chat-attachment",
            confirmUrl: "/uploads/chat-attachment/confirm",
            file: pendingAttachment,
            extraPresignBody: { context: "ticket", entityId: ticketId },
          });
          attachment = {
            key: uploaded.key,
            fileName: pendingAttachment.name,
            mimeType: pendingAttachment.mimeType,
            size: pendingAttachment.size,
          };
        } finally {
          setUploading(false);
        }
      }

      // Send image message first (if attachment), then text message
      if (attachment) {
        await customerFetch(`/support/tickets/${ticketId}/messages`, {
          method: "POST",
          body: JSON.stringify({
            body: "(attachment)",
            attachment,
          }),
        });
      }
      if (reply.trim()) {
        await customerFetch(`/support/tickets/${ticketId}/messages`, {
          method: "POST",
          body: JSON.stringify({ body: reply.trim() }),
        });
      }

      setReply("");
      setPendingAttachment(null);
      await refetch();
      void invalidate.messages.tickets.list();
      void invalidate.messages.unread();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("support.ticketDetail.errorSend"));
    } finally {
      setSending(false);
    }
  };

  const handleClose = async () => {
    if (!ticketId) return;
    try {
      await customerFetch(`/support/tickets/${ticketId}/close`, { method: "POST" });
      await refetch();
      void invalidate.messages.tickets.list();
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("support.ticketDetail.errorClose"));
    }
  };

  const handleArchiveToggle = async () => {
    if (!ticketId || !ticket) return;
    const isArchived = !!ticket.archivedAt;
    const action = isArchived ? "unarchive" : "archive";
    try {
      await customerFetch(`/support/tickets/${ticketId}/${action}`, { method: "POST" });
      await refetch();
      void invalidate.messages.tickets.list();
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("support.ticketDetail.errorArchive", { action }));
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>{t("support.ticketDetail.notFound")}</AppText>
        <AppButton title={t("support.ticketDetail.goBack")} variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const messages = ticket.messages || [];
  const upperStatus = (ticket.status ?? "").toUpperCase();
  const isClosed = upperStatus === "CLOSED";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <BackButton />
        <View style={{ flex: 1, alignItems: "center" }}>
          <AppText variant="title" numberOfLines={1}>
            {ticket.ticketNumber ? `Ticket ${ticket.ticketNumber}` : ticket.subject || ticket.category || t("support.ticketDetail.ticketFallback")}
          </AppText>
          <AppText variant="caption" color={isClosed ? colors.muted : colors.success}>
            {getTicketStatusLabel(ticket.status)}
          </AppText>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {!isClosed && (
        <View style={styles.ticketActions}>
          <AppButton
            title={ticket.archivedAt ? t("support.ticketDetail.unarchive") : t("support.ticketDetail.archive")}
            variant="secondary"
            size="md"
            icon={ticket.archivedAt ? "unarchive" : "archive"}
            onPress={handleArchiveToggle}
            style={{ flex: 1 }}
          />
          <AppButton
            title={t("support.ticketDetail.closeTicket")}
            variant="danger"
            size="md"
            icon="close"
            onPress={handleClose}
            style={{ flex: 1 }}
          />
        </View>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m, i) => m.publicId || `msg-${i}`}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item: m }) => {
          if (m.eventType) {
            return (
              <View style={styles.systemEvent}>
                <AppText variant="caption" color={colors.muted} style={{ fontStyle: "italic", textAlign: "center" }}>
                  {m.body}
                </AppText>
              </View>
            );
          }

          const isCustomer = m.senderType === "CUSTOMER";
          const isAttachmentOnly = m.body === "(attachment)" && !!m.attachmentFileName;
          return (
            <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRight : styles.bubbleLeft]}>
              <View style={[styles.bubble, isCustomer ? styles.bubbleCustomer : styles.bubbleAdmin]}>
                {!isCustomer && (
                  <AppText variant="caption" weight="semibold" color={colors.foreground} style={styles.senderLabel}>
                    {t("support.ticketDetail.supportLabel")}
                  </AppText>
                )}
                {!isAttachmentOnly && (
                  <AppText variant="bodySmall" color={isCustomer ? colors.white : colors.foreground}>
                    {m.body}
                  </AppText>
                )}
                {m.attachmentFileName && (
                  <View style={styles.attachmentIndicator}>
                    <Icon name="attach-file" size={12} color={isCustomer ? "rgba(255,255,255,0.7)" : colors.muted} />
                    <AppText variant="tiny" color={isCustomer ? "rgba(255,255,255,0.7)" : colors.muted} numberOfLines={1} style={{ flex: 1 }}>
                      {m.attachmentFileName}
                    </AppText>
                  </View>
                )}
                <AppText variant="tiny" color={isCustomer ? "rgba(255,255,255,0.7)" : colors.mutedLight} style={styles.time}>
                  {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </AppText>
              </View>
            </View>
          );
        }}
      />

      {!isClosed && (
        <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
          {pendingAttachment && (
            <View style={styles.attachmentChip}>
              <Icon name="attach-file" size={16} color={colors.brandBlue} />
              <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>{pendingAttachment.name}</AppText>
              <Pressable onPress={() => setPendingAttachment(null)} hitSlop={8}>
                <Icon name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          )}
          <View style={styles.composerRow}>
            <Pressable onPress={handleAttach} disabled={uploading} style={{ padding: spacing[1] }} hitSlop={8}>
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
              style={[styles.sendBtn, ((!reply.trim() && !pendingAttachment) || sending || uploading) && { opacity: 0.4 }]}
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
    </KeyboardAvoidingView>
  );
}

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
  ticketActions: {
    flexDirection: "row",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  listContent: { paddingVertical: spacing[3], paddingHorizontal: spacing[3] },
  systemEvent: { alignItems: "center", marginVertical: spacing[2], paddingHorizontal: spacing[4] },
  bubbleRow: { marginBottom: spacing[2], maxWidth: "80%" },
  bubbleRight: { alignSelf: "flex-end" },
  bubbleLeft: { alignSelf: "flex-start" },
  bubble: { padding: spacing[3], borderRadius: borderRadius.xl },
  bubbleCustomer: { backgroundColor: colors.brandBlue, borderBottomRightRadius: borderRadius.sm },
  bubbleAdmin: { backgroundColor: colors.gray100, borderBottomLeftRadius: borderRadius.sm },
  senderLabel: { fontSize: 9, marginBottom: spacing[0.5], textTransform: "uppercase", letterSpacing: 0.3 },
  time: { marginTop: spacing[1], textAlign: "right" },
  composer: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
  },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[2],
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing[2],
  },
  attachmentIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    marginTop: spacing[1],
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
});
