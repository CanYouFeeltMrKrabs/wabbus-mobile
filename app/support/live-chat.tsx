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

type ChatMessage = {
  id: string;
  body: string;
  senderType: "CUSTOMER" | "EMPLOYEE" | "SYSTEM";
  createdAt: string;
};

const baseUrl = API_BASE.replace("/api", "");

export default function LiveChatScreen() {
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
  const conversationIdRef = useRef<string | null>(null);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });
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

      socket.on("connect_error", () => {
        if (!cancelled) setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isLoggedIn, addMessage]);

  const handleSend = () => {
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
        body: `[Attachment: ${file.name}]`,
        senderType: "CUSTOMER",
        createdAt: new Date().toISOString(),
      });
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to upload attachment.");
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
          <AppText variant="label">Live Chat</AppText>
          <AppText variant="caption" color={connected ? colors.success : colors.muted}>
            {loading ? "Connecting..." : connected ? "Connected" : "Disconnected"}
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
            Connecting to support...
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
                  Start a conversation with our support team.
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

          {ended ? (
            <View style={[styles.endedBar, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
              <AppText variant="body" color={colors.muted} align="center">
                Chat ended. Thank you!
              </AppText>
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
                onChangeText={setText}
                placeholder="Type a message..."
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
});
