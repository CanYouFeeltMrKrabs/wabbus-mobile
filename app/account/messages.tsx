import React, { useState, useCallback, useMemo } from "react";
import { View, FlatList, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import SlideDrawer from "@/components/SlideDrawer";
import CaseDetailPanel from "@/components/CaseDetailPanel";
import FamilyDetailPanel from "@/components/FamilyDetailPanel";
import { customerFetch } from "@/lib/api";
import { formatDate } from "@/lib/orderHelpers";
import { getCaseStatusStyle } from "@/lib/orderStatus";
import { ROUTES } from "@/lib/routes";
import { queryKeys } from "@/lib/queryKeys";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import i18n from "@/i18n";
import type { CustomerCase } from "@/lib/messages-types";

type Conversation = {
  id: number;
  publicId: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  unreadCount: number;
};

type SupportTicket = {
  publicId: string;
  subject?: string;
  category?: string;
  status: string;
  createdAt: string;
};

type Tab = "conversations" | "cases";

type FamilyGroup = {
  type: "family";
  familyNumber: string;
  cases: CustomerCase[];
  aggregateStatus: string;
};

type SingleCaseRow = {
  type: "case";
  case: CustomerCase;
};

type CaseListItem = FamilyGroup | SingleCaseRow;

function aggregateFamilyStatus(cases: CustomerCase[]): string {
  if (cases.some((c) => c.status.toUpperCase() === "OPEN")) return "OPEN";
  if (cases.some((c) => c.status.toUpperCase() === "AWAITING_CUSTOMER")) return "AWAITING_CUSTOMER";
  if (cases.some((c) => c.status.toUpperCase() === "AWAITING")) return "AWAITING";
  if (cases.every((c) => c.status.toUpperCase() === "CLOSED")) return "CLOSED";
  return "RESOLVED";
}

function buildCaseList(cases: CustomerCase[]): CaseListItem[] {
  const familyMap = new Map<string, CustomerCase[]>();
  const noFamily: CustomerCase[] = [];

  for (const c of cases) {
    if (c.caseFamily?.familyNumber) {
      const key = c.caseFamily.familyNumber;
      const arr = familyMap.get(key);
      if (arr) arr.push(c);
      else familyMap.set(key, [c]);
    } else {
      noFamily.push(c);
    }
  }

  const items: CaseListItem[] = [];

  for (const [familyNumber, grouped] of familyMap) {
    if (grouped.length >= 2) {
      items.push({
        type: "family",
        familyNumber,
        cases: grouped,
        aggregateStatus: aggregateFamilyStatus(grouped),
      });
    } else {
      items.push({ type: "case", case: grouped[0] });
    }
  }

  for (const c of noFamily) {
    items.push({ type: "case", case: c });
  }

  items.sort((a, b) => {
    const dateA = a.type === "family" ? a.cases[0].createdAt : a.case.createdAt;
    const dateB = b.type === "family" ? b.cases[0].createdAt : b.case.createdAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return items;
}

function itemsSummary(items: CustomerCase["items"]): string {
  if (!items || items.length === 0) return "";
  const first = items[0];
  const name =
    first.orderItem?.productVariant?.product?.title ??
    first.orderItem?.productVariant?.title ??
    i18n.t("messages.itemFallback");
  if (items.length === 1) return name;
  return i18n.t("messages.itemPlusMore", { name, count: items.length - 1 });
}

export default function MessagesScreen() {
  return <RequireAuth><MessagesContent /></RequireAuth>;
}

type DrawerState =
  | { type: "case"; caseNumber: string; fromFamily?: FamilyGroup }
  | { type: "family"; family: FamilyGroup }
  | null;

function MessagesContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data: unreadData } = useQuery({
    queryKey: queryKeys.messages.unread(),
    queryFn: () =>
      customerFetch<{ conversations: number; tickets: number; cases: number }>(
        "/messages/unread-counts",
      ),
    refetchInterval: 30_000,
    enabled: true,
  });

  const [tab, setTab] = useState<Tab>("conversations");

  // Conversations — first page via useQuery, pagination via state
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [extraConversations, setExtraConversations] = useState<Conversation[]>([]);

  const { data: firstPageConversations = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.messages.conversations.list(),
    queryFn: async () => {
      const data = await customerFetch<any>(`/messages/conversations?limit=50`);
      const list: Conversation[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setCursor(data?.nextCursor ?? null);
      setHasMore(!!data?.hasMore);
      setExtraConversations([]);
      return list;
    },
  });

  const conversations = useMemo(
    () => [...firstPageConversations, ...extraConversations],
    [firstPageConversations, extraConversations],
  );

  // Cases
  const { data: cases = [], isLoading: casesLoading } = useQuery({
    queryKey: queryKeys.messages.cases.list(),
    queryFn: async () => {
      const data = await customerFetch<any>(`/cases/mine?limit=50`);
      return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    },
  });

  // Tickets — first page via useQuery, pagination via state
  const [ticketsCursor, setTicketsCursor] = useState<string | null>(null);
  const [ticketsHasMore, setTicketsHasMore] = useState(false);
  const [ticketsLoadingMore, setTicketsLoadingMore] = useState(false);
  const [extraTickets, setExtraTickets] = useState<SupportTicket[]>([]);

  const { data: firstPageTickets = [], isLoading: ticketsLoading } = useQuery({
    queryKey: queryKeys.messages.tickets.list(),
    queryFn: async () => {
      const data = await customerFetch<any>(`/support/tickets?limit=50`);
      const list: SupportTicket[] = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setTicketsCursor(data?.nextCursor ?? null);
      setTicketsHasMore(!!data?.hasMore);
      setExtraTickets([]);
      return list;
    },
  });

  const tickets = useMemo(
    () => [...firstPageTickets, ...extraTickets],
    [firstPageTickets, extraTickets],
  );

  const [drawer, setDrawer] = useState<DrawerState>(null);

  const openCase = useCallback((caseNumber: string) => {
    setDrawer({ type: "case", caseNumber });
  }, []);

  const openFamily = useCallback((family: FamilyGroup) => {
    setDrawer({ type: "family", family });
  }, []);

  const openCaseFromFamily = useCallback((caseNumber: string, family: FamilyGroup) => {
    setDrawer({ type: "case", caseNumber, fromFamily: family });
  }, []);

  const closeDrawer = useCallback(() => setDrawer(null), []);

  const loadMoreConversations = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "50", cursor });
      const data = await customerFetch<any>(`/messages/conversations?${params}`);
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setExtraConversations((prev) => [...prev, ...list]);
      setCursor(data?.nextCursor ?? null);
      setHasMore(!!data?.hasMore);
    } catch {}
    setLoadingMore(false);
  }, [cursor, loadingMore]);

  const loadMoreTickets = useCallback(async () => {
    if (!ticketsCursor || ticketsLoadingMore) return;
    setTicketsLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "50", cursor: ticketsCursor });
      const data = await customerFetch<any>(`/support/tickets?${params}`);
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setExtraTickets((prev) => [...prev, ...list]);
      setTicketsCursor(data?.nextCursor ?? null);
      setTicketsHasMore(!!data?.hasMore);
    } catch {}
    setTicketsLoadingMore(false);
  }, [ticketsCursor, ticketsLoadingMore]);

  const caseListItems = useMemo(() => buildCaseList(cases), [cases]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">{t("messages.heading")}</AppText>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === "conversations" && styles.tabActive]}
          onPress={() => setTab("conversations")}
        >
          <View style={styles.tabLabelRow}>
            <AppText
              variant="label"
              color={tab === "conversations" ? colors.brandBlue : colors.muted}
              weight={tab === "conversations" ? "semibold" : "normal"}
            >
              {t("messages.tabConversations")}
            </AppText>
            {(unreadData?.conversations ?? 0) > 0 && (
              <View style={styles.tabBadge}>
                <AppText variant="tiny" color={colors.white} weight="bold">
                  {unreadData!.conversations}
                </AppText>
              </View>
            )}
          </View>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "cases" && styles.tabActive]}
          onPress={() => setTab("cases")}
        >
          <View style={styles.tabLabelRow}>
            <AppText
              variant="label"
              color={tab === "cases" ? colors.brandBlue : colors.muted}
              weight={tab === "cases" ? "semibold" : "normal"}
            >
              {t("messages.tabCasesSupport")}
            </AppText>
            {((unreadData?.cases ?? 0) + (unreadData?.tickets ?? 0)) > 0 && (
              <View style={styles.tabBadge}>
                <AppText variant="tiny" color={colors.white} weight="bold">
                  {(unreadData?.cases ?? 0) + (unreadData?.tickets ?? 0)}
                </AppText>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {tab === "conversations" ? (
        loading ? (
          <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="chat-bubble-outline" size={48} color={colors.gray300} />
            <AppText variant="subtitle" color={colors.muted}>{t("messages.noMessages")}</AppText>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => c.publicId}
            contentContainerStyle={styles.list}
            onEndReached={() => { if (hasMore && !loadingMore) loadMoreConversations(); }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.brandBlue} style={{ marginVertical: spacing[4] }} /> : null}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
                onPress={() => router.push(ROUTES.accountConversation(item.publicId))}
              >
                <View style={styles.cardRow}>
                  <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>{item.subject}</AppText>
                  {item.unreadCount > 0 && (
                    <View style={styles.unread}>
                      <AppText variant="tiny" color={colors.white} weight="bold">{item.unreadCount}</AppText>
                    </View>
                  )}
                </View>
                <AppText variant="caption">{formatDate(item.lastMessageAt)}</AppText>
              </Pressable>
            )}
          />
        )
      ) : (
        (casesLoading && ticketsLoading) ? (
          <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
        ) : (caseListItems.length === 0 && tickets.length === 0) ? (
          <View style={styles.empty}>
            <Icon name="folder-open" size={48} color={colors.gray300} />
            <AppText variant="subtitle" color={colors.muted}>{t("messages.noCasesOrTickets")}</AppText>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {tickets.length > 0 && (
              <>
                <AppText variant="subtitle" weight="semibold" style={{ marginBottom: spacing[2] }}>
                  {t("messages.supportTicketsHeading")}
                </AppText>
                {tickets.map((tk) => (
                  <TicketRow key={tk.publicId} ticket={tk} onPress={() => router.push(ROUTES.supportTicketDetail(tk.publicId) as any)} />
                ))}
                {ticketsHasMore && (
                  <Pressable
                    onPress={() => { if (!ticketsLoadingMore) loadMoreTickets(); }}
                    style={styles.loadMoreBtn}
                  >
                    {ticketsLoadingMore ? (
                      <ActivityIndicator size="small" color={colors.brandBlue} />
                    ) : (
                      <AppText variant="caption" color={colors.brandBlue} weight="semibold">{t("messages.loadMoreTickets")}</AppText>
                    )}
                  </Pressable>
                )}
                {caseListItems.length > 0 && (
                  <AppText variant="subtitle" weight="semibold" style={{ marginTop: spacing[4], marginBottom: spacing[2] }}>
                    {t("messages.casesHeading")}
                  </AppText>
                )}
              </>
            )}
            {caseListItems.map((item, idx) =>
              item.type === "family" ? (
                <FamilyRow key={`fam-${item.familyNumber}`} group={item} onPress={() => openFamily(item)} />
              ) : (
                <CaseRow key={`case-${item.case.caseNumber}-${idx}`} caseData={item.case} onPress={() => openCase(item.case.caseNumber)} />
              )
            )}
          </ScrollView>
        )
      )}

      <SlideDrawer visible={drawer !== null} onClose={closeDrawer}>
        {drawer?.type === "case" && (
          <CaseDetailPanel
            caseNumber={drawer.caseNumber}
            onClose={closeDrawer}
            onBack={
              drawer.fromFamily
                ? () => setDrawer({ type: "family", family: drawer.fromFamily! })
                : undefined
            }
          />
        )}
        {drawer?.type === "family" && (
          <FamilyDetailPanel
            familyNumber={drawer.family.familyNumber}
            cases={drawer.family.cases}
            onClose={closeDrawer}
            onCasePress={(cn) => openCaseFromFamily(cn, drawer.family)}
          />
        )}
      </SlideDrawer>
    </View>
  );
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: "messages.statusOpen",
    RESOLVED: "messages.statusResolved",
    CLOSED: "messages.statusClosed",
    ARCHIVED: "messages.statusArchived",
    IN_PROGRESS: "messages.statusInProgress",
    AWAITING_CUSTOMER: "messages.statusAwaitingCustomer",
    AWAITING_VENDOR: "messages.statusAwaitingVendor",
    AWAITING_SUPPORT: "messages.statusAwaitingSupport",
    AWAITING: "messages.statusAwaiting",
  };
  const key = map[status.toUpperCase()];
  return key ? i18n.t(key) : status.replace(/_/g, " ");
}

function getIntentLabel(intent: string): string {
  const keys: Record<string, string> = {
    REFUND: "messages.caseDetail.intentRefund",
    STORE_CREDIT: "messages.caseDetail.intentStoreCredit",
    REPLACEMENT: "messages.caseDetail.intentReplacement",
    RETURN: "messages.caseDetail.intentReturn",
    MISSING_PACKAGE: "messages.caseDetail.intentMissingPackage",
  };
  return keys[intent] ? i18n.t(keys[intent]) : intent.replace(/_/g, " ");
}

function StatusBadge({ status }: { status: string }) {
  const { bg, fg } = getCaseStatusStyle(status);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText variant="tiny" color={fg} weight="bold" style={{ fontSize: 10 }}>
        {getStatusLabel(status)}
      </AppText>
    </View>
  );
}

function FamilyRow({ group, onPress }: { group: FamilyGroup; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={styles.familyIcon}>
          <Icon name="folder" size={20} color={colors.brandBlue} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing[2] }}>
          <AppText variant="label" numberOfLines={1}>{t("messages.familyLabel", { familyNumber: group.familyNumber })}</AppText>
          <AppText variant="caption">{t("messages.familyCasesCount", { count: group.cases.length })}</AppText>
        </View>
        <StatusBadge status={group.aggregateStatus} />
      </View>
    </Pressable>
  );
}

function TicketRow({ ticket, onPress }: { ticket: SupportTicket; onPress: () => void }) {
  const { t } = useTranslation();
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <Icon name="confirmation-number" size={18} color={colors.brandBlue} style={{ marginRight: spacing[2] }} />
        <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
          {ticket.subject || ticket.category || t("messages.supportTicketFallback")}
        </AppText>
        <StatusBadge status={ticket.status} />
      </View>
      <AppText variant="caption" style={{ marginTop: spacing[0.5] }}>
        {formatDate(ticket.createdAt)}
      </AppText>
    </Pressable>
  );
}

function CaseRow({ caseData, onPress }: { caseData: CustomerCase; onPress: () => void }) {
  const { t } = useTranslation();
  const summary = itemsSummary(caseData.items);
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
          {t("messages.caseLabel", { caseNumber: caseData.caseNumber })}
        </AppText>
        <StatusBadge status={caseData.status} />
      </View>
      <View style={styles.caseMetaRow}>
        <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>
          {getIntentLabel(caseData.resolutionIntent)}
        </AppText>
        <AppText variant="caption">
          {formatDate(caseData.createdAt)}
        </AppText>
      </View>
      {summary ? (
        <AppText variant="caption" numberOfLines={1} style={{ marginTop: spacing[1] }}>
          {summary}
        </AppText>
      ) : null}
    </Pressable>
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
  tabBar: {
    flexDirection: "row",
    marginHorizontal: spacing[4],
    marginBottom: spacing[3],
    backgroundColor: colors.gray100,
    borderRadius: borderRadius.lg,
    padding: spacing[0.5],
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[2],
    borderRadius: borderRadius.md,
  },
  tabActive: {
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1.5],
  },
  tabBadge: {
    backgroundColor: colors.brandOrange,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[1],
  },
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },
  familyIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center",
    justifyContent: "center",
  },
  caseMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  loadMoreBtn: {
    alignItems: "center",
    paddingVertical: spacing[3],
    marginBottom: spacing[2],
  },
});
