import React, { useMemo } from "react";
import { View, ScrollView, Image, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import {
  formatDate,
  pickItemTitle,
  pickItemImage,
  pickUnitPriceCents,
  orderTotalCents,
  normalizeNumber,
} from "@/lib/orderHelpers";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { Order, OrderItem } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

const CANCELLABLE = ["PAID"];

function isCancellable(status?: string | null) {
  return CANCELLABLE.includes((status || "").toUpperCase());
}

function isItemBlocked(item: OrderItem): boolean {
  return (
    item.status === "CANCELLED" ||
    !!item.cancelledAt ||
    (Array.isArray(item.caseItems) && item.caseItems.length > 0)
  );
}

function pickVendorName(item: OrderItem): string | null {
  return item.vendorName || item.vendor?.name || null;
}

function pickVendorId(item: OrderItem): string | null {
  return item.vendor?.publicId || null;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "#fef3c7", text: "#d97706" },
  PAID: { bg: "#dbeafe", text: "#2563eb" },
  PROCESSING: { bg: "#dbeafe", text: "#2563eb" },
  SHIPPED: { bg: "#e0e7ff", text: "#4f46e5" },
  PARTIALLY_SHIPPED: { bg: "#e0e7ff", text: "#4f46e5" },
  DELIVERED: { bg: "#d1fae5", text: "#059669" },
  COMPLETED: { bg: "#d1fae5", text: "#059669" },
  CANCELLED: { bg: "#fee2e2", text: "#dc2626" },
  REFUNDED: { bg: "#fee2e2", text: "#dc2626" },
  ON_HOLD: { bg: "#fef3c7", text: "#d97706" },
};

const PAYMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PAID: { bg: "#d1fae5", text: "#059669" },
  PENDING: { bg: "#fef3c7", text: "#d97706" },
  UNPAID: { bg: "#fef3c7", text: "#d97706" },
};

// ─── Component ────────────────────────────────────────────────────────────

export default function OrderDetailScreen() {
  return (
    <RequireAuth>
      <OrderDetailContent />
    </RequireAuth>
  );
}

function OrderDetailContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: rawOrder, isLoading: loading } = useQuery({
    queryKey: queryKeys.orders.detail(id!),
    queryFn: () => customerFetch<Order>(`/orders/${id}`),
    enabled: !!id,
  });

  // Normalize: backend may send cases as `customerOrderCases`
  const order = useMemo(() => {
    if (!rawOrder) return null;
    const o = { ...rawOrder };
    if (!o.cases && Array.isArray(o.customerOrderCases)) {
      o.cases = o.customerOrderCases;
    }
    return o;
  }, [rawOrder]);

  // ── Computed values ──
  const computed = useMemo(() => {
    if (!order) return null;
    const currency = (order.currency || "USD").toUpperCase();

    const subtotal = normalizeNumber(order.subtotalAmount);
    const shipping = normalizeNumber(order.shippingAmount);
    const tax = normalizeNumber(order.taxAmount);
    const discount = normalizeNumber(order.discountAmount);
    const total = normalizeNumber(order.totalAmount);

    // If we don't have subtotal from API, compute from items
    const itemsSubtotal =
      subtotal ??
      (order.items || []).reduce((sum, it) => {
        const unit = normalizeNumber(it.unitPrice) ?? 0;
        const qty = it.quantity ?? 0;
        return sum + unit * qty;
      }, 0);

    const paymentStatus = order.paymentStatus || null;
    const pmType =
      order.paymentMethodType ||
      order.paymentMethod?.type ||
      null;
    const brand =
      order.cardBrand ||
      order.paymentMethod?.brand ||
      null;
    const last4 =
      order.cardLast4 ||
      order.paymentMethod?.last4 ||
      null;

    return {
      currency,
      subtotal: itemsSubtotal,
      shipping,
      tax,
      discount,
      total: total ?? itemsSubtotal + (shipping ?? 0) + (tax ?? 0) - (discount ?? 0),
      paymentStatus,
      pmType,
      brand,
      last4,
    };
  }, [order]);

  // ── Loading state ──
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <View style={styles.spinner} />
        <AppText variant="caption" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {t("orders.loadingOrder")}
        </AppText>
      </View>
    );
  }

  // ── Not found ──
  if (!order || !computed) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {t("orders.notFound")}
        </AppText>
        <AppButton
          title={t("orders.goBack")}
          variant="outline"
          onPress={() => router.back()}
          style={{ marginTop: spacing[4] }}
        />
      </View>
    );
  }

  const statusUpper = (order.status || "").toUpperCase();
  const statusColor = STATUS_COLORS[statusUpper] || STATUS_COLORS.PENDING;
  const items = order.items ?? [];
  const allBlocked = items.length > 0 && items.every(isItemBlocked);
  const noItemsShipped = !items.some((item) =>
    (item.shipmentItems ?? []).some((si) => si.shipment?.direction === "OUTBOUND"),
  );
  const cases = order.cases ?? [];
  const addr = order.shippingAddress;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("orders.orderHeading", { id: order.orderNumber || (order.publicId ?? "").slice(0, 8) })}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Order Header Card ── */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <AppText variant="caption" weight="bold" style={[styles.statusBadgeText, { color: statusColor.text }]}>
                {statusUpper.replace(/_/g, " ")}
              </AppText>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <AppText variant="caption" color={colors.slate400} weight="bold" style={styles.miniLabel}>
                {t("orders.placedLabel")}
              </AppText>
              <AppText variant="heading" weight="bold" style={styles.headerValue}>
                {formatDate(order.createdAt)}
              </AppText>
            </View>
          </View>
        </View>

        {/* ── Actions Card ── */}
        <View style={styles.card}>
          <AppText variant="caption" color={colors.slate400} weight="bold" style={styles.sectionLabel}>
            {t("orders.actionsTitle")}
          </AppText>

          <ActionButton
            icon="local-shipping"
            label={t("orders.trackPackage")}
            variant="primary"
            onPress={() => router.push(ROUTES.orderTracking(id))}
          />

          {statusUpper === "DELIVERED" && !allBlocked ? (
            <ActionButton
              icon="assignment-return"
              label={t("orders.returnItems")}
              variant="outline"
              onPress={() => router.push(ROUTES.orderReturn(id))}
            />
          ) : (
            <ActionButton
              icon="assignment-return"
              label={t("orders.returnItems")}
              variant="disabled"
            />
          )}

          {["SHIPPED", "DELIVERED"].includes(statusUpper) && !allBlocked && !noItemsShipped ? (
            <ActionButton
              icon="inventory"
              label={t("orders.missingPackage")}
              variant="outline"
              onPress={() => router.push(ROUTES.orderMissing(id))}
            />
          ) : (
            <ActionButton
              icon="inventory"
              label={t("orders.missingPackage")}
              variant="disabled"
            />
          )}

          <ActionButton
            icon="chat"
            label={t("orders.messageSeller")}
            variant="accent"
            onPress={() => router.push(ROUTES.supportMessageSeller(id))}
          />

          {isCancellable(order.status) && !allBlocked && (
            <ActionButton
              icon="cancel"
              label={t("orders.cancelItems")}
              variant="danger"
              onPress={() => router.push(ROUTES.orderCancel(id))}
            />
          )}

          {statusUpper === "DELIVERED" && (
            <ActionButton
              icon="star"
              label={t("orders.writeReview")}
              variant="outline"
              onPress={() => router.push(ROUTES.orderReview(id))}
            />
          )}
        </View>

        {/* ── Cases ── */}
        {cases.length > 0 && (
          <View style={styles.card}>
            <AppText variant="caption" color={colors.slate400} weight="bold" style={styles.sectionLabel}>
              {t("orders.openCases", { count: cases.length })}
            </AppText>
            {cases.map((c, idx) => {
              const caseStatus = (c.status || "").toUpperCase();
              const isResolved = caseStatus === "RESOLVED" || caseStatus === "RESOLVED_GRACE";
              const isClosed = caseStatus === "CLOSED";
              const caseStatusLabel = isResolved
                ? t("orders.caseResolved")
                : isClosed
                  ? t("orders.caseClosed")
                  : t("orders.caseInReview");
              const caseStatusColor = isResolved
                ? colors.success
                : isClosed
                  ? colors.gray400
                  : colors.warning;
              const isLast = idx === cases.length - 1;

              return (
                <Pressable
                  key={c.caseNumber}
                  style={[styles.caseRow, !isLast && styles.caseRowBorder]}
                  onPress={() => router.push(ROUTES.orderCase(id, c.caseNumber))}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="body" weight="semibold">
                      {c.resolutionIntent?.replace(/_/g, " ") || t("orders.caseFallback")}
                    </AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {formatDate(c.createdAt)}
                    </AppText>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[1] }}>
                    <AppText variant="caption" weight="bold" color={caseStatusColor}>
                      {caseStatusLabel}
                    </AppText>
                    <Icon name="chevron-right" size={18} color={colors.gray300} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* ── Items ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <AppText variant="caption" color={colors.slate400} weight="bold" style={styles.sectionLabel}>
              {t("orders.itemsTitle")} ({items.length})
            </AppText>
            <Icon name="inventory-2" size={22} color={colors.brandOrange} />
          </View>

          {items.map((item, idx) => {
            const img = pickItemImage(item);
            const title = pickItemTitle(item);
            const vendor = pickVendorName(item);
            const vendorId = pickVendorId(item);
            const unitCents = pickUnitPriceCents(item);
            const qty = item.quantity ?? 0;
            const lineTotalCents = unitCents * qty;
            const isLast = idx === items.length - 1;

            return (
              <View key={item.publicId ?? String(idx)} style={[styles.itemRow, !isLast && styles.itemRowBorder]}>
                <Pressable
                  style={styles.itemImgWrap}
                  onPress={() => {
                    const pid = item.productVariant?.product?.productId;
                    if (pid) router.push(ROUTES.product(pid));
                  }}
                >
                  {img ? (
                    <Image
                      source={{ uri: productImageUrl(img, "thumb") }}
                      style={styles.itemImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Icon name="image" size={28} color={colors.slate300} />
                  )}
                </Pressable>
                <View style={styles.itemInfo}>
                  <Pressable
                    onPress={() => {
                      const pid = item.productVariant?.product?.productId;
                      if (pid) router.push(ROUTES.product(pid));
                    }}
                  >
                    <AppText variant="body" weight="bold" numberOfLines={2}>
                      {title}
                    </AppText>
                  </Pressable>
                  {vendor && (
                    <Pressable
                      onPress={() => {
                        if (vendorId) router.push(ROUTES.vendor(vendorId));
                      }}
                    >
                      <AppText variant="caption" color={colors.muted}>
                        {t("orders.soldBy")}{" "}
                        <AppText variant="caption" color={colors.brandBlue} weight="semibold">
                          {vendor}
                        </AppText>
                      </AppText>
                    </Pressable>
                  )}
                  <AppText variant="caption" color={colors.slate500} style={{ marginTop: spacing[0.5] }}>
                    {t("orders.qtyLabel", { count: qty })}
                    {unitCents > 0 && ` · ${formatMoney(unitCents)} ${t("orders.each")}`}
                  </AppText>
                  <AppText variant="body" weight="bold" style={{ marginTop: spacing[1] }}>
                    {formatMoney(lineTotalCents)}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Order Summary ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Icon name="receipt-long" size={22} color={colors.brandOrange} />
            <AppText variant="caption" color={colors.slate400} weight="bold" style={styles.sectionLabel}>
              {t("orders.orderSummary")}
            </AppText>
          </View>

          <SummaryRow label={t("orders.subtotal")} value={formatMoney(Math.round(computed.subtotal * 100))} />
          <SummaryRow
            label={t("orders.shipping")}
            value={
              computed.shipping === null || computed.shipping === 0
                ? t("orders.shippingFree")
                : formatMoney(Math.round(computed.shipping * 100))
            }
            valueColor={computed.shipping === null || computed.shipping === 0 ? colors.success : undefined}
            valueBold={computed.shipping === null || computed.shipping === 0}
          />
          <SummaryRow
            label={t("orders.tax")}
            value={computed.tax === null ? "—" : formatMoney(Math.round(computed.tax * 100))}
          />
          {computed.discount !== null && computed.discount > 0 && (
            <SummaryRow
              label={t("orders.discount")}
              value={`- ${formatMoney(Math.round(computed.discount * 100))}`}
              valueColor={colors.success}
            />
          )}
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <AppText variant="subtitle" weight="bold">{t("orders.total")}</AppText>
            <AppText variant="heading" weight="bold" color={colors.brandBlue}>
              {formatMoney(Math.round(computed.total * 100))}
            </AppText>
          </View>
        </View>

        {/* ── Shipping Address ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Icon name="location-on" size={22} color={colors.brandOrange} />
            <AppText variant="caption" color={colors.slate400} weight="bold" style={styles.sectionLabel}>
              {t("orders.shippingAddress")}
            </AppText>
          </View>

          {addr ? (
            <View style={{ gap: spacing[1] }}>
              <AppText variant="body" weight="bold">
                {addr.fullName ||
                  `${addr.firstName || ""} ${addr.lastName || ""}`.trim() ||
                  "—"}
              </AppText>
              <AppText variant="body" color={colors.slate600}>{addr.line1 || "—"}</AppText>
              {addr.line2 ? (
                <AppText variant="body" color={colors.slate600}>{addr.line2}</AppText>
              ) : null}
              <AppText variant="body" color={colors.slate600}>
                {addr.city || "—"}, {addr.state || "—"} {addr.postalCode || "—"}
              </AppText>
              <AppText variant="body" color={colors.slate600}>{addr.country || "—"}</AppText>
            </View>
          ) : (
            <AppText variant="body" color={colors.muted}>{t("orders.addressNotAvailable")}</AppText>
          )}
        </View>

        {/* ── Payment Information ── */}
        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Icon name="payments" size={22} color={colors.brandOrange} />
            <AppText variant="caption" color={colors.slate400} weight="bold" style={styles.sectionLabel}>
              {t("orders.paymentInfo")}
            </AppText>
          </View>

          {/* Payment status */}
          <View style={styles.paymentRow}>
            <AppText variant="body" color={colors.muted}>{t("orders.paymentStatus")}</AppText>
            {(() => {
              const ps = (computed.paymentStatus || "PENDING").toUpperCase();
              const psColor = PAYMENT_STATUS_COLORS[ps] || PAYMENT_STATUS_COLORS.PENDING;
              return (
                <View style={[styles.paymentBadge, { backgroundColor: psColor.bg }]}>
                  <AppText variant="caption" weight="bold" style={{ color: psColor.text }}>
                    {ps}
                  </AppText>
                </View>
              );
            })()}
          </View>

          {/* Payment method */}
          <View style={styles.paymentRow}>
            <AppText variant="body" color={colors.muted}>{t("orders.paymentMethod")}</AppText>
            <AppText variant="body">
              {computed.pmType || computed.brand || computed.last4
                ? [
                    computed.pmType ? computed.pmType.toUpperCase() : null,
                    computed.brand ? computed.brand.toUpperCase() : null,
                    computed.last4 ? `•••• ${computed.last4}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "—"}
            </AppText>
          </View>

          {/* Paid at */}
          <View style={styles.paymentRow}>
            <AppText variant="body" color={colors.muted}>{t("orders.paidAt")}</AppText>
            <AppText variant="body">{order.paidAt ? formatDate(order.paidAt) : "—"}</AppText>
          </View>
        </View>

        <View style={{ height: spacing[6] }} />
      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function ActionButton({
  icon,
  label,
  variant,
  onPress,
}: {
  icon: string;
  label: string;
  variant: "primary" | "accent" | "outline" | "danger" | "disabled";
  onPress?: () => void;
}) {
  const bgMap = {
    primary: colors.brandBlue,
    accent: colors.brandOrange,
    outline: colors.white,
    danger: colors.white,
    disabled: colors.slate50,
  };
  const textMap = {
    primary: colors.white,
    accent: colors.white,
    outline: colors.brandBlue,
    danger: colors.error,
    disabled: colors.gray400,
  };
  const borderMap = {
    primary: colors.brandBlue,
    accent: colors.brandOrange,
    outline: colors.slate200,
    danger: colors.error,
    disabled: colors.slate200,
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: pressed && variant !== "disabled" ? colors.gray50 : bgMap[variant],
          borderColor: borderMap[variant],
        },
        (variant === "primary" || variant === "accent") && shadows.sm,
      ]}
      onPress={variant === "disabled" ? undefined : onPress}
      disabled={variant === "disabled"}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
        <Icon name={icon} size={22} color={textMap[variant]} />
        <AppText variant="body" weight="semibold" color={textMap[variant]}>
          {label}
        </AppText>
      </View>
      {variant !== "disabled" && (
        <Icon name="chevron-right" size={18} color={textMap[variant]} style={{ opacity: 0.6 }} />
      )}
    </Pressable>
  );
}

function SummaryRow({
  label,
  value,
  valueColor,
  valueBold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  valueBold?: boolean;
}) {
  return (
    <View style={styles.summaryRow}>
      <AppText variant="body" color={colors.slate600}>{label}</AppText>
      <AppText
        variant="body"
        weight={valueBold ? "bold" : "medium"}
        color={valueColor || colors.foreground}
      >
        {value}
      </AppText>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.brandBlue,
    borderTopColor: colors.transparent,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[10],
  },

  // Cards
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    marginBottom: spacing[3],
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },

  // Order header
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  miniLabel: {
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: spacing[1],
    fontSize: 12,
  },
  headerValue: {
    fontSize: 20,
    letterSpacing: -0.3,
  },

  // Status badge
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
  },
  statusBadgeText: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  // Section labels
  sectionLabel: {
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontSize: 12,
    marginBottom: spacing[3],
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  // Actions
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3.5],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing[2],
  },

  // Cases
  caseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing[3],
  },
  caseRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },

  // Items
  itemRow: {
    flexDirection: "row",
    gap: spacing[4],
    paddingVertical: spacing[4],
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemImgWrap: {
    width: 84,
    height: 84,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: "hidden",
  },
  itemImg: {
    width: "100%",
    height: "100%",
  },
  itemInfo: {
    flex: 1,
    justifyContent: "space-between",
  },

  // Summary
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing[1.5],
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing[2],
    borderStyle: "dashed",
  },

  // Payment
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing[2],
  },
  paymentBadge: {
    paddingHorizontal: spacing[2.5],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.md,
  },
});
