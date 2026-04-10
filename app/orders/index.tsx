import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  FlatList,
  Pressable,
  Image,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { productImageUrl } from "@/lib/image";
import { getReturnStatusConfig } from "@/lib/orderStatus";
import { formatDate, normalizeNumber, pickItemTitle, pickItemImage, pickUnitPriceCents, orderTotalCents, orderItemCount } from "@/lib/orderHelpers";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import { SkeletonOrderCard } from "@/components/ui/Skeleton";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { Order, ReturnRequest } from "@/lib/types";

type Tab = "orders" | "returns" | "buyagain";
type SortBy = "newest" | "oldest" | "total-high" | "total-low";

type BuyAgainItem = {
  productId: string;
  variantPublicId: string;
  title: string;
  image: string;
  price: number;
  lastOrderDate: string;
};

function extractBuyAgainItems(orders: Order[]): BuyAgainItem[] {
  const seen = new Set<string>();
  const items: BuyAgainItem[] = [];
  const delivered = orders.filter(
    (o) => o.status === "DELIVERED" || o.status === "COMPLETED",
  );

  for (const order of delivered) {
    if (!order.items) continue;
    for (const item of order.items) {
      const key = item.publicId || pickItemTitle(item);
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        productId: item.productVariant?.product?.productId ?? "",
        variantPublicId: item.productVariant?.publicId ?? "",
        title: pickItemTitle(item),
        image: pickItemImage(item) ?? "",
        price: pickUnitPriceCents(item),
        lastOrderDate: order.createdAt,
      });
    }
  }
  return items;
}

export default function OrdersScreen() {
  return <RequireAuth><OrdersContent /></RequireAuth>;
}

function OrdersContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const { addToCart } = useCart();

  const SORT_OPTIONS: { value: SortBy; label: string }[] = [
    { value: "newest", label: t("accountOrders.sortNewest") },
    { value: "oldest", label: t("accountOrders.sortOldest") },
    { value: "total-high", label: t("accountOrders.sortTotalHigh") },
    { value: "total-low", label: t("accountOrders.sortTotalLow") },
  ];

  const { data: ordersData, isLoading: loading } = useQuery({
    queryKey: queryKeys.orders.list(),
    queryFn: () => customerFetch<any>("/orders?limit=50"),
    enabled: isLoggedIn,
  });

  const { data: returnsData, isLoading: returnsLoading } = useQuery({
    queryKey: queryKeys.returns.list(),
    queryFn: () => customerFetch<any>("/returns"),
    enabled: isLoggedIn,
  });

  type CaseLite = { caseNumber: string; status: string; resolutionIntent: string; order: { publicId?: string } };
  const { data: cases = [] } = useQuery({
    queryKey: queryKeys.messages.cases.listFlat(),
    queryFn: async () => {
      const raw = await customerFetch<any>("/cases/mine?limit=200");
      if (raw && typeof raw === "object" && Array.isArray(raw.data)) return raw.data as CaseLite[];
      return Array.isArray(raw) ? raw as CaseLite[] : [];
    },
    enabled: isLoggedIn,
    staleTime: 5 * 60_000,
  });

  const activeCasesByOrder = useMemo(() => {
    const ACTIVE_STATUSES = ["OPEN", "AWAITING_VENDOR", "AWAITING_CUSTOMER", "AWAITING_SUPPORT", "IN_PROGRESS", "OPEN_PENDING_FLAG_OR_DECISION"];
    const map = new Map<string, CaseLite[]>();
    for (const c of cases) {
      if (!ACTIVE_STATUSES.includes(c.status)) continue;
      const key = c.order?.publicId;
      if (!key) continue;
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    return map;
  }, [cases]);

  const initialOrders = useMemo(() => {
    const d = ordersData;
    return Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : []);
  }, [ordersData]);

  const returns: ReturnRequest[] = useMemo(() => {
    const d = returnsData;
    return Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : []);
  }, [returnsData]);

  const [extraOrders, setExtraOrders] = useState<Order[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("orders");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [showSort, setShowSort] = useState(false);

  useEffect(() => {
    setCursor(ordersData?.nextCursor ?? null);
    setHasMore(!!ordersData?.hasMore);
    setExtraOrders([]);
  }, [ordersData]);

  const orders = useMemo(
    () => [...initialOrders, ...extraOrders],
    [initialOrders, extraOrders],
  );

  const loadMore = useCallback(async (nextCursor: string) => {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: "50", cursor: nextCursor });
      const data = await customerFetch<any>(`/orders?${params}`);
      const list = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
      setExtraOrders((prev) => [...prev, ...list]);
      setCursor(data?.nextCursor ?? null);
      setHasMore(!!data?.hasMore);
    } catch {}
    setLoadingMore(false);
  }, []);

  const buyAgainItems = useMemo(() => extractBuyAgainItems(orders), [orders]);

  const filtered = useMemo(() => {
    let list = [...orders];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((o) => {
        const label = o.orderNumber || o.publicId || String(o.id ?? "");
        if (label.toLowerCase().includes(q)) return true;
        if (o.items?.some((it) => pickItemTitle(it).toLowerCase().includes(q))) return true;
        return false;
      });
    }
    list.sort((a, b) => {
      if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === "total-high" || sortBy === "total-low") {
        const ta = normalizeNumber(a.totalAmount) ?? 0;
        const tb = normalizeNumber(b.totalAmount) ?? 0;
        return sortBy === "total-high" ? tb - ta : ta - tb;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return list;
  }, [orders, searchQuery, sortBy]);

  const handleBuyAgainAddToCart = useCallback(async (item: BuyAgainItem) => {
    if (!item.variantPublicId) return;
    try {
      await addToCart({
        variantPublicId: item.variantPublicId,
        price: item.price / 100,
        title: item.title,
        image: item.image,
        productId: item.productId,
        slug: "",
      });
      Alert.alert(t("accountOrders.addedToCartTitle"), t("accountOrders.addedToCartBody", { title: item.title }));
    } catch {
      Alert.alert(t("common.error"), t("accountOrders.addToCartError"));
    }
  }, [addToCart]);

  const orderDisplayId = useCallback((o: Order) => {
    return o.orderNumber || `#${o.publicId?.slice(0, 8)}`;
  }, []);

  if (!isLoggedIn) {
    return (
      <View style={[st.empty, { paddingTop: insets.top }]}>
        <Icon name="receipt-long" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>{t("accountOrders.signInPrompt")}</AppText>
        <AppButton title={t("accountOrders.signIn")} variant="primary" onPress={() => router.push(ROUTES.login)} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("accountOrders.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar — 3 tabs */}
      <View style={st.tabBar}>
        {(["orders", "returns", "buyagain"] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[st.tab, activeTab === tab && st.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <AppText
              style={[st.tabText, activeTab === tab && st.tabTextActive]}
            >
              {tab === "orders" ? t("accountOrders.tabOrders") : tab === "returns" ? t("accountOrders.tabReturns") : t("accountOrders.tabBuyAgain")}
            </AppText>
          </Pressable>
        ))}
      </View>

      {/* ── ORDERS TAB ── */}
      {activeTab === "orders" && (
        <>
          {/* Search + Sort */}
          <View style={st.searchRow}>
            <View style={st.searchInput}>
              <Icon name="search" size={18} color={colors.muted} />
              <TextInput
                style={st.searchField}
                placeholder={t("accountOrders.searchPlaceholder")}
                placeholderTextColor={colors.mutedLight}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
                  <Icon name="close" size={16} color={colors.muted} />
                </Pressable>
              )}
            </View>
            <Pressable style={st.sortBtn} onPress={() => setShowSort(!showSort)}>
              <Icon name="sort" size={20} color={colors.brandBlue} />
            </Pressable>
          </View>

          {showSort && (
            <View style={st.sortOptions}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[st.sortPill, sortBy === opt.value && st.sortPillActive]}
                  onPress={() => { setSortBy(opt.value); setShowSort(false); }}
                >
                  <AppText
                    variant="caption"
                    color={sortBy === opt.value ? colors.white : colors.muted}
                    weight={sortBy === opt.value ? "semibold" : "normal"}
                  >
                    {opt.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
          )}

          {loading ? (
            <View style={st.list}>
              <SkeletonOrderCard />
              <SkeletonOrderCard />
              <SkeletonOrderCard />
            </View>
          ) : filtered.length === 0 ? (
            <View style={st.empty}>
              <Icon name="receipt-long" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted}>
                {searchQuery ? t("accountOrders.noMatchingOrders") : t("accountOrders.noOrdersYet")}
              </AppText>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.publicId}
              contentContainerStyle={st.list}
              showsVerticalScrollIndicator={false}
              onEndReached={() => { if (hasMore && !loadingMore && cursor) loadMore(cursor); }}
              onEndReachedThreshold={0.3}
              ListFooterComponent={loadingMore ? <ActivityIndicator size="small" color={colors.brandBlue} style={{ marginVertical: spacing[4] }} /> : null}
              renderItem={({ item: order }) => {
                const orderCases = activeCasesByOrder.get(order.publicId);
                return (
                  <Pressable
                    style={({ pressed }) => [st.orderCard, pressed && { opacity: 0.9 }]}
                    onPress={() => router.push(ROUTES.orderDetail(order.publicId))}
                  >
                    <View style={st.orderRow}>
                      <AppText variant="label">{t("accountOrders.orderLabel", { id: orderDisplayId(order) })}</AppText>
                      <View style={[st.statusBadge, { backgroundColor: order.status === "DELIVERED" ? colors.successLight : colors.brandBlueLight }]}>
                        <AppText variant="tiny" color={order.status === "DELIVERED" ? colors.success : colors.brandBlue} weight="bold">
                          {order.status.replace(/_/g, " ")}
                        </AppText>
                      </View>
                    </View>
                    <View style={st.orderRow}>
                      <AppText variant="caption">{formatDate(order.createdAt)}</AppText>
                      <AppText variant="priceSmall">{formatMoney(orderTotalCents(order))}</AppText>
                    </View>
                    <AppText variant="caption" style={st.itemCount}>
                      {t("accountOrders.itemCount", { count: orderItemCount(order) })}
                    </AppText>
                    {orderCases && orderCases.length > 0 && (
                      <View style={st.caseBadgeRow}>
                        <Icon name="flag" size={12} color={colors.warning} />
                        <AppText variant="tiny" color={colors.warning} weight="semibold">
                          {t("accountOrders.activeCases", { count: orderCases.length })}
                        </AppText>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </>
      )}

      {/* ── RETURNS TAB ── */}
      {activeTab === "returns" && (
        <>
          {returnsLoading ? (
            <ActivityIndicator size="large" color={colors.brandBlue} style={st.loader} />
          ) : returns.length === 0 ? (
            <View style={st.empty}>
              <Icon name="assignment-return" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted}>{t("accountOrders.noReturns")}</AppText>
              <AppText variant="caption" color={colors.muted} style={{ textAlign: "center", paddingHorizontal: spacing[8] }}>
                {t("accountOrders.returnsWillAppear")}
              </AppText>
            </View>
          ) : (
            <FlatList
              data={returns}
              keyExtractor={(r) => String(r.id)}
              contentContainerStyle={st.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: ret }) => {
                const returnStatus = getReturnStatusConfig(ret.status);
                const itemTitle = ret.orderItem?.title || "Item";
                const orderNum = ret.orderItem?.order?.orderNumber
                  ?? ret.orderItem?.order?.publicId?.slice(0, 8)
                  ?? "";
                const orderLabel = orderNum ? t("accountOrders.orderPrefix", { number: orderNum }) : "";

                return (
                  <View style={st.returnCard}>
                    <View style={st.orderRow}>
                      <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>
                        {itemTitle}
                      </AppText>
                      <View style={[st.statusBadge, { backgroundColor: returnStatus.bg }]}>
                        <AppText variant="tiny" color={returnStatus.fg} weight="bold">
                          {returnStatus.label}
                        </AppText>
                      </View>
                    </View>
                    {orderLabel ? (
                      <AppText variant="caption" color={colors.muted}>{orderLabel}</AppText>
                    ) : null}
                    <View style={st.returnMeta}>
                      <AppText variant="caption" color={colors.muted}>
                        {formatDate(ret.createdAt)}
                      </AppText>
                      {ret.reason && (
                        <AppText variant="caption" color={colors.muted}>
                          {ret.reason.replace(/_/g, " ")}
                        </AppText>
                      )}
                    </View>
                    {ret.status === "AWAITING_SHIPMENT" && ret.shipBy && (
                      <AppText variant="caption" color={colors.warning} style={{ marginTop: spacing[1] }}>
                        {t("accountOrders.shipBy", { date: formatDate(ret.shipBy) })}
                      </AppText>
                    )}
                  </View>
                );
              }}
            />
          )}
        </>
      )}

      {/* ── BUY AGAIN TAB ── */}
      {activeTab === "buyagain" && (
        <>
          {loading ? (
            <ActivityIndicator size="large" color={colors.brandBlue} style={st.loader} />
          ) : buyAgainItems.length === 0 ? (
            <View style={st.empty}>
              <Icon name="shopping-cart" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted}>{t("accountOrders.noDeliveredOrders")}</AppText>
              <AppText variant="caption" color={colors.muted} style={{ textAlign: "center", paddingHorizontal: spacing[8] }}>
                {t("accountOrders.buyAgainEmpty")}
              </AppText>
            </View>
          ) : (
            <FlatList
              data={buyAgainItems}
              numColumns={2}
              keyExtractor={(item) => item.productId || item.title}
              columnWrapperStyle={st.buyAgainRow}
              contentContainerStyle={st.list}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={st.buyAgainCard}>
                  <Image
                    source={{ uri: productImageUrl(item.image, "thumb") }}
                    style={st.buyAgainImg}
                    resizeMode="cover"
                  />
                  <AppText variant="label" numberOfLines={2} style={st.buyAgainTitle}>
                    {item.title}
                  </AppText>
                  <AppText variant="priceSmall" style={{ marginTop: spacing[0.5] }}>
                    {formatMoney(item.price)}
                  </AppText>
                  <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[0.5] }}>
                    {t("accountOrders.lastOrdered", { date: formatDate(item.lastOrderDate) })}
                  </AppText>
                  <Pressable
                    style={st.buyAgainBtn}
                    onPress={() => handleBuyAgainAddToCart(item)}
                  >
                    <Icon name="add-shopping-cart" size={14} color={colors.brandBlue} />
                    <AppText style={st.buyAgainBtnText}>{t("accountOrders.addToCart")}</AppText>
                  </Pressable>
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  tabBar: {
    flexDirection: "row", paddingHorizontal: spacing[4],
    paddingBottom: spacing[3], gap: spacing[2],
  },
  tab: {
    flex: 1, paddingVertical: spacing[2], borderRadius: borderRadius.full,
    alignItems: "center", backgroundColor: colors.slate100,
  },
  tabActive: { backgroundColor: colors.brandBlue },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.slate600 },
  tabTextActive: { color: colors.white },
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    paddingHorizontal: spacing[4], marginBottom: spacing[2],
  },
  searchInput: {
    flex: 1, flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing[3], height: 40, gap: spacing[2],
  },
  searchField: {
    flex: 1, fontSize: fontSize.sm, color: colors.foreground, paddingVertical: 0,
  },
  sortBtn: {
    width: 40, height: 40, borderRadius: borderRadius.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  sortOptions: {
    flexDirection: "row", gap: spacing[1.5],
    paddingHorizontal: spacing[4], marginBottom: spacing[3],
  },
  sortPill: {
    paddingHorizontal: spacing[3], paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  sortPillActive: {
    backgroundColor: colors.brandBlue, borderColor: colors.brandBlue,
  },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  orderCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4],
    marginBottom: spacing[3], ...shadows.sm,
  },
  orderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing[1] },
  statusBadge: { paddingHorizontal: spacing[2], paddingVertical: spacing[0.5], borderRadius: borderRadius.sm },
  itemCount: { marginTop: spacing[1] },
  caseBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    marginTop: spacing[2],
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.sm,
    alignSelf: "flex-start",
  },
  returnCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[4],
    marginBottom: spacing[3], ...shadows.sm,
  },
  returnMeta: {
    flexDirection: "row", justifyContent: "space-between", marginTop: spacing[1],
  },
  buyAgainRow: { gap: spacing[3] },
  buyAgainCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[3], marginBottom: spacing[3], ...shadows.sm,
  },
  buyAgainImg: { width: "100%", aspectRatio: 1, borderRadius: borderRadius.lg, marginBottom: spacing[2] },
  buyAgainTitle: { lineHeight: 18 },
  buyAgainBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing[1], marginTop: spacing[2],
    paddingVertical: spacing[1.5], borderRadius: borderRadius.lg,
    borderWidth: 1.5, borderColor: colors.brandBlue,
    backgroundColor: colors.brandBlueLight,
  },
  buyAgainBtnText: { fontSize: 12, fontWeight: "700", color: colors.brandBlue },
});
