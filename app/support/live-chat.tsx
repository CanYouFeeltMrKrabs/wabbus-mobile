import React, { useEffect, useState, useRef, useCallback } from "react";
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, Socket } from "socket.io-client";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { customerFetch } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";
import { pickDocument, uploadFileAuth, uploadFileGuest } from "@/lib/fileUpload";
import { useTranslation } from "@/hooks/useT";

type ChatMessage = {
  id: string;
  body: string;
  senderType: "CUSTOMER" | "EMPLOYEE" | "SYSTEM";
  createdAt: string;
};

const baseUrl = API_BASE.replace("/api", "");

export default function LiveChatScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoggedIn } = useAuth();
  const listRef = useRef<FlatList>(null);
  const socketRef = useRef<Socket | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ended, setEnded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const conversationIdRef = useRef<string | null>(null);
  const agentTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingPingRef = useRef(0);
  const lastSendRef = useRef(0);
  const seenIdsRef = useRef(new Set<string>());

  const addMessage = useCallback((msg: ChatMessage) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!isLoggedIn) {
          await fetch(`${API_BASE}/employee-chat/guest/session`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
          });

          try {
            const res = await fetch(
              `${API_BASE}/employee-chat/guest/history?limit=50`,
              { credentials: "include" },
            );
            if (res.ok) {
              const data = await res.json();
              const msgs: ChatMessage[] = Array.isArray(data?.messages)
                ? data.messages : Array.isArray(data) ? data : [];
              if (!cancelled) {
                setMessages(msgs);
                if (data.conversationPublicId) conversationIdRef.current = data.conversationPublicId;
              }
            }
          } catch { /* no guest history */ }
        } else {
          try {
            const history = await customerFetch<any>("/employee-chat/customer/history?limit=50");
            const msgs: ChatMessage[] = Array.isArray(history?.messages)
              ? history.messages
              : Array.isArray(history)
                ? history
                : [];
            if (!cancelled) {
              setMessages(msgs);
              if (history?.conversationPublicId) conversationIdRef.current = history.conversationPublicId;
            }
          } catch { /* no history */ }
        }
      } catch {
        /* session creation may fail for guests without cookies */
      }

      if (cancelled) return;

      const socket = io(`${baseUrl}/support-chat`, {
        withCredentials: true,
        transports: ["websocket", "polling"],
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        if (cancelled) return;
        setConnected(true);
        setLoading(false);

        if (isLoggedIn) {
          socket.emit("chat:start");
        } else {
          socket.emit("guest:start_chat");
        }
      });

      socket.on("disconnect", () => {
        if (!cancelled) setConnected(false);
      });

      socket.on("conversation:message", (data: any) => {
        if (cancelled) return;
        if (data.conversationPublicId) conversationIdRef.current = data.conversationPublicId;
        addMessage({
          id: data.id || data.messageId || `${Date.now()}-${Math.random()}`,
          body: data.body || data.message || "",
          senderType: data.senderType || "EMPLOYEE",
          createdAt: data.createdAt || new Date().toISOString(),
        });
      });

      socket.on("conversation:started", (data: any) => {
        if (!cancelled && data?.conversationPublicId) {
          conversationIdRef.current = data.conversationPublicId;
        }
      });

      socket.on("conversation:ended", () => {
        if (!cancelled) setEnded(true);
      });

      socket.on("agent:typing", () => {
        if (cancelled) return;
        setIsAgentTyping(true);
        if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
        agentTypingTimeoutRef.current = setTimeout(() => setIsAgentTyping(false), 3000);
      });

      socket.on("reconnect_attempt", () => {
        if (!cancelled) setReconnecting(true);
      });

      socket.on("reconnect", () => {
        if (!cancelled) {
          setReconnecting(false);
          setConnected(true);
        }
      });

      socket.on("connect_error", () => {
        if (!cancelled) setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      if (agentTypingTimeoutRef.current) clearTimeout(agentTypingTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isLoggedIn, addMessage]);

  const handleSend = () => {
    const now = Date.now();
    if (now - lastSendRef.current < 500) return;
    lastSendRef.current = now;

    if (!text.trim() || !socketRef.current) return;

    const body = text.trim();
    setText("");

    const localMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      body,
      senderType: "CUSTOMER",
      createdAt: new Date().toISOString(),
    };
    addMessage(localMsg);

    if (isLoggedIn) {
      socketRef.current.emit("message:send", { body });
    } else {
      socketRef.current.emit("guest:message", { body });
    }
  };

  const handleEndChat = () => {
    if (!socketRef.current) return;
    if (isLoggedIn) {
      socketRef.current.emit("chat:close");
    } else {
      socketRef.current.emit("guest:close");
    }
    setEnded(true);
  };

  const handleAttachment = async () => {
    const file = await pickDocument();
    if (!file || !conversationIdRef.current) return;

    setUploading(true);
    try {
      const uploadFn = isLoggedIn ? uploadFileAuth : uploadFileGuest;
      await uploadFn({
        presignUrl: "/employee-chat/attachments/presign",
        confirmUrl: "/employee-chat/attachments/confirm",
        file,
        extraPresignBody: { conversationId: conversationIdRef.current },
        extraConfirmBody: { conversationId: conversationIdRef.current },
      });

      addMessage({
        id: `local-attach-${Date.now()}`,
        body: t("chat.attachmentLabel", { name: file.name }),
        senderType: "CUSTOMER",
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("chat.errorUpload"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
      keyboardVerticalOffset={0}
    >
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <AppText variant="label">{t("chat.heading")}</AppText>
          <AppText variant="caption" color={connected ? colors.success : colors.muted}>
            {loading ? t("chat.connecting") : reconnecting ? t("chat.reconnecting") : connected ? t("chat.connected") : t("chat.disconnected")}
          </AppText>
        </View>
        {!ended && connected && (
          <Pressable onPress={handleEndChat} hitSlop={8}>
            <Icon name="close-circle-outline" size={24} color={colors.muted} />
          </Pressable>
        )}
        {(ended || !connected) && <View style={{ width: 44 }} />}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
          <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[3] }}>
            {t("chat.connectingToSupport")}
          </AppText>
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <View style={styles.center}>
                <Icon name="chat" size={40} color={colors.gray300} />
                <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[2] }}>
                  {t("chat.emptyPrompt")}
                </AppText>
              </View>
            }
            renderItem={({ item: m }) => {
              if (m.senderType === "SYSTEM") {
                return (
                  <View style={styles.systemMsg}>
                    <AppText variant="caption" color={colors.muted} style={{ fontStyle: "italic", textAlign: "center" }}>
                      {m.body}
                    </AppText>
                  </View>
                );
              }

              const isCustomer = m.senderType === "CUSTOMER";
              return (
                <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRight : styles.bubbleLeft]}>
                  <View style={[styles.bubble, isCustomer ? styles.bubbleCustomer : styles.bubbleAgent]}>
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

          {isAgentTyping && !ended && (
            <View style={styles.typingRow}>
              <AppText variant="caption" color={colors.muted} style={{ fontStyle: "italic" }}>
                {t("chat.agentTyping")}
              </AppText>
            </View>
          )}

          {ended ? (
            <View style={[styles.endedBar, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
              {!ratingSubmitted ? (
                <View style={{ alignItems: "center" }}>
                  <AppText variant="body" color={colors.muted}>{t("chat.chatEnded")}</AppText>
                  <View style={{ flexDirection: "row", gap: spacing[2], marginTop: spacing[2] }}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Pressable
                        key={n}
                        onPress={() => {
                          setRating(n);
                          setRatingSubmitted(true);
                          if (conversationIdRef.current && socketRef.current) {
                            socketRef.current.emit("chat:rate", {
                              rating: n,
                              conversationPublicId: conversationIdRef.current,
                            });
                          }
                        }}
                      >
                        <Icon name={n <= (rating ?? 0) ? "star" : "star-outline"} size={32} color="#facc15" />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <AppText variant="body" color={colors.muted} align="center">
                  {t("chat.thanksFeedback")}
                </AppText>
              )}
            </View>
          ) : (
            <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
              <Pressable
                onPress={handleAttachment}
                disabled={uploading || !connected || !conversationIdRef.current}
                style={[{ padding: spacing[1], opacity: (uploading || !connected || !conversationIdRef.current) ? 0.4 : 1 }]}
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
                value={text}
                onChangeText={(val) => {
                  setText(val);
                  const now = Date.now();
                  if (now - lastTypingPingRef.current > 2000 && socketRef.current) {
                    socketRef.current.emit(isLoggedIn ? "customer:typing" : "guest:typing");
                    lastTypingPingRef.current = now;
                  }
                }}
                placeholder={t("chat.placeholder")}
                placeholderTextColor={colors.mutedLight}
                multiline
                maxLength={2000}
              />
              <Pressable
                onPress={handleSend}
                disabled={!text.trim() || !connected}
                style={[styles.sendBtn, (!text.trim() || !connected) && { opacity: 0.4 }]}
                hitSlop={8}
              >
                <Icon name="send" size={22} color={colors.white} />
              </Pressable>
            </View>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  listContent: { paddingVertical: spacing[3], paddingHorizontal: spacing[3], flexGrow: 1 },
  systemMsg: { alignItems: "center", marginVertical: spacing[2], paddingHorizontal: spacing[4] },
  bubbleRow: { marginBottom: spacing[2], maxWidth: "80%" },
  bubbleRight: { alignSelf: "flex-end" },
  bubbleLeft: { alignSelf: "flex-start" },
  bubble: { padding: spacing[3], borderRadius: borderRadius.xl },
  bubbleCustomer: { backgroundColor: colors.brandBlue, borderBottomRightRadius: borderRadius.sm },
  bubbleAgent: { backgroundColor: colors.gray100, borderBottomLeftRadius: borderRadius.sm },
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
  endedBar: {
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.white,
  },
  typingRow: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[1],
  },
});
