import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { getCaseStatusStyle } from "@/lib/orderStatus";
import { ROUTES } from "@/lib/routes";
import {
  useConversationsList,
  useCasesList,
  useTicketsList,
} from "@/lib/queries";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import {
  relativeTime,
  messageListPreview,
  convoTitle,
  convoStatus,
  buildUnifiedEntries,
  caseItemSummary,
  isCaseActive,
  caseStatusLabel,
  ticketCategoryLabel,
  mostUrgentStatus,
} from "@/app/account/messages/helpers";
import type {
  SupportTicket,
  CustomerCase,
  UnifiedEntry,
  Conversation,
  MainTab,
  FilterTab,
} from "@/lib/messages-types";
import { entityId } from "@/lib/messages-types";
import i18n from "@/i18n";

/* ── Types ───────────────────────────────────────────────────── */

type FamilyCaseEntry = { case_: CustomerCase; linkedTicket: SupportTicket | null; sortDate: string };

type ProcessedEntry =
  | UnifiedEntry
  | { kind: "family"; familyNumber: string; cases: FamilyCaseEntry[]; sortDate: string };

/* ── Helpers ─────────────────────────────────────────────────── */

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

/* ── Root ────────────────────────────────────────────────────── */

export default function MessagesScreen() {
  return <RequireAuth><MessagesContent /></RequireAuth>;
}

/* ── Main Content ────────────────────────────────────────────── */

function MessagesContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /* ── Tab + filter state ─────────────────────── */
  const [mainTab, setMainTab] = useState<MainTab>("tickets");
  const [filterTab, setFilterTab] = useState<FilterTab>("active");
  const [searchQuery, setSearchQuery] = useState("");

  /* ── Sealed query reads ─────────────────────── *
   * Each typed hook owns its cache key, fetcher, and schema (validated via
   * `parseOrThrow` inside `lib/queries/messages.ts`). Under the single-
   * writer + canonical-shape invariant, the cache cannot hold a non-array
   * value under any of these keys — the legacy `useMemo(unwrapList(...))`
   * defenders that lived here previously were runtime tolerance for
   * pre-sealed-layer shape inconsistency and are now dead code. Removed.
   *
   * Results are cast back to the local `Conversation` / `CustomerCase` /
   * `SupportTicket` types via the §D.4 escape hatch because the row
   * components and helpers in this file are typed against
   * `lib/messages-types`. Both type families describe the same backend
   * objects; the cast bridges them with zero runtime change.
   * ──────────────────────────────────────────── */
  const { data: conversationsData, isLoading: convosLoading } = useConversationsList();
  const conversations = (conversationsData ?? []) as unknown as Conversation[];

  const { data: casesData, isLoading: casesLoading } = useCasesList();
  const cases = (casesData ?? []) as unknown as CustomerCase[];

  const { data: ticketsData, isLoading: ticketsLoading } = useTicketsList();
  const tickets = (ticketsData ?? []) as unknown as SupportTicket[];

  /* ── Inline family expand state ─────────────── */
  const [expandedFamilyNumber, setExpandedFamilyNumber] = useState<string | null>(null);

  /* ── Build unified entries + apply filters ──── */
  const processedEntries: ProcessedEntry[] = useMemo(() => {
    let entries = buildUnifiedEntries(tickets, cases);

    // Filter
    if (filterTab === "active") {
      entries = entries.filter((e) => {
        if (e.kind === "ticket") return !e.ticket.archivedAt;
        const cActive = e.case_.status !== "CLOSED";
        const tArchived = e.linkedTicket?.archivedAt;
        return cActive || (e.linkedTicket && !tArchived);
      });
    }
    if (filterTab === "archived") {
      entries = entries.filter((e) => {
        if (e.kind === "ticket") return !!e.ticket.archivedAt;
        return e.case_.status === "CLOSED";
      });
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter((e) => {
        if (e.kind === "ticket") {
          return (
            entityId(e.ticket).toLowerCase().includes(q) ||
            (e.ticket.subject || "").toLowerCase().includes(q) ||
            (e.ticket.category || "").toLowerCase().includes(q) ||
            (e.ticket.ticketNumber || "").toLowerCase().includes(q) ||
            (e.ticket.body || "").toLowerCase().includes(q)
          );
        }
        return (
          e.case_.caseNumber.toLowerCase().includes(q) ||
          (e.case_.order?.orderNumber || "").toLowerCase().includes(q)
        );
      });
    }

    // Family grouping
    const familyMap = new Map<string, FamilyCaseEntry[]>();
    const others: UnifiedEntry[] = [];
    for (const entry of entries) {
      if (entry.kind === "case" && entry.case_.caseFamily?.familyNumber) {
        const fn = entry.case_.caseFamily.familyNumber;
        if (!familyMap.has(fn)) familyMap.set(fn, []);
        familyMap.get(fn)!.push({ case_: entry.case_, linkedTicket: entry.linkedTicket, sortDate: entry.sortDate });
      } else {
        others.push(entry);
      }
    }

    const result: ProcessedEntry[] = [...others];
    for (const [fn, grouped] of familyMap) {
      if (grouped.length >= 2) {
        const sortDate = grouped.reduce((latest, e) => (e.sortDate > latest ? e.sortDate : latest), grouped[0].sortDate);
        result.push({ kind: "family", familyNumber: fn, cases: grouped, sortDate });
      } else {
        for (const c of grouped) {
          result.push({ kind: "case", case_: c.case_, linkedTicket: c.linkedTicket, sortDate: c.sortDate });
        }
      }
    }

    result.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    return result;
  }, [tickets, cases, filterTab, searchQuery]);

  /* ── Filtered conversations ─────────────────── */
  const filteredConvos = useMemo(() => {
    let list = [...conversations];
    if (filterTab === "active") list = list.filter((c) => !c.archivedAt);
    if (filterTab === "archived") list = list.filter((c) => !!c.archivedAt);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          (c.subject || "").toLowerCase().includes(q) ||
          convoTitle(c, t).toLowerCase().includes(q) ||
          (c.lastMessage?.body || "").toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      const aT = a.lastMessageAt || a.lastMessage?.createdAt || "";
      const bT = b.lastMessageAt || b.lastMessage?.createdAt || "";
      return bT.localeCompare(aT);
    });
    return list;
  }, [conversations, filterTab, searchQuery, t]);

  /* ── Empty state text ───────────────────────── */
  const ticketEmptyText = filterTab === "archived"
    ? t("messages.noArchivedTickets")
    : t("messages.noActiveTickets");

  const convoEmptyText = filterTab === "archived"
    ? t("messages.noArchivedConversations")
    : t("messages.noActiveConversations");

  /* ── FlatList key helpers ───────────────────── */
  const ticketKeyExtractor = useCallback((item: ProcessedEntry, idx: number) => {
    if (item.kind === "ticket") return `t-${entityId(item.ticket)}`;
    if (item.kind === "case") return `c-${item.case_.caseNumber}`;
    if (item.kind === "family") return `f-${item.familyNumber}`;
    return `u-${idx}`;
  }, []);

  const convoKeyExtractor = useCallback((c: Conversation) => entityId(c) || String(c.id), []);

  /* ── Render ─────────────────────────────────── */
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header — standard pattern */}
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("messages.heading")}</AppText>
        <BackButton icon="close" />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* ── Page description ─────────────── */}
        <AppText variant="caption" color={colors.slate500} style={styles.subtitle}>
          {t("messages.subtitle")}
        </AppText>

        {/* ── Action buttons ─────────────────── */}
        <View style={styles.actionRow}>
          <AppButton
            title={t("messages.contactSeller")}
            variant="primary"
            size="md"
            icon="chat"
            onPress={() => router.push(ROUTES.supportMessageSellerAll as any)}
            style={styles.actionBtn}
          />
          <AppButton
            title={t("messages.newTicket")}
            variant="accent"
            size="md"
            icon="add"
            onPress={() => router.push(ROUTES.supportTicket as any)}
            style={styles.actionBtn}
          />
        </View>

        {/* ── Tabs card ──────────────────────── */}
        <View style={styles.tabsCard}>
          {/* Underline tabs */}
          <View style={styles.tabBar}>
            {([
              { key: "tickets" as MainTab, label: t("messages.tabSupportTickets") },
              { key: "messages" as MainTab, label: t("messages.tabSellerMessages") },
            ]).map((tab) => (
              <Pressable
                key={tab.key}
                style={[styles.tab, mainTab === tab.key && styles.tabActive]}
                onPress={() => setMainTab(tab.key)}
              >
                <AppText
                  variant="label"
                  color={mainTab === tab.key ? colors.brandBlue : colors.muted}
                  weight={mainTab === tab.key ? "bold" : "medium"}
                  style={{ fontSize: fontSize.sm }}
                >
                  {tab.label}
                </AppText>
              </Pressable>
            ))}
          </View>

          {/* Search bar */}
          <View style={styles.searchContainer}>
            <View style={styles.searchInputWrap}>
              <Icon name="search" size={18} color={colors.muted} style={{ marginRight: spacing[2] }} />
              <TextInput
                style={styles.searchInput}
                placeholder={t("messages.searchPlaceholder")}
                placeholderTextColor={colors.mutedLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
          </View>

          {/* Filter pills */}
          <View style={styles.filterRow}>
            {(["active", "archived"] as FilterTab[]).map((f) => (
              <Pressable
                key={f}
                style={[styles.filterPill, filterTab === f && styles.filterPillActive]}
                onPress={() => setFilterTab(f)}
              >
                <AppText
                  variant="caption"
                  color={filterTab === f ? colors.white : colors.foreground}
                  weight={filterTab === f ? "bold" : "medium"}
                >
                  {f === "active" ? t("messages.filterActive") : t("messages.filterArchived")}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Tab content ────────────────────── */}
        {mainTab === "tickets" ? (
          (casesLoading && ticketsLoading) ? (
            <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
          ) : processedEntries.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="folder-open" size={48} color={colors.gray300} />
              <AppText variant="body" color={colors.muted}>{ticketEmptyText}</AppText>
            </View>
          ) : (
            <View style={styles.listContainer}>
              {processedEntries.map((item, idx) => {
                if (item.kind === "ticket") {
                  return (
                    <TicketRow
                      key={`t-${entityId(item.ticket)}`}
                      ticket={item.ticket}
                      linkedCaseNumber={item.linkedCaseNumber}
                      onPress={() => router.push(ROUTES.supportTicketDetail(entityId(item.ticket)) as any)}
                    />
                  );
                }
                if (item.kind === "family") {
                  return (
                    <InlineFamilyRow
                      key={`f-${item.familyNumber}`}
                      familyNumber={item.familyNumber}
                      cases={item.cases}
                      isExpanded={expandedFamilyNumber === item.familyNumber}
                      onToggle={() =>
                        setExpandedFamilyNumber(
                          expandedFamilyNumber === item.familyNumber ? null : item.familyNumber,
                        )
                      }
                      onCasePress={(cn) => router.push(ROUTES.accountCase(cn) as any)}
                    />
                  );
                }
                // case
                return (
                  <CaseRow
                    key={`c-${item.case_.caseNumber}`}
                    caseData={item.case_}
                    linkedTicket={item.linkedTicket}
                    onPress={() => router.push(ROUTES.accountCase(item.case_.caseNumber) as any)}
                  />
                );
              })}
            </View>
          )
        ) : (
          convosLoading ? (
            <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
          ) : filteredConvos.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="chat-bubble-outline" size={48} color={colors.gray300} />
              <AppText variant="body" color={colors.muted}>{convoEmptyText}</AppText>
            </View>
          ) : (
            <View style={styles.listContainer}>
              {filteredConvos.map((convo) => (
                <ConversationRow
                  key={entityId(convo)}
                  convo={convo}
                  onPress={() => router.push(ROUTES.accountConversation(entityId(convo)) as any)}
                />
              ))}
            </View>
          )
        )}

        {/* bottom padding */}
        <View style={{ height: spacing[16] }} />
      </ScrollView>
    </View>
  );
}

/* ================================================================
   ROW COMPONENTS
   ================================================================ */

/* ── TicketRow ────────────────────────────────────────────────── */

function TicketRow({
  ticket,
  linkedCaseNumber,
  onPress,
}: {
  ticket: SupportTicket;
  linkedCaseNumber?: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const ts = ticket.updatedAt || ticket.createdAt;
  const rawBody = ticket.body?.trim().toLowerCase();
  const ticketPreview = ticket.body ? messageListPreview(ticket.body) : "";
  const snippet = !ticket.body
    ? t("messages.supportTicketFallback")
    : rawBody === "(attachment)" || rawBody === "attachment"
      ? t("messages.sentAnImage")
      : ticketPreview || t("messages.supportTicketFallback");
  const categoryLabel = ticketCategoryLabel(ticket, t);
  const isLocked = ticket.status === "CLOSED";
  const isArchived = !!ticket.archivedAt;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={[styles.rowIcon, { backgroundColor: "#fff7ed" }]}>
          <Icon name="support-agent" size={22} color={colors.brandOrange} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing[3] }}>
          {/* Title row */}
          <View style={styles.titleRow}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing[1.5] }}>
              <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
                {ticket.ticketNumber || `TK-${entityId(ticket).slice(0, 8).toUpperCase()}`}
              </AppText>
              <View style={styles.categoryChip}>
                <AppText variant="tiny" color={colors.slate500} weight="semibold" style={{ fontSize: 9 }}>
                  {categoryLabel}
                </AppText>
              </View>
            </View>
            <AppText variant="tiny" color={colors.muted} style={{ marginLeft: spacing[2] }}>
              {relativeTime(ts, t)}
            </AppText>
          </View>
          {/* Preview */}
          <AppText variant="caption" color={colors.muted} numberOfLines={1} style={{ marginTop: spacing[0.5], lineHeight: 18 }}>
            {snippet}
          </AppText>
          {/* Status */}
          <View style={[styles.metaRow, { marginTop: spacing[1.5] }]}>
            {linkedCaseNumber ? (
              <View style={[styles.badge, { backgroundColor: "#ecfeff" }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Icon name="link" size={10} color="#0e7490" />
                  <AppText variant="tiny" color="#0e7490" weight="bold" style={{ fontSize: 9 }}>
                    {t("messages.linkedToCase")}
                  </AppText>
                </View>
              </View>
            ) : isLocked ? (
              <View style={[styles.badge, { backgroundColor: "#dcfce7" }]}>
                <AppText variant="tiny" color="#15803d" weight="bold" style={{ fontSize: 10, textTransform: "uppercase" }}>
                  {t("messages.statusResolved")}
                </AppText>
              </View>
            ) : isArchived ? (
              <View style={[styles.badge, { backgroundColor: colors.gray100 }]}>
                <AppText variant="tiny" color={colors.gray500} weight="bold" style={{ fontSize: 10, textTransform: "uppercase" }}>
                  {t("messages.statusArchived")}
                </AppText>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: "#eff6ff" }]}>
                <AppText variant="tiny" color={colors.brandBlue} weight="bold" style={{ fontSize: 10 }}>
                  {t("messages.convoActive")}
                </AppText>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ── CaseRow ──────────────────────────────────────────────────── */

function CaseRow({
  caseData,
  linkedTicket,
  onPress,
}: {
  caseData: CustomerCase;
  linkedTicket?: SupportTicket | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const ts = caseData.updatedAt || caseData.createdAt;
  const active = isCaseActive(caseData.status);
  const statusLbl = caseStatusLabel(caseData.status, t);
  const statusColor = active
    ? { bg: "#fef3c7", fg: "#92400e" }
    : caseData.status === "CLOSED"
      ? { bg: colors.gray100, fg: colors.gray500 }
      : { bg: "#dcfce7", fg: "#15803d" };

  const summary = [
    caseData.order?.orderNumber ? t("messages.orderPrefix", { orderNumber: caseData.order.orderNumber }) : "",
    caseItemSummary(caseData, t),
  ].filter(Boolean).join(" · ");

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={[styles.rowIcon, { backgroundColor: "#ecfeff", borderWidth: 1, borderColor: "#cffafe" }]}>
          <Icon name="folder-open" size={22} color="#0891b2" />
        </View>
        <View style={{ flex: 1, marginLeft: spacing[3] }}>
          <View style={styles.titleRow}>
            <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
              {t("messages.caseLabel", { caseNumber: caseData.caseNumber })}
            </AppText>
            <AppText variant="tiny" color={colors.muted} style={{ marginLeft: spacing[2] }}>
              {relativeTime(ts, t)}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.muted} numberOfLines={1} style={{ marginTop: spacing[0.5], lineHeight: 18 }}>
            {summary}
          </AppText>
          <View style={[styles.metaRow, { marginTop: spacing[1.5] }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[1.5] }}>
              <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
                <AppText variant="tiny" color={statusColor.fg} weight="bold" style={{ fontSize: 10, textTransform: "uppercase" }}>
                  {statusLbl}
                </AppText>
              </View>
              {linkedTicket && (
                <View style={[styles.badge, { backgroundColor: "#fff7ed" }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                    <Icon name="confirmation-number" size={10} color="#c2410c" />
                    <AppText variant="tiny" color="#c2410c" weight="bold" style={{ fontSize: 9 }}>
                      {t("messages.ticketChip")}
                    </AppText>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ── InlineFamilyRow ──────────────────────────────────────────── */

function InlineFamilyRow({
  familyNumber,
  cases,
  isExpanded,
  onToggle,
  onCasePress,
}: {
  familyNumber: string;
  cases: FamilyCaseEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  onCasePress: (caseNumber: string) => void;
}) {
  const { t } = useTranslation();
  const aggregateStatus = mostUrgentStatus(cases.map((e) => e.case_));
  const statusLbl = caseStatusLabel(aggregateStatus, t);
  const active = isCaseActive(aggregateStatus);
  const ts = cases.reduce((latest, e) => (e.sortDate > latest ? e.sortDate : latest), cases[0].sortDate);

  const statusColor = active
    ? { bg: "#fef3c7", fg: "#92400e" }
    : aggregateStatus === "CLOSED"
      ? { bg: colors.gray100, fg: colors.gray500 }
      : { bg: "#dcfce7", fg: "#15803d" };

  return (
    <View>
      <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]} onPress={onToggle}>
        <View style={styles.cardRow}>
          <View style={[styles.rowIcon, { backgroundColor: "#eef2ff", borderWidth: 1, borderColor: "#e0e7ff" }]}>
            <Icon name="folder" size={22} color="#4f46e5" />
          </View>
          <View style={{ flex: 1, marginLeft: spacing[3] }}>
            <View style={styles.titleRow}>
              <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
                {familyNumber}
              </AppText>
              <AppText variant="tiny" color={colors.muted} style={{ marginLeft: spacing[2] }}>
                {relativeTime(ts, t)}
              </AppText>
            </View>
            <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[0.5] }}>
              {t("messages.casesGrouped", { count: cases.length })}
            </AppText>
            <View style={[styles.metaRow, { marginTop: spacing[1.5] }]}>
              <View style={[styles.badge, { backgroundColor: statusColor.bg }]}>
                <AppText variant="tiny" color={statusColor.fg} weight="bold" style={{ fontSize: 10, textTransform: "uppercase" }}>
                  {statusLbl}
                </AppText>
              </View>
              <Icon
                name={isExpanded ? "expand-less" : "expand-more"}
                size={18}
                color={colors.muted}
              />
            </View>
          </View>
        </View>
      </Pressable>
      {isExpanded && (
        <View style={{ paddingLeft: spacing[4] }}>
          {cases.map((entry) => (
            <CaseRow
              key={`fchild-${entry.case_.caseNumber}`}
              caseData={entry.case_}
              linkedTicket={entry.linkedTicket}
              onPress={() => onCasePress(entry.case_.caseNumber)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

/* ── ConversationRow ──────────────────────────────────────────── */

function ConversationRow({ convo, onPress }: { convo: Conversation; onPress: () => void }) {
  const { t } = useTranslation();
  const vendorName = convoTitle(convo, t);
  const ts = convo.lastMessageAt || convo.lastMessage?.createdAt || null;
  const rawBody = convo.lastMessage?.body?.trim().toLowerCase();
  const preview = convo.lastMessage?.body
    ? messageListPreview(convo.lastMessage.body)
    : "";
  const snippet = !convo.lastMessage?.body
    ? t("messages.noMessagesYet")
    : rawBody === "(attachment)" || rawBody === "attachment"
      ? t("messages.sentAnImage")
      : preview || t("messages.noMessagesYet");
  const unread = (convo.unreadCount ?? 0) > 0;
  const status = convoStatus(convo);
  const isArchived = !!convo.archivedAt;

  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={[styles.rowIcon, { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border }]}>
          <Icon name="storefront" size={22} color={colors.muted} />
        </View>
        <View style={{ flex: 1, marginLeft: spacing[3] }}>
          <View style={styles.titleRow}>
            <AppText
              variant="label"
              numberOfLines={1}
              weight={unread ? "bold" : "semibold"}
              style={{ flex: 1 }}
            >
              {vendorName}
            </AppText>
            <AppText variant="tiny" color={colors.muted} style={{ marginLeft: spacing[2] }}>
              {ts ? relativeTime(ts, t) : "—"}
            </AppText>
          </View>
          <AppText variant="caption" color={colors.muted} numberOfLines={1} style={{ marginTop: spacing[0.5], lineHeight: 18 }}>
            {snippet}
          </AppText>
          <View style={[styles.metaRow, { marginTop: spacing[1.5] }]}>
            {status === "LOCKED" ? (
              <View style={[styles.badge, { backgroundColor: colors.gray100 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  <Icon name="lock" size={10} color={colors.gray500} />
                  <AppText variant="tiny" color={colors.gray500} weight="bold" style={{ fontSize: 10, textTransform: "uppercase" }}>
                    {t("messages.convoLocked")}
                  </AppText>
                </View>
              </View>
            ) : isArchived ? (
              <View style={[styles.badge, { backgroundColor: colors.gray100 }]}>
                <AppText variant="tiny" color={colors.gray500} weight="bold" style={{ fontSize: 10, textTransform: "uppercase" }}>
                  {t("messages.convoArchived")}
                </AppText>
              </View>
            ) : (
              <View style={[styles.badge, { backgroundColor: "#eff6ff" }]}>
                <AppText variant="tiny" color={colors.brandBlue} weight="bold" style={{ fontSize: 10, textTransform: "uppercase" }}>
                  {t("messages.convoActive")}
                </AppText>
              </View>
            )}
            {unread && <View style={styles.unreadDot} />}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ── Styles ───────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  loader: { marginTop: spacing[12] },
  empty: { alignItems: "center", justifyContent: "center", gap: spacing[3], paddingVertical: spacing[16] },

  /* ── Action buttons ─── */
  actionRow: {
    flexDirection: "row",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    marginTop: spacing[1],
    marginBottom: spacing[4],
  },
  actionBtn: {
    flex: 1,
    borderRadius: borderRadius.lg,
  },
  subtitle: {
    paddingHorizontal: spacing[4],
    marginTop: spacing[2],
    marginBottom: spacing[4],
    lineHeight: 20,
  },

  /* ── Tabs card container ─── */
  tabsCard: {
    marginHorizontal: spacing[4],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    marginBottom: spacing[4],
  },

  /* ── Underline tabs ─── */
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[3],
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: colors.brandBlue,
  },

  /* ── Search ─── */
  searchContainer: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.slate50,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2.5],
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
    padding: 0,
  },

  /* ── Filter pills ─── */
  filterRow: {
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "center",
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
  },
  filterPill: {
    height: 34,
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  filterPillActive: {
    backgroundColor: colors.brandBlue,
    borderColor: colors.brandBlue,
  },

  /* ── List container ─── */
  listContainer: {
    paddingHorizontal: spacing[4],
  },

  /* ── Cards ─── */
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: colors.gray100,
    ...shadows.sm,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryChip: {
    backgroundColor: colors.slate100,
    paddingHorizontal: spacing[1.5],
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },

  /* ── Badges ─── */
  badge: {
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.full,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brandBlue,
  },
});
