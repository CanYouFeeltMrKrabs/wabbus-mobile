import React, { useMemo } from "react";
import { View, FlatList, Pressable, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { customerFetch } from "@/lib/api";
import { formatDate } from "@/lib/orderHelpers";
import { vendorLogoUrl } from "@/lib/image";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type Conversation = {
  publicId: string;
  vendor?: { name?: string; publicId?: string; logoUrl?: string | null } | null;
  order?: { publicId?: string; orderNumber?: string } | null;
  lastMessageAt?: string | null;
  lastMessageBody?: string | null;
  unreadCount?: number;
  status?: string;
};

export default function AllSellerConversationsScreen() {
  return (
    <RequireAuth>
      <AllConversationsContent />
    </RequireAuth>
  );
}

function AllConversationsContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: rawConversations, isLoading: loading } = useQuery({
    queryKey: queryKeys.messages.conversations.list(),
    queryFn: () => customerFetch<any>("/messages/conversations?limit=50"),
  });

  const conversations = useMemo(() => {
    const list: Conversation[] = Array.isArray(rawConversations?.data)
      ? rawConversations.data
      : Array.isArray(rawConversations)
        ? rawConversations
        : [];
    return list.sort((a, b) => (b.lastMessageAt || "").localeCompare(a.lastMessageAt || ""));
  }, [rawConversations]);

  const renderItem = ({ item }: { item: Conversation }) => {
    const vendorName = item.vendor?.name || t("support.sellerAll.sellerFallback");
    const logo = vendorLogoUrl(item.vendor?.logoUrl);
    const hasUnread = (item.unreadCount ?? 0) > 0;

    return (
      <Pressable style={st.convoCard} onPress={() => router.push(ROUTES.accountConversation(item.publicId) as any)}>
        {logo ? (
          <Image source={{ uri: logo }} style={st.avatar} resizeMode="cover" />
        ) : (
          <View style={[st.avatar, st.avatarPlaceholder]}>
            <Icon name="store" size={22} color={colors.gray400} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <AppText variant="label" weight={hasUnread ? "bold" : "semibold"}>
              {vendorName}
            </AppText>
            {item.lastMessageAt && (
              <AppText variant="tiny" color={colors.muted}>
                {formatDate(item.lastMessageAt)}
              </AppText>
            )}
          </View>
          {item.order?.orderNumber && (
            <AppText variant="tiny" color={colors.gray400}>
              {t("support.messageSeller.orderLabel", { number: item.order.orderNumber.slice(0, 8) })}
            </AppText>
          )}
          {item.lastMessageBody && (
            <AppText variant="caption" color={colors.muted} numberOfLines={1} style={{ marginTop: 2 }}>
              {item.lastMessageBody}
            </AppText>
          )}
        </View>
        {hasUnread && <View style={st.unreadDot} />}
      </Pressable>
    );
  };

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("support.sellerAll.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={st.center}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
        </View>
      ) : conversations.length === 0 ? (
        <View style={st.center}>
          <Icon name="chat-bubble-outline" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[2] }}>
            {t("support.sellerAll.noConversations")}
          </AppText>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.publicId}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing[4], paddingBottom: spacing[10] }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  convoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    marginBottom: spacing[2],
    ...shadows.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { backgroundColor: colors.gray100, alignItems: "center", justifyContent: "center" },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandBlue },
});
