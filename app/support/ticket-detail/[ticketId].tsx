import React, { useState, useRef } from "react";
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
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { customerFetch } from "@/lib/api";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";
import i18n from "@/i18n";

type Message = {
  publicId?: string;
  body: string;
  senderType: string;
  eventType?: string | null;
  createdAt: string;
};

type Ticket = {
  publicId: string;
  subject?: string;
  category?: string;
  status: string;
  messages: Message[];
};

function getTicketStatusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: "support.ticketDetail.statusOpen",
    IN_PROGRESS: "support.ticketDetail.statusInProgress",
    CLOSED: "support.ticketDetail.statusClosed",
    ARCHIVED: "support.ticketDetail.statusArchived",
    RESOLVED: "support.ticketDetail.statusResolved",
  };
  const key = map[status.toUpperCase()];
  return key ? i18n.t(key) : status.replace(/_/g, " ");
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
  const queryClient = useQueryClient();

  const { data: ticket, isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.messages.tickets.detail(ticketId!),
    queryFn: () => customerFetch<Ticket>(`/support/tickets/${ticketId}`),
    enabled: !!ticketId,
    refetchInterval: 30_000,
  });

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!reply.trim() || !ticketId) return;
    setSending(true);
    try {
      await customerFetch(`/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      await refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.tickets.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.unread() });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.tickets.list() });
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("support.ticketDetail.errorClose"));
    }
  };

  const handleArchiveToggle = async () => {
    if (!ticketId || !ticket) return;
    const isArchived = ticket.status.toUpperCase() === "ARCHIVED";
    const action = isArchived ? "unarchive" : "archive";
    try {
      await customerFetch(`/support/tickets/${ticketId}/${action}`, { method: "POST" });
      await refetch();
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.tickets.list() });
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
  const upperStatus = ticket.status.toUpperCase();
  const isClosed = upperStatus === "CLOSED";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <AppText variant="label" numberOfLines={1}>
            {ticket.subject || ticket.category || t("support.ticketDetail.ticketFallback")}
          </AppText>
          <AppText variant="caption" color={isClosed ? colors.muted : colors.success}>
            {getTicketStatusLabel(ticket.status)}
          </AppText>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
          {!isClosed && (
            <Pressable onPress={handleArchiveToggle} hitSlop={8}>
              <Icon name={upperStatus === "ARCHIVED" ? "unarchive" : "archive"} size={22} color={colors.muted} />
            </Pressable>
          )}
          {!isClosed && (
            <Pressable onPress={handleClose} hitSlop={8}>
              <Icon name="close-circle-outline" size={24} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

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
          return (
            <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRight : styles.bubbleLeft]}>
              <View style={[styles.bubble, isCustomer ? styles.bubbleCustomer : styles.bubbleAdmin]}>
                <AppText variant="caption" weight="semibold" color={isCustomer ? colors.white : colors.foreground} style={styles.senderLabel}>
                  {isCustomer ? t("support.ticketDetail.you") : t("support.ticketDetail.supportLabel")}
                </AppText>
                <AppText variant="bodySmall" color={isCustomer ? colors.white : colors.foreground}>
                  {m.body}
                </AppText>
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
            disabled={!reply.trim() || sending}
            style={[styles.sendBtn, (!reply.trim() || sending) && { opacity: 0.4 }]}
            hitSlop={8}
          >
            <Icon name="send" size={22} color={colors.white} />
          </Pressable>
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
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.white,
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
});
