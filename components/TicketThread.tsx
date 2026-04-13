import React, { useEffect, useState, useRef } from "react";
import { View, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import AppText from "@/components/ui/AppText";
import { customerFetch } from "@/lib/api";
import { colors, spacing, borderRadius, fontSize, fontWeight } from "@/lib/theme";
import type { SupportTicket, SupportTicketMessage } from "@/lib/messages-types";
import { formatDateLabel } from "@/lib/orderHelpers";

type Props = {
  ticketPublicId: string;
};

function toDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type ListItem =
  | { type: "date"; key: string; label: string }
  | { type: "message"; key: string; message: SupportTicketMessage };

function buildListItems(messages: SupportTicketMessage[]): ListItem[] {
  const items: ListItem[] = [];
  let lastDateKey = "";
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const dk = toDateKey(m.createdAt);
    if (dk !== lastDateKey) {
      items.push({ type: "date", key: `date-${dk}-${i}`, label: formatDateLabel(m.createdAt) });
      lastDateKey = dk;
    }
    items.push({ type: "message", key: m.publicId ?? `msg-${i}`, message: m });
  }
  return items;
}

export default function TicketThread({ ticketPublicId }: Props) {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!ticketPublicId) return;
    setLoading(true);
    setError(null);
    customerFetch<any>(`/support/tickets/${ticketPublicId}`)
      .then((res) => setTicket((res?.data ?? res?.ticket ?? res) as SupportTicket))
      .catch((e) => setError(e?.message ?? "Failed to load messages"))
      .finally(() => setLoading(false));
  }, [ticketPublicId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={colors.brandBlue} />
        <AppText variant="caption" style={{ marginTop: spacing[2] }}>Loading messages…</AppText>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <AppText variant="caption" color={colors.error}>{error}</AppText>
      </View>
    );
  }

  const messages = ticket?.messages ?? [];
  if (messages.length === 0) {
    return (
      <View style={styles.centered}>
        <AppText variant="caption" color={colors.muted}>No messages yet.</AppText>
      </View>
    );
  }

  const listItems = buildListItems(messages);

  return (
    <FlatList
      ref={listRef}
      data={listItems}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
      renderItem={({ item }) => {
        if (item.type === "date") {
          return (
            <View style={styles.dateSeparator}>
              <View style={styles.dateLine} />
              <AppText variant="caption" weight="bold" style={styles.dateLabel}>
                {item.label}
              </AppText>
              <View style={styles.dateLine} />
            </View>
          );
        }

        const m = item.message;

        if (m.eventType) {
          return (
            <View style={styles.systemEvent}>
              <AppText
                variant="caption"
                color={colors.muted}
                style={styles.systemEventText}
              >
                {m.body}
              </AppText>
            </View>
          );
        }

        const isCustomer = m.senderType === "CUSTOMER";

        return (
          <View style={[styles.bubbleRow, isCustomer ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
            <View style={[styles.bubble, isCustomer ? styles.bubbleCustomer : styles.bubbleAdmin]}>
              {!isCustomer && (
                <AppText
                  variant="caption"
                  weight="semibold"
                  color={colors.foreground}
                  style={styles.senderLabel}
                >
                  Support
                </AppText>
              )}
              <AppText
                variant="bodySmall"
                color={isCustomer ? colors.white : colors.foreground}
              >
                {m.body}
              </AppText>
              <AppText
                variant="tiny"
                color={isCustomer ? "rgba(255,255,255,0.7)" : colors.mutedLight}
                style={styles.time}
              >
                {formatTime(m.createdAt)}
              </AppText>
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    paddingVertical: spacing[8],
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[2],
  },
  dateSeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing[3],
    gap: spacing[2],
  },
  dateLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dateLabel: {
    fontSize: fontSize["2xs"],
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  systemEvent: {
    alignItems: "center",
    marginVertical: spacing[2],
    paddingHorizontal: spacing[4],
  },
  systemEventText: {
    fontStyle: "italic",
    fontSize: fontSize.xs,
    textAlign: "center",
  },
  bubbleRow: {
    marginBottom: spacing[2],
    maxWidth: "80%",
  },
  bubbleRowRight: {
    alignSelf: "flex-end",
  },
  bubbleRowLeft: {
    alignSelf: "flex-start",
  },
  bubble: {
    padding: spacing[3],
    borderRadius: borderRadius.xl,
  },
  bubbleCustomer: {
    backgroundColor: colors.brandBlue,
    borderBottomRightRadius: borderRadius.sm,
  },
  bubbleAdmin: {
    backgroundColor: colors.gray100,
    borderBottomLeftRadius: borderRadius.sm,
  },
  senderLabel: {
    fontSize: fontSize["2xs"],
    marginBottom: spacing[0.5],
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  time: {
    marginTop: spacing[1],
    textAlign: "right",
  },
});
