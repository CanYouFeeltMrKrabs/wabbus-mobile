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
  Linking,
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
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";
import { pickDocument, uploadFileAuth } from "@/lib/fileUpload";

type ConvoMessage = {
  publicId?: string;
  body: string;
  senderType: string;
  createdAt: string;
  attachment?: { url?: string; key?: string } | null;
};

type ConversationDetail = {
  publicId: string;
  subject: string;
  status: string;
  messages: ConvoMessage[];
};

export default function ConversationScreen() {
  return (
    <RequireAuth>
      <ConversationContent />
    </RequireAuth>
  );
}

function ConversationContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();

  const { data: convo = null, isLoading: loading, refetch: refetchConvo } = useQuery({
    queryKey: queryKeys.messages.conversations.detail(id!),
    queryFn: async () => {
      const detail = await customerFetch<ConversationDetail>(`/messages/conversations/${id}`);
      if (!detail.messages) {
        const msgs = await customerFetch<{ data?: ConvoMessage[]; messages?: ConvoMessage[] }>(
          `/messages/conversations/${id}/messages`,
        );
        detail.messages = msgs.data || msgs.messages || [];
      }
      return detail;
    },
    enabled: !!id,
    refetchInterval: 30_000,
  });

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleSend = async () => {
    if (!reply.trim() || !id) return;
    setSending(true);
    try {
      await customerFetch(`/messages/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      });
      setReply("");
      await refetchConvo();
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.conversations.list() });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.unread() });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("messages.conversation.errorSend"));
    } finally {
      setSending(false);
    }
  };

  const isArchived = convo?.status?.toUpperCase() === "ARCHIVED";

  const handleArchiveToggle = async () => {
    if (!id) return;
    const action = isArchived ? "unarchive" : "archive";
    try {
      await customerFetch(`/messages/conversations/${id}/${action}`, { method: "PATCH" });
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.conversations.list() });
      if (isArchived) {
        await refetchConvo();
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("messages.conversation.errorArchive", { action }));
    }
  };

  const handleAttachment = async () => {
    if (!id) return;
    const file = await pickDocument();
    if (!file) return;

    setUploading(true);
    try {
      await uploadFileAuth({
        presignUrl: "/uploads/customer-chat-attachment",
        confirmUrl: "/uploads/chat-attachment/confirm",
        file,
        extraPresignBody: { context: "convo", entityId: id },
      });
      await refetchConvo();
      queryClient.invalidateQueries({ queryKey: queryKeys.messages.conversations.list() });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 200);
    } catch {
      Alert.alert(t("common.error"), t("messages.conversation.errorUpload"));
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (!convo) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>{t("messages.conversation.notFound")}</AppText>
        <AppButton title={t("messages.conversation.goBack")} variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const messages = convo.messages || [];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <BackButton />
        <View style={{ flex: 1, alignItems: "center" }}>
          <AppText variant="label" numberOfLines={1}>{convo.subject}</AppText>
          <AppText variant="caption" color={colors.muted}>{convo.status.replace(/_/g, " ")}</AppText>
        </View>
        <Pressable onPress={handleArchiveToggle} hitSlop={8}>
          <Icon name={isArchived ? "unarchive" : "archive"} size={22} color={colors.muted} />
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m, i) => m.publicId || `msg-${i}`}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item: m }) => {
          const isCustomer = m.senderType === "CUSTOMER";
          const attachUrl = m.attachment?.url || m.attachment?.key;
          return (
            <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRight : styles.bubbleLeft]}>
              <View style={[styles.bubble, isCustomer ? styles.bubbleCustomer : styles.bubbleSeller]}>
                <AppText variant="caption" weight="semibold" color={isCustomer ? colors.white : colors.foreground} style={styles.senderLabel}>
                  {isCustomer ? t("messages.conversation.you") : t("messages.conversation.seller")}
                </AppText>
                {!!m.body && (
                  <AppText variant="bodySmall" color={isCustomer ? colors.white : colors.foreground}>
                    {m.body}
                  </AppText>
                )}
                {!!attachUrl && (
                  <Pressable onPress={() => Linking.openURL(attachUrl)} style={styles.attachmentLink}>
                    <Icon name="attach-file" size={14} color={isCustomer ? colors.white : colors.brandBlue} />
                    <AppText variant="caption" color={isCustomer ? colors.white : colors.brandBlue} weight="semibold">
                      {t("messages.conversation.attachment")}
                    </AppText>
                  </Pressable>
                )}
                <AppText variant="tiny" color={isCustomer ? "rgba(255,255,255,0.7)" : colors.mutedLight} style={styles.time}>
                  {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </AppText>
              </View>
            </View>
          );
        }}
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
        <Pressable
          onPress={handleAttachment}
          disabled={uploading}
          style={{ padding: spacing[1], opacity: uploading ? 0.4 : 1 }}
          hitSlop={8}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.brandBlue} />
          ) : (
            <Icon name="attach-file" size={22} color={colors.muted} />
          )}
        </Pressable>
        <TextInput
          style={styles.composerInput}
          value={reply}
          onChangeText={setReply}
          placeholder={t("messages.conversation.placeholder")}
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
  bubbleRow: { marginBottom: spacing[2], maxWidth: "80%" },
  bubbleRight: { alignSelf: "flex-end" },
  bubbleLeft: { alignSelf: "flex-start" },
  bubble: { padding: spacing[3], borderRadius: borderRadius.xl },
  bubbleCustomer: { backgroundColor: colors.brandBlue, borderBottomRightRadius: borderRadius.sm },
  bubbleSeller: { backgroundColor: colors.gray100, borderBottomLeftRadius: borderRadius.sm },
  senderLabel: { fontSize: 9, marginBottom: spacing[0.5], textTransform: "uppercase", letterSpacing: 0.3 },
  time: { marginTop: spacing[1], textAlign: "right" },
  attachmentLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing[1] },
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
