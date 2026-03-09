import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import SlideDrawer from "@/components/SlideDrawer";
import CaseDetailPanel from "@/components/CaseDetailPanel";
import FamilyDetailPanel from "@/components/FamilyDetailPanel";
import { customerFetch } from "@/lib/api";
import { colors, spacing, borderRadius, shadows, fontSize, fontWeight } from "@/lib/theme";
import type { CustomerCase } from "@/lib/messages-types";

type Conversation = {
  id: number;
  publicId: string;
  subject: string;
  status: string;
  lastMessageAt: string;
  unreadCount: number;
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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN:              { bg: "#dbeafe", text: "#1d4ed8" },
  AWAITING:          { bg: "#dbeafe", text: "#1d4ed8" },
  RESOLVED:          { bg: "#d1fae5", text: "#047857" },
  CLOSED:            { bg: "#f3f4f6", text: "#6b7280" },
  AWAITING_CUSTOMER: { bg: "#ede9fe", text: "#6d28d9" },
};

function getStatusStyle(status: string) {
  const normalized = status.toUpperCase().replace(/ /g, "_");
  return STATUS_COLORS[normalized] ?? STATUS_COLORS.OPEN;
}

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
    "Item";
  if (items.length === 1) return name;
  return `${name} +${items.length - 1} more`;
}

export default function MessagesScreen() {
  return <RequireAuth><MessagesContent /></RequireAuth>;
}

type DrawerState =
  | { type: "case"; caseNumber: string; fromFamily?: FamilyGroup }
  | { type: "family"; family: FamilyGroup }
  | null;

function MessagesContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("conversations");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [cases, setCases] = useState<CustomerCase[]>([]);
  const [casesLoading, setCasesLoading] = useState(true);

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

  const loadCases = useCallback(async () => {
    setCasesLoading(true);
    try {
      const data = await customerFetch<any>(`/cases/mine?limit=50`);
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setCases(list);
    } catch {
      setCases([]);
    }
    setCasesLoading(false);
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { loadCases(); }, [loadCases]);

  const caseListItems = useMemo(() => buildCaseList(cases), [cases]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Messages</AppText>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, tab === "conversations" && styles.tabActive]}
          onPress={() => setTab("conversations")}
        >
          <AppText
            variant="label"
            color={tab === "conversations" ? colors.brandBlue : colors.muted}
            weight={tab === "conversations" ? "semibold" : "normal"}
          >
            Conversations
          </AppText>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === "cases" && styles.tabActive]}
          onPress={() => setTab("cases")}
        >
          <AppText
            variant="label"
            color={tab === "cases" ? colors.brandBlue : colors.muted}
            weight={tab === "cases" ? "semibold" : "normal"}
          >
            Cases & Support
          </AppText>
        </Pressable>
      </View>

      {tab === "conversations" ? (
        loading ? (
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
        )
      ) : (
        casesLoading ? (
          <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
        ) : caseListItems.length === 0 ? (
          <View style={styles.empty}>
            <Icon name="folder-open" size={48} color={colors.gray300} />
            <AppText variant="subtitle" color={colors.muted}>No cases</AppText>
          </View>
        ) : (
          <FlatList
            data={caseListItems}
            keyExtractor={(item, idx) =>
              item.type === "family" ? `fam-${item.familyNumber}` : `case-${item.case.caseNumber}-${idx}`
            }
            contentContainerStyle={styles.list}
            renderItem={({ item }) =>
              item.type === "family" ? (
                <FamilyRow group={item} onPress={() => openFamily(item)} />
              ) : (
                <CaseRow caseData={item.case} onPress={() => openCase(item.case.caseNumber)} />
              )
            }
          />
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

function StatusBadge({ status }: { status: string }) {
  const { bg, text } = getStatusStyle(status);
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText variant="tiny" color={text} weight="bold" style={{ fontSize: 10 }}>
        {status.replace(/_/g, " ")}
      </AppText>
    </View>
  );
}

function FamilyRow({ group, onPress }: { group: FamilyGroup; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={styles.familyIcon}>
          <Icon name="folder" size={20} color={colors.brandBlue} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing[2] }}>
          <AppText variant="label" numberOfLines={1}>Family {group.familyNumber}</AppText>
          <AppText variant="caption">{group.cases.length} cases</AppText>
        </View>
        <StatusBadge status={group.aggregateStatus} />
      </View>
    </Pressable>
  );
}

function CaseRow({ caseData, onPress }: { caseData: CustomerCase; onPress: () => void }) {
  const summary = itemsSummary(caseData.items);
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
          Case {caseData.caseNumber}
        </AppText>
        <StatusBadge status={caseData.status} />
      </View>
      <View style={styles.caseMetaRow}>
        <AppText variant="caption" style={{ flex: 1 }} numberOfLines={1}>
          {caseData.resolutionIntent.replace(/_/g, " ")}
        </AppText>
        <AppText variant="caption">
          {new Date(caseData.createdAt).toLocaleDateString()}
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
});
