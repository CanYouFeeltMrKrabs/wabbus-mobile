import React, { useEffect, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";

type OrderInfo = {
  publicId: string;
  items: Array<{
    publicId: string;
    title: string;
    vendorName?: string;
    vendorPublicId?: string;
  }>;
};

export default function MessageSellerScreen() {
  return (
    <RequireAuth>
      <MessageSellerContent />
    </RequireAuth>
  );
}

function MessageSellerContent() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    customerFetch<any>(`/orders/${orderId}`)
      .then((data) => setOrder(data.order ?? data))
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, [orderId]);

  const vendorGroups = (() => {
    if (!order?.items) return [];
    const map = new Map<string, { vendorPublicId: string; vendorName: string; items: string[] }>();
    for (const item of order.items) {
      const vid = (item as any).vendorPublicId || "unknown";
      const vname = (item as any).vendorName || "Seller";
      const existing = map.get(vid);
      if (existing) {
        existing.items.push(item.title);
      } else {
        map.set(vid, { vendorPublicId: vid, vendorName: vname, items: [item.title] });
      }
    }
    return Array.from(map.values());
  })();

  const handleSend = async () => {
    if (!message.trim() || !order) return;

    setSending(true);
    try {
      for (const group of vendorGroups) {
        const convoRes = await customerFetch<{ publicId?: string; conversationPublicId?: string; id?: string }>(
          "/messages/conversations",
          {
            method: "POST",
            body: JSON.stringify({
              orderPublicId: order.publicId,
              vendorPublicId: group.vendorPublicId,
            }),
          },
        );

        const convoId = convoRes.publicId || convoRes.conversationPublicId || convoRes.id;

        if (convoId) {
          await customerFetch(`/messages/conversations/${convoId}/messages`, {
            method: "POST",
            body: JSON.stringify({ body: message.trim() }),
          });
        }
      }
      setDone(true);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Unable to send message.");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>Order not found</AppText>
        <AppButton title="Go Back" variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="check-circle" size={48} color={colors.success} />
        <AppText variant="heading" style={{ marginTop: spacing[4] }}>
          Message Sent
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2], maxWidth: 280 }}>
          The seller will receive your message and reply in your conversations.
        </AppText>
        <AppButton
          title="View Messages"
          variant="primary"
          onPress={() => router.replace("/account/messages")}
          style={{ marginTop: spacing[6] }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Message Seller</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.orderCard}>
          <AppText variant="label">Order #{order.publicId.slice(0, 8)}</AppText>
          {vendorGroups.map((g) => (
            <View key={g.vendorPublicId} style={styles.vendorRow}>
              <Icon name="storefront" size={18} color={colors.brandBlue} />
              <AppText variant="body" color={colors.muted}>
                {g.vendorName} ({g.items.length} item{g.items.length > 1 ? "s" : ""})
              </AppText>
            </View>
          ))}
        </View>

        <AppText variant="subtitle" style={styles.sectionTitle}>
          Your Message
        </AppText>
        <TextInput
          style={styles.textArea}
          value={message}
          onChangeText={setMessage}
          placeholder="Describe your question or issue..."
          placeholderTextColor={colors.mutedLight}
          multiline
          maxLength={2000}
          textAlignVertical="top"
        />
        <AppText variant="caption" color={colors.muted} align="right">
          {message.length}/2000
        </AppText>

        <AppButton
          title={sending ? "Sending..." : "Send Message"}
          variant="primary"
          fullWidth
          size="lg"
          loading={sending}
          disabled={!message.trim()}
          onPress={handleSend}
          style={{ marginTop: spacing[4] }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  vendorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[2],
  },
  sectionTitle: { marginBottom: spacing[3] },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.white,
    minHeight: 150,
  },
});
