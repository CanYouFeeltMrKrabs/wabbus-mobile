import React, { useMemo } from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Pressable,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import i18n from "@/i18n";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { useQuery } from "@tanstack/react-query";
import { customerFetch } from "@/lib/api";
import { FALLBACK_IMAGE } from "@/lib/config";
import { formatMoney } from "@/lib/money";
import { buildCarrierTrackingUrl } from "@/lib/carrierTrackingUrl";
import { formatDateLong, formatDateShort } from "@/lib/orderHelpers";
import { queryKeys } from "@/lib/queryKeys";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type Shipment = {
  id: number;
  publicId?: string;
  direction: string;
  purpose?: string | null;
  status: string;
  carrier: string;
  carrierService?: string | null;
  trackingNumber: string;
  trackingUrl?: string | null;
  labelCreatedAt?: string | null;
  shippedAt?: string | null;
  estimatedDelivery?: string | null;
  deliveredAt?: string | null;
  signedBy?: string | null;
};

type OrderItemAPI = {
  id: number;
  publicId?: string;
  quantity: number;
  unitPrice?: string | number;
  unitPriceCents?: number;
  status?: string;
  title?: string;
  image?: string | null;
  productVariant?: {
    title?: string | null;
    product?: { title?: string | null; imageUrl?: string | null; images?: { url: string }[] | null } | null;
    imageUrl?: string | null;
  } | null;
  shipmentItems?: { shipment: Shipment }[];
};

type OrderAPI = {
  id: number;
  publicId: string;
  orderNumber?: string | null;
  status: string;
  items?: OrderItemAPI[];
};

const STATUS_STEP: Record<string, number> = {
  LABEL_CREATED: 0,
  PENDING_PICKUP: 0,
  IN_TRANSIT: 1,
  OUT_FOR_DELIVERY: 2,
  DELIVERED: 3,
};

const STEP_ICONS = ["check-circle", "local-shipping", "delivery-dining", "home"];

function getItemTitle(item: OrderItemAPI): string {
  return (
    item.title ||
    item.productVariant?.product?.title ||
    item.productVariant?.title ||
    i18n.t("orders.tracking.itemFallback")
  );
}

function getItemImage(item: OrderItemAPI): string {
  return (
    item.image ||
    item.productVariant?.imageUrl ||
    item.productVariant?.product?.imageUrl ||
    item.productVariant?.product?.images?.[0]?.url ||
    FALLBACK_IMAGE
  );
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return i18n.t("orders.tracking.today");
  if (diff === 1) return i18n.t("orders.tracking.tomorrow");
  if (diff === -1) return i18n.t("orders.tracking.yesterday");
  if (diff > 1 && diff <= 6) return d.toLocaleDateString("en-US", { weekday: "long" });
  return formatDateShort(iso);
}

function statusSubtitle(s: Shipment): string {
  if (s.status === "DELIVERED" && s.deliveredAt) {
    return i18n.t("orders.tracking.deliveredOn", { date: formatDateLong(s.deliveredAt) });
  }
  if (s.status === "OUT_FOR_DELIVERY") return i18n.t("orders.tracking.arrivingToday");
  if (s.status === "IN_TRANSIT" && s.estimatedDelivery) {
    return i18n.t("orders.tracking.estimated", { date: formatRelativeDate(s.estimatedDelivery) });
  }
  if (s.shippedAt) {
    return i18n.t("orders.tracking.shippedOn", { date: formatDateLong(s.shippedAt) });
  }
  return i18n.t("orders.tracking.preparingOrder");
}

export default function TrackingScreen() {
  return <RequireAuth><TrackingContent /></RequireAuth>;
}

function TrackingContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const STEP_LABELS = [
    t("orders.tracking.stepOrdered"),
    t("orders.tracking.stepShipped"),
    t("orders.tracking.stepOutForDelivery"),
    t("orders.tracking.stepDelivered"),
  ];
  const { data: order, isLoading: loading } = useQuery({
    queryKey: queryKeys.orders.detail(id!),
    queryFn: () => customerFetch<OrderAPI>(`/orders/${id}`),
    enabled: !!id,
  });

  const shipment = useMemo(() => {
    if (!order?.items) return null;
    const seen = new Set<string>();
    const all: Shipment[] = [];
    for (const item of order.items) {
      for (const si of item.shipmentItems || []) {
        if (!si.shipment) continue;
        const key = si.shipment.publicId || si.shipment.trackingNumber || String(si.shipment.id);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(si.shipment);
      }
    }
    return all.find((s) => s.direction === "OUTBOUND") || all[0] || null;
  }, [order]);

  const trackingUrl = useMemo(() => {
    if (!shipment) return null;
    return shipment.trackingUrl || buildCarrierTrackingUrl(shipment.carrier, shipment.trackingNumber);
  }, [shipment]);

  const step = shipment ? STATUS_STEP[shipment.status] ?? 0 : 0;
  const isDelivered = shipment?.status === "DELIVERED";

  const packageItems = useMemo(() => {
    if (!shipment || !order?.items) return [];
    const activeKey = shipment.publicId || shipment.trackingNumber || String(shipment.id);
    const itemIds = new Set<string | number>();
    for (const item of order.items) {
      for (const si of item.shipmentItems || []) {
        if (!si.shipment) continue;
        const k = si.shipment.publicId || si.shipment.trackingNumber || String(si.shipment.id);
        if (k === activeKey) itemIds.add(item.publicId ?? item.id);
      }
    }
    return order.items.filter((it) => itemIds.has(it.publicId ?? it.id));
  }, [shipment, order]);

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
        <AppText variant="subtitle" color={colors.muted}>{t("orders.notFound")}</AppText>
        <AppButton title={t("orders.goBack")} variant="outline" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  const displayOrder = order.orderNumber || `#${order.publicId?.slice(0, 8)}`;

  if (!shipment) {
    const st = (order.status || "").toUpperCase();
    const isCancelled = st === "CANCELLED";
    const isPaid = st === "PAID" || st === "PROCESSING";
    const noShipTitle = isCancelled
      ? t("orders.tracking.orderCancelled")
      : isPaid
        ? t("orders.tracking.beingPrepared")
        : t("orders.tracking.trackingUnavailable");
    const noShipSub = isCancelled
      ? t("orders.tracking.orderCancelledSub")
      : isPaid
        ? t("orders.tracking.beingPreparedSub")
        : t("orders.tracking.trackingUnavailableSub");
    const noShipIcon = isCancelled ? "cancel" : isPaid ? "inventory-2" : "local-shipping";

    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
          <AppText variant="title">{t("orders.tracking.heading")}</AppText>
          <View style={{ width: 44 }} />
        </View>
        <View style={styles.noShipCard}>
          <Icon name={noShipIcon} size={48} color={colors.slate300} />
          <AppText variant="subtitle" style={styles.noShipTitle}>{noShipTitle}</AppText>
          <AppText variant="caption" color={colors.muted} style={{ textAlign: "center" }}>{noShipSub}</AppText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">{t("orders.tracking.heading")}</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero: estimated delivery */}
        <View style={styles.heroCard}>
          <AppText style={styles.heroLabel}>
            {isDelivered ? t("orders.tracking.delivered") : t("orders.tracking.estimatedDelivery")}
          </AppText>
          <AppText style={styles.heroBig}>
            {isDelivered
              ? t("orders.tracking.deliveredLabel")
              : shipment.estimatedDelivery
                ? formatRelativeDate(shipment.estimatedDelivery)
                : t("orders.tracking.pending")}
          </AppText>
          {!isDelivered && shipment.estimatedDelivery && (
            <AppText style={styles.heroSub}>
              {formatDateLong(shipment.estimatedDelivery)}
            </AppText>
          )}
          {isDelivered && shipment.deliveredAt && (
            <AppText style={styles.heroSub}>
              {formatDateLong(shipment.deliveredAt)}
            </AppText>
          )}
        </View>

        {/* Status + Progress */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusIcon}>
              <Icon name={isDelivered ? "check-circle" : "local-shipping"} size={28} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText style={styles.statusTitle}>
                {shipment.status.replace(/_/g, " ")}
              </AppText>
              <AppText variant="caption" color={colors.slate500}>
                {statusSubtitle(shipment)}
              </AppText>
            </View>
          </View>

          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${[12, 40, 75, 100][step]}%` as any },
                ]}
              />
            </View>
            <View style={styles.stepsRow}>
              {STEP_LABELS.map((label, i) => (
                <View key={label} style={styles.stepItem}>
                  <View style={[styles.stepDot, i <= step && styles.stepDotActive]} />
                  <AppText
                    style={[
                      styles.stepLabel,
                      i === step && styles.stepLabelActive,
                      i < step && styles.stepLabelDone,
                    ]}
                  >
                    {label}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Tracking ID + Carrier */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="label" color={colors.slate500} style={styles.infoLabel}>
                {t("orders.tracking.trackingId")}
              </AppText>
              <AppText style={styles.infoValue}>{shipment.trackingNumber}</AppText>
            </View>
            {trackingUrl && (
              <Pressable
                style={styles.trackBtn}
                onPress={() => Linking.openURL(trackingUrl)}
              >
                <Icon name="map" size={16} color={colors.brandBlue} />
                <AppText style={styles.trackBtnText}>{t("orders.tracking.track")}</AppText>
              </Pressable>
            )}
          </View>

          <View style={styles.infoDivider} />

          <View>
            <AppText variant="label" color={colors.slate500} style={styles.infoLabel}>
              {t("orders.tracking.carrier")}
            </AppText>
            <View style={styles.carrierRow}>
              <View style={styles.carrierIcon}>
                <Icon name="inventory-2" size={20} color={colors.slate500} />
              </View>
              <View>
                <AppText style={styles.carrierName}>{shipment.carrier}</AppText>
                <AppText variant="caption" color={colors.slate500}>
                  {shipment.carrierService || t("orders.tracking.standardDelivery")}
                </AppText>
              </View>
            </View>
            {isDelivered && shipment.signedBy && (
              <View style={styles.signedRow}>
                <Icon name="verified" size={14} color={colors.slate400} />
                <AppText variant="caption" color={colors.slate500}>
                  {t("orders.tracking.signedBy", { name: shipment.signedBy })}
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* Package contents */}
        {packageItems.length > 0 && (
          <View style={styles.packageCard}>
            <View style={styles.packageHeader}>
              <Icon name="inventory" size={18} color={colors.brandBlue} />
              <AppText style={styles.packageTitle}>
                {t("orders.tracking.packageContains", { count: packageItems.length })}
              </AppText>
            </View>
            {packageItems.map((item, idx) => (
              <View key={item.publicId ?? idx} style={styles.packageItem}>
                <Image
                  source={{ uri: getItemImage(item) }}
                  style={styles.packageItemImg}
                  resizeMode="cover"
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="label" numberOfLines={2}>{getItemTitle(item)}</AppText>
                  <AppText variant="caption" color={colors.slate500}>{t("orders.qtyLabel", { count: item.quantity })}</AppText>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },

  heroCard: { alignItems: "center", paddingVertical: spacing[6], marginBottom: spacing[4] },
  heroLabel: {
    fontSize: 11, fontWeight: "700", letterSpacing: 2, color: colors.slate500,
    textTransform: "uppercase", marginBottom: spacing[1],
  },
  heroBig: { fontSize: 36, fontWeight: "900", color: colors.brandOrange },
  heroSub: { fontSize: 18, fontWeight: "500", color: colors.slate700, marginTop: spacing[0.5] },

  statusCard: {
    backgroundColor: colors.card, borderRadius: borderRadius["2xl"],
    padding: spacing[5], marginBottom: spacing[4], ...shadows.lg,
  },
  statusHeader: { flexDirection: "row", alignItems: "center", gap: spacing[3], marginBottom: spacing[5] },
  statusIcon: {
    width: 52, height: 52, borderRadius: borderRadius.xl,
    backgroundColor: colors.brandBlue, alignItems: "center", justifyContent: "center",
    ...shadows.md,
  },
  statusTitle: { fontSize: 20, fontWeight: "800", color: colors.foreground },

  progressContainer: { gap: spacing[3] },
  progressTrack: {
    height: 6, borderRadius: 3, backgroundColor: colors.slate100, overflow: "hidden",
  },
  progressFill: {
    height: "100%", borderRadius: 3,
    backgroundColor: colors.brandBlue,
  },
  stepsRow: { flexDirection: "row", justifyContent: "space-between" },
  stepItem: { alignItems: "center", gap: spacing[1], flex: 1 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.slate200 },
  stepDotActive: { backgroundColor: colors.brandBlue },
  stepLabel: { fontSize: 9, fontWeight: "700", color: colors.slate400, textTransform: "uppercase", textAlign: "center" },
  stepLabelActive: { color: colors.brandOrange },
  stepLabelDone: { color: colors.brandBlue },

  infoCard: {
    backgroundColor: colors.card, borderRadius: borderRadius["2xl"],
    padding: spacing[5], marginBottom: spacing[4], ...shadows.sm,
  },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  infoLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.5, marginBottom: spacing[1] },
  infoValue: { fontSize: 15, fontWeight: "700", color: colors.foreground },
  trackBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing[1],
    paddingHorizontal: spacing[3], paddingVertical: spacing[1.5],
    borderRadius: borderRadius.full, borderWidth: 1,
    borderColor: "rgba(45,78,207,0.2)", backgroundColor: "rgba(45,78,207,0.05)",
  },
  trackBtnText: { fontSize: 13, fontWeight: "700", color: colors.brandBlue },
  infoDivider: { height: 1, backgroundColor: colors.slate100, marginVertical: spacing[4] },
  carrierRow: { flexDirection: "row", alignItems: "center", gap: spacing[3], marginTop: spacing[1] },
  carrierIcon: {
    width: 40, height: 40, borderRadius: borderRadius.full,
    backgroundColor: colors.slate100, alignItems: "center", justifyContent: "center",
  },
  carrierName: { fontSize: 14, fontWeight: "700", color: colors.foreground },
  signedRow: {
    flexDirection: "row", alignItems: "center", gap: spacing[1],
    marginTop: spacing[3], paddingTop: spacing[3],
    borderTopWidth: 1, borderTopColor: colors.slate100,
  },

  packageCard: {
    backgroundColor: "rgba(45,78,207,0.03)", borderRadius: borderRadius["2xl"],
    padding: spacing[5], borderWidth: 1, borderColor: "rgba(45,78,207,0.1)",
  },
  packageHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: spacing[4],
  },
  packageTitle: { fontSize: 13, fontWeight: "800", color: colors.brandBlue, textTransform: "uppercase" },
  packageItem: {
    flexDirection: "row", alignItems: "center", gap: spacing[3],
    backgroundColor: "rgba(255,255,255,0.5)", borderRadius: borderRadius.xl,
    padding: spacing[3], marginBottom: spacing[2],
  },
  packageItemImg: { width: 56, height: 56, borderRadius: borderRadius.lg },

  noShipCard: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: spacing[8], gap: spacing[3],
  },
  noShipTitle: { marginTop: spacing[2] },
});
