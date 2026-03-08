import React, { useEffect, useState, useCallback } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type Conversation = {
  id: number;
  publicId: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  unreadCount: number;
};

export default function MessagesScreen() {
  return <RequireAuth><MessagesContent /></RequireAuth>;
}

function MessagesContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadConversations = useCallback(async (nextCursor?: string | null) => {
    const isLoadMore = !!nextCursor;
    if (isLoadMore) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (nextCursor) params.set("cursor", nextCursor);
      const data = await customerFetch<any>(`/messages/conversations?${params}`);
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setConversations((prev) => isLoadMore ? [...prev, ...list] : list);
      setCursor(data?.nextCursor ?? null);
      setHasMore(!!data?.hasMore);
    } catch {
      if (!isLoadMore) setConversations([]);
    }
    if (isLoadMore) setLoadingMore(false); else setLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Messages</AppText>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="chat-bubble-outline" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>No messages</AppText>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.publicId}
          contentContainerStyle={styles.list}
          onEndReached={() => { if (hasMore && !loadingMore) loadConversations(cursor); }}
          onEndReachedThreshold={0.3}
          ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.brandBlue} style={{ marginVertical: spacing[4] }} /> : null}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
              <View style={styles.cardRow}>
                <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>{item.subject}</AppText>
                {item.unreadCount > 0 && (
                  <View style={styles.unread}>
                    <AppText variant="tiny" color={colors.white} weight="bold">{item.unreadCount}</AppText>
                  </View>
                )}
              </View>
              <AppText variant="caption">{new Date(item.lastMessageAt).toLocaleDateString()}</AppText>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  card: { backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[3], ...shadows.sm },
  cardRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing[1] },
  unread: { backgroundColor: colors.brandOrange, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing[1.5] },
});
