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
  Linking,
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
import { getOrderStatusConfig, getReturnStatusConfig } from "@/lib/orderStatus";
import {
  formatDate,
  normalizeNumber,
  pickItemTitle,
  pickItemImage,
  pickUnitPriceCents,
  orderTotalCents,
} from "@/lib/orderHelpers";
import { buildCarrierTrackingUrl } from "@/lib/carrierTrackingUrl";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import { SkeletonOrderCard } from "@/components/ui/Skeleton";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { Order, OrderItem, PublicProduct, ReturnRequest } from "@/lib/types";
import ProductRecommendationSlider from "@/components/ui/ProductRecommendationSlider";
import {
  progressIndex,
  isCancellable,
  isAllowedToReview,
  returnProgressIndex,
  pickReturnItemImage,
  pickReturnCaseItemImage,
} from "./helpers";
import {
  PROGRESS_STEPS,
  RETURN_PROGRESS_STEPS,
  RETURN_STATUS_GRADIENTS,
} from "./constants";

type Tab = "orders" | "returns" | "buyagain";
type SortBy = "newest" | "oldest" | "total-high" | "total-low";

type ReturnInfo = {
  id?: string | number;
  status: string;
  labelUrl: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  shipBy: string | null;
};

type ReplacementInfo = {
  caseNumber: string;
  status: string;
  resolutionIntent: string;
};

type CaseLite = {
  caseNumber: string;
  status: string;
  resolutionIntent: string;
  order: { publicId?: string };
};

type BuyAgainItem = {
  productId: string;
  variantPublicId: string;
  title: string;
  variantLabel?: string;
  image: string;
  price: number;
  lastOrderDate: string;
};

// ─── Helpers ─────────────────────────────────────────────────

function pickVariantLabel(it: OrderItem): string | undefined {
  const vt = it.productVariant?.title?.trim();
  return vt && vt !== "Default" ? vt : undefined;
}

function pickVendorName(it: OrderItem): string | null {
  return (
    it.vendorName ??
    it.vendor?.name ??
    null
  );
}

function extractBuyAgainItems(orders: Order[]): BuyAgainItem[] {
  const seen = new Set<string>();
  const items: BuyAgainItem[] = [];
  const delivered = orders.filter(
    (o) => o.status === "DELIVERED" || o.status === "COMPLETED",
  );

  for (const order of delivered) {
    if (!order.items) continue;
    for (const item of order.items) {
      const pid = item.productVariant?.product?.productId ?? item.publicId;
      const key = pid ?? pickItemTitle(item);
      if (seen.has(key)) continue;
      seen.add(key);
      const vt = item.productVariant?.title?.trim();
      items.push({
        productId: pid ?? "",
        variantPublicId: item.productVariant?.publicId ?? "",
        title: pickItemTitle(item),
        variantLabel: vt && vt !== "Default" ? vt : undefined,
        image: pickItemImage(item) ?? "",
        price: pickUnitPriceCents(item),
        lastOrderDate: order.createdAt,
      });
    }
  }
  return items;
}

const ACTIVE_CASE_STATUSES = [
  "OPEN",
  "AWAITING_VENDOR",
  "AWAITING_CUSTOMER",
  "AWAITING_SUPPORT",
  "IN_PROGRESS",
  "OPEN_PENDING_FLAG_OR_DECISION",
];

const TERMINAL_RETURN_STATUSES = [
  "CLOSED",
  "CLOSED_EXPIRED",
  "REFUNDED",
  "CREDITED",
];

// ─── Progress Bar ────────────────────────────────────────────

function ProgressBar({
  steps,
  currentStep,
  terminal = false,
}: {
  steps: string[];
  currentStep: number;
  terminal?: boolean;
}) {
  return (
    <View style={st.progressRow}>
      {steps.map((step, i) => {
        const done = i <= currentStep;
        const isCurrent = i === currentStep && !terminal;
        const dimmed = terminal && i > currentStep;
        return (
          <View key={step} style={st.progressStep}>
            {i > 0 && (
              <View
                style={[
                  st.progressLine,
                  {
                    backgroundColor:
                      i <= currentStep && !dimmed
                        ? colors.brandOrange
                        : colors.slate200,
                  },
                ]}
              />
            )}
            <View
              style={[
                st.progressDot,
                done && !dimmed && st.progressDotDone,
                isCurrent && st.progressDotCurrent,
              ]}
            >
              {done && !dimmed ? (
                <Icon name="check" size={10} color={colors.white} />
              ) : (
                <AppText
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: colors.slate400,
                  }}
                >
                  {i + 1}
                </AppText>
              )}
            </View>
            <AppText
              style={[
                st.progressLabel,
                {
                  color:
                    done && !dimmed ? colors.brandOrange : colors.slate400,
                },
              ]}
              numberOfLines={1}
            >
              {step}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

// ─── Status Pill ─────────────────────────────────────────────

function StatusPill({
  order,
  returns,
  replacements,
}: {
  order: Order;
  returns: ReturnInfo[];
  replacements: ReplacementInfo[];
}) {
  const { t } = useTranslation();

  const hasLabelReady = returns.some(
    (r) => r.status === "AWAITING_SHIPMENT",
  );
  const hasActiveReturn = returns.length > 0;
  const hasActiveReplacement = replacements.length > 0;

  if (hasLabelReady) {
    return (
      <View style={[st.gradientPill, { backgroundColor: "#7c3aed" }]}>
        <AppText style={st.gradientPillText}>
          {t("accountOrders.labelReady")}
        </AppText>
      </View>
    );
  }
  if (hasActiveReturn) {
    return (
      <View style={[st.gradientPill, { backgroundColor: "#d97706" }]}>
        <AppText style={st.gradientPillText}>
          {t("accountOrders.returnOpen")}
        </AppText>
      </View>
    );
  }
  if (hasActiveReplacement) {
    return (
      <View style={[st.gradientPill, { backgroundColor: "#2563eb" }]}>
        <AppText style={st.gradientPillText}>
          {t("accountOrders.replacementOpen")}
        </AppText>
      </View>
    );
  }

  const sc = getOrderStatusConfig(order.status);
  return (
    <View style={[st.statusBadge, { backgroundColor: sc.bg }]}>
      <Icon name={sc.icon} size={12} color={sc.fg} />
      <AppText
        variant="tiny"
        color={sc.fg}
        weight="bold"
        style={{ textTransform: "uppercase" }}
      >
        {sc.label}
      </AppText>
    </View>
  );
}

// ─── Order Card ──────────────────────────────────────────────

function OrderCard({
  order,
  returns,
  replacements,
  onBuyAgain,
}: {
  order: Order;
  returns: ReturnInfo[];
  replacements: ReplacementInfo[];
  onBuyAgain: (item: OrderItem) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const routeId = order.publicId ?? "";
  const label = order.orderNumber ?? order.publicId ?? "";
  const statusLower = (order.status || "").toLowerCase();
  const itemsArr = Array.isArray(order.items) ? order.items : [];
  const total = orderTotalCents(order);

  const allItemsBlocked =
    itemsArr.length > 0 &&
    itemsArr.every((it) => {
      if (it.status === "CANCELLED" || !!it.cancelledAt) return true;
      const blockingCases = (it.caseItems ?? []).filter(
        (ci) => ci.case?.resolutionFinal !== "REPLACEMENT_DELIVERED",
      );
      return blockingCases.length > 0;
    });

  const noItemsShipped = !itemsArr.some((it) =>
    (it.shipmentItems ?? []).some(
      (si) => si.shipment?.direction === "OUTBOUND",
    ),
  );

  const canReturn =
    !allItemsBlocked && !noItemsShipped && statusLower === "delivered";
  const canMissing =
    !allItemsBlocked &&
    !noItemsShipped &&
    ["shipped", "delivered"].includes(statusLower);
  const canReview = isAllowedToReview(order.status);

  return (
    <View style={st.orderCard}>
      {/* Header */}
      <View style={st.cardHeader}>
        <View style={st.cardHeaderMeta}>
          <View style={st.cardHeaderCol}>
            <AppText style={st.metaLabel}>
              {t("accountOrders.orderPlaced")}
            </AppText>
            <AppText style={st.metaValue}>
              {formatDate(order.createdAt)}
            </AppText>
          </View>
          <View style={st.cardHeaderCol}>
            <AppText style={st.metaLabel}>
              {t("accountOrders.totalAmount")}
            </AppText>
            <AppText style={[st.metaValue, { color: colors.brandBlue }]}>
              {formatMoney(total)}
            </AppText>
          </View>
        </View>
        <View style={[st.cardHeaderRight, { maxWidth: "40%" }]}>
          <AppText style={st.metaLabel}>
            {t("accountOrders.orderNumber")}
          </AppText>
          <AppText
            numberOfLines={1}
            style={[
              st.metaValue,
              {
                color: colors.brandBlue,
                textTransform: "uppercase",
                fontSize: 11,
              },
            ]}
          >
            {label}
          </AppText>
        </View>
      </View>

      {/* Status Pill */}
      <View style={st.cardStatusRow}>
        <StatusPill
          order={order}
          returns={returns}
          replacements={replacements}
        />
      </View>

      {/* Progress Bar */}
      {statusLower !== "cancelled" && statusLower !== "refunded" && (
        <View style={st.progressContainer}>
          <ProgressBar
            steps={PROGRESS_STEPS}
            currentStep={progressIndex(order.status)}
          />
        </View>
      )}

      {/* Line Items */}
      <View style={st.cardBody}>
        {itemsArr.length > 0
          ? itemsArr.map((it, idx) => {
              const title = pickItemTitle(it);
              const qty = it.quantity ?? null;
              const unit = pickUnitPriceCents(it);
              const img = pickItemImage(it);
              const variant = pickVariantLabel(it);
              const vendor = pickVendorName(it);

              return (
                <View
                  key={it.publicId ?? String(idx)}
                  style={st.lineItem}
                >
                  <Image
                    source={{ uri: productImageUrl(img, "thumb") }}
                    style={st.lineItemImg}
                    resizeMode="cover"
                  />
                  <View style={st.lineItemInfo}>
                    <AppText
                      variant="label"
                      numberOfLines={2}
                      style={{ fontSize: 15 }}
                    >
                      {title}
                    </AppText>
                    {variant && (
                      <AppText variant="caption" color={colors.slate500}>
                        {variant}
                      </AppText>
                    )}
                    <AppText
                      variant="caption"
                      color={colors.slate500}
                      style={{ marginTop: 1 }}
                    >
                      {t("accountOrders.qty", { qty: qty ?? "—" })}
                      {unit > 0 && (
                        <>
                          {" · "}
                          <AppText
                            variant="caption"
                            color={colors.foreground}
                            weight="semibold"
                          >
                            {formatMoney(unit)}
                          </AppText>
                        </>
                      )}
                    </AppText>
                    {vendor && (
                      <AppText
                        style={{
                          fontSize: 12,
                          color: colors.slate400,
                          marginTop: 1,
                        }}
                      >
                        {t("accountOrders.soldBy", { name: vendor })}
                      </AppText>
                    )}
                    <Pressable
                      style={st.buyAgainInline}
                      onPress={() => onBuyAgain(it)}
                      hitSlop={6}
                    >
                      <Icon
                        name="add-shopping-cart"
                        size={12}
                        color={colors.brandBlue}
                      />
                      <AppText style={st.buyAgainInlineText}>
                        {t("accountOrders.buyAgainItem")}
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              );
            })
          : null}

        {/* Return label banner */}
        {returns.some(
          (r) => r.status === "AWAITING_SHIPMENT" && r.labelUrl,
        ) && (
          <View style={st.labelBanner}>
            <View style={st.labelBannerHeader}>
              <Icon name="label" size={18} color={colors.brandBlue} />
              <AppText weight="bold" style={{ fontSize: 14 }}>
                {t("accountOrders.returnLabelReady")}
              </AppText>
            </View>
            {returns
              .filter(
                (r) => r.status === "AWAITING_SHIPMENT" && r.labelUrl,
              )
              .map((r, idx) => (
                <View key={r.id ?? String(idx)} style={st.labelBannerRow}>
                  <AppText variant="caption" color={colors.slate500}>
                    {t("accountOrders.carrier")}{" "}
                    {r.carrier || t("accountOrders.na")} ·{" "}
                    {t("accountOrders.tracking")}{" "}
                    {r.trackingNumber || t("accountOrders.na")}
                    {r.shipBy && (
                      <AppText variant="caption" color={colors.warning}>
                        {" "}
                        · {t("accountOrders.shipBy", { date: formatDate(r.shipBy) })}
                      </AppText>
                    )}
                  </AppText>
                  <Pressable
                    style={st.labelDownloadBtn}
                    onPress={() => r.labelUrl && Linking.openURL(r.labelUrl)}
                  >
                    <Icon
                      name="download"
                      size={14}
                      color={colors.white}
                    />
                    <AppText
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: colors.white,
                      }}
                    >
                      {t("accountOrders.printReturnLabel")}
                    </AppText>
                  </Pressable>
                </View>
              ))}
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={st.cardActions}>
        <AppButton
          title={t("accountOrders.trackPackage")}
          variant="primary"
          fullWidth
          icon="local-shipping"
          onPress={() => router.push(ROUTES.orderTracking(routeId))}
          style={st.actionBtn}
        />
        <AppButton
          title={t("accountOrders.viewOrderDetails")}
          variant="outline"
          fullWidth
          onPress={() => router.push(ROUTES.orderDetail(routeId))}
          style={st.actionBtn}
        />
        <AppButton
          title={t("accountOrders.returnRefund")}
          variant="outline"
          fullWidth
          icon="assignment-return"
          disabled={!canReturn}
          onPress={() => router.push(ROUTES.orderReturn(routeId))}
          style={st.actionBtn}
        />
        <AppButton
          title={t("accountOrders.missingPackage")}
          variant="outline"
          fullWidth
          icon="inventory"
          disabled={!canMissing}
          onPress={() => router.push(ROUTES.orderMissing(routeId))}
          style={st.actionBtn}
        />
        {isCancellable(order.status) && (
          <AppButton
            title={t("accountOrders.cancelItems")}
            variant="danger"
            fullWidth
            icon="cancel"
            onPress={() => router.push(ROUTES.orderCancel(routeId))}
            style={st.actionBtn}
          />
        )}
      </View>

      {/* Footer: Message Seller + Review */}
      <View style={st.cardFooter}>
        <Pressable
          style={st.footerBtn}
          onPress={() =>
            router.push(ROUTES.supportMessageSeller(routeId))
          }
        >
          <Icon name="chat" size={14} color={colors.slate600} />
          <AppText style={st.footerBtnText}>
            {t("accountOrders.messageSeller")}
          </AppText>
        </Pressable>
        <Pressable
          style={[
            st.footerBtnReview,
            (!canReview) && st.footerBtnDisabled,
          ]}
          disabled={!canReview}
          onPress={() => router.push(ROUTES.orderReview(routeId))}
        >
          <Icon
            name="edit"
            size={14}
            color={canReview ? colors.white : colors.slate400}
          />
          <AppText
            style={[
              st.footerBtnReviewText,
              !canReview && { color: colors.slate400 },
            ]}
          >
            {t("accountOrders.writeReview")}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Return Card ─────────────────────────────────────────────

function ReturnCard({ ret }: { ret: ReturnRequest }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { step: retStep, terminal: retTerminal } = returnProgressIndex(ret);

  const statusGradient = RETURN_STATUS_GRADIENTS[ret.status];
  const statusLabel = statusGradient?.label ?? ret.status;
  const statusColors = statusGradient?.colors ?? (["#9ca3af", "#6b7280"] as [string, string]);

  const hasLegacyLabel =
    ret.returnLabelUrl && ret.status === "AWAITING_SHIPMENT";
  const hasShipmentLabels =
    ret.returnShipments &&
    ret.returnShipments.length > 0 &&
    ret.status === "AWAITING_SHIPMENT";
  const hasLabel = hasLegacyLabel || hasShipmentLabels;

  const showTracking =
    !hasLabel && (ret.returnCarrier || ret.returnTrackingNumber);

  const orderPublicId =
    ret.orderItem?.order?.publicId ??
    ret.case?.order?.publicId ??
    "";
  const orderNum =
    ret.orderItem?.order?.orderNumber ??
    ret.case?.order?.orderNumber ??
    "";

  const caseItem = ret.case?.items?.[0];
  const caseOrderItem = caseItem?.orderItem;

  const itemTitle =
    caseOrderItem?.productVariant?.product?.title ??
    caseOrderItem?.productVariant?.title ??
    ret.orderItem?.title ??
    (ret.orderItem as any)?.productVariant?.product?.title ??
    (ret.orderItem as any)?.productVariant?.title ??
    (ret.itemCount ? `${ret.itemCount} item(s)` : null) ??
    `Return #${ret.caseNumber ?? "?"}`;

  const itemImage =
    pickReturnCaseItemImage(caseItem) ??
    pickReturnItemImage(ret.orderItem) ??
    null;

  const qtyToReturn =
    caseItem?.qtyAffected ??
    ret.orderItem?.quantity ??
    ret.itemCount ??
    1;

  const reasonCode =
    caseItem?.reasonCode ?? ret.reason ?? "";

  return (
    <View style={st.orderCard}>
      {/* Header */}
      <View style={st.cardHeader}>
        <View style={st.cardHeaderMeta}>
          <View style={st.cardHeaderCol}>
            <AppText style={st.metaLabel}>
              {t("accountOrders.returns.requested")}
            </AppText>
            <AppText style={st.metaValue}>
              {formatDate(ret.createdAt)}
            </AppText>
          </View>
          <View style={[st.cardHeaderCol, { flex: 1, minWidth: 0 }]}>
            <AppText style={st.metaLabel}>
              {t("accountOrders.orderNumber")}
            </AppText>
            <Pressable
              onPress={() =>
                orderPublicId &&
                router.push(ROUTES.orderDetail(orderPublicId))
              }
            >
              <AppText
                numberOfLines={1}
                style={[
                  st.metaValue,
                  { color: colors.brandBlue, fontSize: 11 },
                ]}
              >
                #{orderNum || orderPublicId?.slice(0, 12) || "—"}
              </AppText>
            </Pressable>
          </View>
        </View>
        <View style={st.cardHeaderRight}>
          <AppText style={st.metaLabel}>
            {t("accountOrders.returns.returnNumber")}
          </AppText>
          <AppText
            numberOfLines={1}
            style={[
              st.metaValue,
              { color: colors.brandBlue, textTransform: "uppercase", fontSize: 11 },
            ]}
          >
            {ret.caseNumber ?? "?"}
          </AppText>
        </View>
      </View>

      {/* Status Pill */}
      <View style={st.cardStatusRow}>
        <View style={[st.gradientPill, { backgroundColor: statusColors[1] }]}>
          <AppText style={st.gradientPillText}>{statusLabel}</AppText>
        </View>
      </View>

      {/* Return Progress Bar */}
      <View style={st.progressContainer}>
        <ProgressBar
          steps={RETURN_PROGRESS_STEPS}
          currentStep={retStep}
          terminal={retTerminal}
        />
      </View>

      {/* Item */}
      <View style={st.cardBody}>
        <View style={st.lineItem}>
          {itemImage ? (
            <Image
              source={{ uri: productImageUrl(itemImage, "thumb") }}
              style={st.lineItemImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[st.lineItemImg, st.lineItemImgPlaceholder]}>
              <Icon name="image" size={24} color={colors.slate300} />
            </View>
          )}
          <View style={st.lineItemInfo}>
            <AppText variant="label" numberOfLines={2} style={{ fontSize: 15 }}>
              {itemTitle}
            </AppText>
            <AppText variant="caption" color={colors.slate500}>
              {t("accountOrders.returns.qtyToReturn", {
                qty: qtyToReturn,
              })}
            </AppText>
            {reasonCode ? (
              <AppText
                style={{ fontSize: 12, color: colors.slate400, marginTop: 1 }}
              >
                {t("accountOrders.returns.reason")}{" "}
                {reasonCode
                  .replace(/_/g, " ")
                  .toLowerCase()
                  .replace(/^\w/, (c: string) => c.toUpperCase())}
              </AppText>
            ) : null}
          </View>
        </View>

        {/* Return Label Section */}
        {hasLabel && (
          <View style={st.labelBanner}>
            <View style={st.labelBannerHeader}>
              <Icon name="label" size={18} color={colors.brandBlue} />
              <AppText weight="bold" style={{ fontSize: 13 }}>
                {(ret.returnShipments?.length ?? 0) > 1
                  ? t("accountOrders.returns.returnLabelsReady", {
                      count: ret.returnShipments!.length,
                    })
                  : t("accountOrders.returnLabelReady")}
              </AppText>
            </View>
            {(ret.returnShipments?.length ?? 0) > 1 ? (
              ret.returnShipments!.map((s, i) => (
                <View key={i} style={st.multiLabelRow}>
                  <View>
                    <AppText weight="bold" style={{ fontSize: 12 }}>
                      {t("accountOrders.returns.package", { num: i + 1 })}
                    </AppText>
                    <AppText
                      variant="caption"
                      color={colors.slate500}
                    >
                      {s.carrier?.toUpperCase()} · {s.trackingNumber}
                    </AppText>
                  </View>
                  {s.labelUrl && (
                    <Pressable
                      onPress={() => Linking.openURL(s.labelUrl!)}
                      style={st.labelSmallBtn}
                    >
                      <Icon
                        name="download"
                        size={12}
                        color={colors.brandBlue}
                      />
                      <AppText
                        style={{
                          fontSize: 11,
                          fontWeight: "600",
                          color: colors.brandBlue,
                        }}
                      >
                        {t("accountOrders.returns.label")}
                      </AppText>
                    </Pressable>
                  )}
                </View>
              ))
            ) : (
              <View style={st.labelBannerRow}>
                <AppText variant="caption" color={colors.slate500}>
                  {t("accountOrders.carrier")}{" "}
                  {ret.returnCarrier || t("accountOrders.na")} ·{" "}
                  {t("accountOrders.tracking")}{" "}
                  {ret.returnTrackingNumber || t("accountOrders.na")}
                  {ret.shipBy && (
                    <AppText variant="caption" color={colors.warning}>
                      {" "}
                      · {t("accountOrders.shipBy", { date: formatDate(ret.shipBy) })}
                    </AppText>
                  )}
                </AppText>
                <Pressable
                  style={st.labelDownloadBtn}
                  onPress={() =>
                    ret.returnLabelUrl &&
                    Linking.openURL(ret.returnLabelUrl)
                  }
                >
                  <Icon
                    name="download"
                    size={14}
                    color={colors.white}
                  />
                  <AppText
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: colors.white,
                    }}
                  >
                    {t("accountOrders.printReturnLabel")}
                  </AppText>
                </Pressable>
              </View>
            )}
            {ret.shipBy &&
              (ret.returnShipments?.length ?? 0) > 1 && (
                <AppText
                  variant="caption"
                  color={colors.warning}
                  style={{ marginTop: spacing[1] }}
                >
                  {t("accountOrders.returns.shipAllBy")}{" "}
                  {formatDate(ret.shipBy)}
                </AppText>
              )}
          </View>
        )}

        {/* Tracking Section */}
        {showTracking && (
          <View style={st.trackingBanner}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing[2] }}>
              <Icon
                name="local-shipping"
                size={16}
                color={colors.slate600}
              />
              <AppText variant="caption">
                {t("accountOrders.carrier")}{" "}
                {ret.returnCarrier || t("accountOrders.na")} ·{" "}
                {t("accountOrders.tracking")}{" "}
                {ret.returnTrackingNumber || t("accountOrders.na")}
              </AppText>
            </View>
            {(() => {
              const url = buildCarrierTrackingUrl(
                ret.returnCarrier,
                ret.returnTrackingNumber,
              );
              if (!url) return null;
              return (
                <Pressable
                  onPress={() => Linking.openURL(url)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing[1] }}
                >
                  <Icon
                    name="open-in-new"
                    size={12}
                    color={colors.brandBlue}
                  />
                  <AppText
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.brandBlue,
                    }}
                  >
                    {t("accountOrders.returns.trackReturn")}
                  </AppText>
                </Pressable>
              );
            })()}
          </View>
        )}

        {/* Special state banners */}
        {(ret.status === "DELIVERED_TO_VENDOR" ||
          ret.status === "INSPECTING") && (
          <View style={st.infoBannerTeal}>
            <AppText style={{ fontSize: 13, color: "#0d9488" }}>
              {t("accountOrders.returns.returnDeliveredReview")}
            </AppText>
          </View>
        )}

        {ret.status === "CLOSED_EXPIRED" && (
          <View style={st.infoBannerGray}>
            <AppText style={{ fontSize: 13, color: colors.slate600 }}>
              {t("accountOrders.returns.closedExpired")}
            </AppText>
          </View>
        )}

        {ret.status === "AWAITING_LABEL" && (
          <View style={st.infoBannerYellow}>
            <ActivityIndicator
              size="small"
              color="#0c4eb0"
              style={{ marginRight: spacing[2] }}
            />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" style={{ fontSize: 13, color: "#0c4eb0" }}>
                {t("accountOrders.returns.generatingLabel")}
              </AppText>
              <AppText style={{ fontSize: 12, color: "#0c4eb0", opacity: 0.8 }}>
                {t("accountOrders.returns.generatingLabelDesc")}
              </AppText>
            </View>
          </View>
        )}

        {/* Refund banners */}
        {ret.refund?.status === "SUCCEEDED" && (
          <View style={st.infoBannerGreen}>
            <Icon name="check-circle" size={16} color="#059669" />
            <View style={{ flex: 1, marginLeft: spacing[2] }}>
              <AppText weight="bold" style={{ fontSize: 13, color: "#065f46" }}>
                {t("accountOrders.returns.refundProcessed", {
                  amount: ((ret.refund.amountCents ?? 0) / 100).toFixed(2),
                })}
              </AppText>
              <AppText style={{ fontSize: 12, color: "#059669" }}>
                {t("accountOrders.returns.refundProcessedDesc")}
              </AppText>
            </View>
          </View>
        )}
        {ret.refund?.status === "PENDING" && (
          <View style={st.infoBannerBlue}>
            <ActivityIndicator
              size="small"
              color="#2563eb"
              style={{ marginRight: spacing[2] }}
            />
            <AppText weight="bold" style={{ fontSize: 13, color: "#1e40af" }}>
              {t("accountOrders.returns.refundBeingProcessed", {
                amount: ((ret.refund.amountCents ?? 0) / 100).toFixed(2),
              })}
            </AppText>
          </View>
        )}
        {ret.refund?.status === "FAILED" && (
          <View style={st.infoBannerAmber}>
            <Icon name="schedule" size={16} color="#d97706" />
            <AppText
              weight="bold"
              style={{
                fontSize: 13,
                color: "#92400e",
                marginLeft: spacing[2],
              }}
            >
              {t("accountOrders.returns.refundPending")}
            </AppText>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={st.cardActions}>
        <AppButton
          title={t("accountOrders.viewOrderDetails")}
          variant="primary"
          fullWidth
          icon="visibility"
          onPress={() =>
            orderPublicId &&
            router.push(ROUTES.orderDetail(orderPublicId))
          }
          style={st.actionBtn}
        />
        {hasLabel && (
          <AppButton
            title={t("accountOrders.printReturnLabel")}
            variant="outline"
            fullWidth
            icon="download"
            onPress={() => {
              const url =
                ret.returnShipments?.[0]?.labelUrl ?? ret.returnLabelUrl;
              if (url) Linking.openURL(url);
            }}
            style={st.actionBtn}
          />
        )}
        <AppButton
          title={t("accountOrders.messageSeller")}
          variant="outline"
          fullWidth
          icon="chat"
          onPress={() =>
            router.push(ROUTES.supportMessageSeller(orderPublicId))
          }
          style={st.actionBtn}
        />
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────

export default function OrdersScreen() {
  return (
    <RequireAuth>
      <OrdersContent />
    </RequireAuth>
  );
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

  // ─── Data fetching ──────────────────────────────────────────

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

  const { data: cases = [] } = useQuery({
    queryKey: queryKeys.messages.cases.listFlat(),
    queryFn: async () => {
      const raw = await customerFetch<any>("/cases/mine?limit=200");
      if (raw && typeof raw === "object" && Array.isArray(raw.data))
        return raw.data as CaseLite[];
      return Array.isArray(raw) ? (raw as CaseLite[]) : [];
    },
    enabled: isLoggedIn,
    staleTime: 5 * 60_000,
  });

  const initialOrders = useMemo(() => {
    const d = ordersData;
    return Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
  }, [ordersData]);

  const returns: ReturnRequest[] = useMemo(() => {
    const d = returnsData;
    return Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : [];
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

  // ─── Derived data: returns & replacements per order ─────────

  const orderReturns = useMemo<Record<string, ReturnInfo[]>>(() => {
    const byOrder: Record<string, ReturnInfo[]> = {};
    for (const ret of returns) {
      if (TERMINAL_RETURN_STATUSES.includes(ret.status)) continue;
      const orderKey =
        ret.orderItem?.order?.publicId ?? ret.case?.order?.publicId;
      if (!orderKey) continue;
      if (!byOrder[orderKey]) byOrder[orderKey] = [];
      byOrder[orderKey].push({
        id: ret.caseNumber,
        status: ret.status,
        labelUrl:
          ret.returnShipments?.[0]?.labelUrl ??
          ret.returnShipment?.labelUrl ??
          ret.returnLabelUrl ??
          null,
        carrier:
          ret.returnShipments?.[0]?.carrier ??
          ret.returnShipment?.carrier ??
          ret.returnCarrier ??
          null,
        trackingNumber:
          ret.returnShipments?.[0]?.trackingNumber ??
          ret.returnShipment?.trackingNumber ??
          ret.returnTrackingNumber ??
          null,
        shipBy: ret.shipBy ?? ret.shipByDeadlineAt ?? null,
      });
    }
    return byOrder;
  }, [returns]);

  const orderReplacements = useMemo<Record<string, ReplacementInfo[]>>(
    () => {
      const byOrder: Record<string, ReplacementInfo[]> = {};
      for (const c of cases) {
        if (c.resolutionIntent !== "REPLACEMENT") continue;
        if (!ACTIVE_CASE_STATUSES.includes(c.status)) continue;
        const orderKey = c.order?.publicId;
        if (!orderKey) continue;
        if (!byOrder[orderKey]) byOrder[orderKey] = [];
        byOrder[orderKey].push({
          caseNumber: c.caseNumber,
          status: c.status,
          resolutionIntent: c.resolutionIntent,
        });
      }
      return byOrder;
    },
    [cases],
  );

  // ─── Pagination ─────────────────────────────────────────────

  const loadMore = useCallback(
    async (nextCursor: string) => {
      setLoadingMore(true);
      try {
        const params = new URLSearchParams({
          limit: "50",
          cursor: nextCursor,
        });
        const data = await customerFetch<any>(`/orders?${params}`);
        const list = Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data)
            ? data
            : [];
        setExtraOrders((prev) => [...prev, ...list]);
        setCursor(data?.nextCursor ?? null);
        setHasMore(!!data?.hasMore);
      } catch {}
      setLoadingMore(false);
    },
    [],
  );

  // ─── Filtering & sorting ────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...orders];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((o) => {
        const label = o.orderNumber || o.publicId || String((o as any).id ?? "");
        if (label.toLowerCase().includes(q)) return true;
        if (
          o.items?.some((it: OrderItem) =>
            pickItemTitle(it).toLowerCase().includes(q),
          )
        )
          return true;
        return false;
      });
    }
    list.sort((a, b) => {
      if (sortBy === "oldest") {
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      }
      if (sortBy === "total-high" || sortBy === "total-low") {
        const ta = normalizeNumber(a.totalAmount) ?? 0;
        const tb = normalizeNumber(b.totalAmount) ?? 0;
        return sortBy === "total-high" ? tb - ta : ta - tb;
      }
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
    return list;
  }, [orders, searchQuery, sortBy]);

  const buyAgainItems = useMemo(
    () => extractBuyAgainItems(orders),
    [orders],
  );

  // ─── Handlers ───────────────────────────────────────────────

  // ─── Top Rated discovery rail ───────────────────────────────
  // High-intent post-purchase shoppers are the highest-conversion audience
  // for discovery; we surface a Top Rated rail at the bottom of each tab's
  // scrollable list. The slider self-collapses (returns null) when empty
  // and swallows fetch errors via publicFetch, so a backend outage on this
  // endpoint never blocks the orders page. The endpoint and query key match
  // the home screen's Top Rated section so the cache is shared across both.
  const TOP_RATED_LIMIT = 10;

  const handleAddToCartFromCarousel = useCallback(
    (product: PublicProduct) => {
      if (!product.defaultVariantPublicId) return;
      addToCart({
        variantPublicId: product.defaultVariantPublicId,
        price: product.price,
        title: product.title,
        image: product.image || "",
        productId: product.productId,
        slug: product.slug,
      });
    },
    [addToCart],
  );

  const renderTopRatedFooter = useCallback(
    (showLoadingMore: boolean) => (
      <View>
        {showLoadingMore ? (
          <ActivityIndicator
            size="small"
            color={colors.brandBlue}
            style={{ marginVertical: spacing[4] }}
          />
        ) : null}
        <ProductRecommendationSlider
          title={t("home.topRated")}
          apiUrl={`/products/public?sortBy=rating&take=${TOP_RATED_LIMIT}`}
          queryKey={queryKeys.products.list({
            sortBy: "rating",
            take: TOP_RATED_LIMIT,
          })}
          accentColor={colors.brandOrange}
          onAddToCart={handleAddToCartFromCarousel}
        />
      </View>
    ),
    [t, handleAddToCartFromCarousel],
  );

  const handleBuyAgainAddToCart = useCallback(
    async (item: BuyAgainItem | OrderItem) => {
      const vid =
        "variantPublicId" in item
          ? item.variantPublicId
          : item.productVariant?.publicId;
      if (!vid) return;
      const title =
        "title" in item && typeof item.title === "string"
          ? item.title
          : pickItemTitle(item as OrderItem);
      const price =
        "price" in item && typeof item.price === "number"
          ? item.price
          : pickUnitPriceCents(item as OrderItem);
      const image =
        "image" in item && typeof item.image === "string"
          ? item.image
          : pickItemImage(item as OrderItem) ?? "";
      const productId =
        "productId" in item && typeof item.productId === "string"
          ? item.productId
          : (item as OrderItem).productVariant?.product?.productId ?? "";

      try {
        await addToCart({
          variantPublicId: vid,
          price: price / 100,
          title,
          image,
          productId,
          slug: "",
        });
      } catch {
        Alert.alert(
          t("common.error"),
          t("accountOrders.addToCartError"),
        );
      }
    },
    [addToCart, t],
  );

  // ─── Unauthenticated ───────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <View style={[st.empty, { paddingTop: insets.top }]}>
        <Icon name="receipt-long" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>
          {t("accountOrders.signInPrompt")}
        </AppText>
        <AppButton
          title={t("accountOrders.signIn")}
          variant="primary"
          onPress={() => router.push(ROUTES.login)}
          style={{ marginTop: spacing[4] }}
        />
      </View>
    );
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={st.header}>
        <BackButton />
        <View>
          <AppText variant="title">{t("accountOrders.heading")}</AppText>
        </View>
        <BackButton icon="close" />
      </View>

      {/* Tab bar */}
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
              {tab === "orders"
                ? t("accountOrders.tabOrders")
                : tab === "returns"
                  ? t("accountOrders.tabReturns")
                  : t("accountOrders.tabBuyAgain")}
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
                <Pressable
                  onPress={() => setSearchQuery("")}
                  hitSlop={8}
                >
                  <Icon name="close" size={16} color={colors.muted} />
                </Pressable>
              )}
            </View>
            <Pressable
              style={st.sortBtn}
              onPress={() => setShowSort(!showSort)}
            >
              <Icon name="sort" size={20} color={colors.brandBlue} />
            </Pressable>
          </View>

          {showSort && (
            <View style={st.sortOptions}>
              {SORT_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[
                    st.sortPill,
                    sortBy === opt.value && st.sortPillActive,
                  ]}
                  onPress={() => {
                    setSortBy(opt.value);
                    setShowSort(false);
                  }}
                >
                  <AppText
                    variant="caption"
                    color={
                      sortBy === opt.value ? colors.white : colors.muted
                    }
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
              <Icon
                name="receipt-long"
                size={48}
                color={colors.gray300}
              />
              <AppText variant="subtitle" color={colors.muted}>
                {searchQuery
                  ? t("accountOrders.noMatchingOrders")
                  : t("accountOrders.noOrdersYet")}
              </AppText>
              <AppText
                variant="caption"
                color={colors.muted}
                style={{
                  textAlign: "center",
                  paddingHorizontal: spacing[8],
                }}
              >
                {searchQuery
                  ? t("accountOrders.noMatchingOrdersDesc")
                  : t("accountOrders.noOrdersYetDesc")}
              </AppText>
            </View>
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(o) => o.publicId ?? ""}
              contentContainerStyle={st.list}
              showsVerticalScrollIndicator={false}
              onEndReached={() => {
                if (hasMore && !loadingMore && cursor) loadMore(cursor);
              }}
              onEndReachedThreshold={0.3}
              ListHeaderComponent={
                <AppText
                  variant="caption"
                  color={colors.slate400}
                  weight="semibold"
                  style={{ marginBottom: spacing[3], fontSize: 13 }}
                >
                  {t("accountOrders.showing", {
                    shown: filtered.length,
                    total: orders.length,
                  })}
                </AppText>
              }
              ListFooterComponent={renderTopRatedFooter(loadingMore)}
              renderItem={({ item: order }) => (
                <OrderCard
                  order={order}
                  returns={
                    orderReturns[order.publicId ?? ""] ?? []
                  }
                  replacements={
                    orderReplacements[order.publicId ?? ""] ?? []
                  }
                  onBuyAgain={(it) => handleBuyAgainAddToCart(it)}
                />
              )}
            />
          )}
        </>
      )}

      {/* ── RETURNS TAB ── */}
      {activeTab === "returns" && (
        <>
          {returnsLoading ? (
            <View style={st.list}>
              <SkeletonOrderCard />
              <SkeletonOrderCard />
              <SkeletonOrderCard />
            </View>
          ) : returns.length === 0 ? (
            <View style={st.empty}>
              <Icon
                name="assignment-return"
                size={48}
                color={colors.gray300}
              />
              <AppText variant="subtitle" color={colors.muted}>
                {t("accountOrders.returns.noReturnsYet")}
              </AppText>
              <AppText
                variant="caption"
                color={colors.muted}
                style={{
                  textAlign: "center",
                  paddingHorizontal: spacing[8],
                }}
              >
                {t("accountOrders.returns.noReturnsDesc")}
              </AppText>
            </View>
          ) : (
            <FlatList
              data={returns}
              keyExtractor={(r, idx) => r.caseNumber ?? String(idx)}
              contentContainerStyle={st.list}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                <AppText
                  variant="caption"
                  color={colors.slate400}
                  weight="semibold"
                  style={{ marginBottom: spacing[3] }}
                >
                  {t("accountOrders.returns.returnCount", {
                    count: returns.length,
                  })}
                </AppText>
              }
              renderItem={({ item: ret }) => <ReturnCard ret={ret} />}
              ListFooterComponent={renderTopRatedFooter(false)}
            />
          )}
        </>
      )}

      {/* ── BUY AGAIN TAB ── */}
      {activeTab === "buyagain" && (
        <>
          {loading ? (
            <ActivityIndicator
              size="large"
              color={colors.brandBlue}
              style={st.loader}
            />
          ) : buyAgainItems.length === 0 ? (
            <View style={st.empty}>
              <Icon
                name="shopping-cart"
                size={48}
                color={colors.gray300}
              />
              <AppText variant="subtitle" color={colors.muted}>
                {t("accountOrders.noDeliveredOrders")}
              </AppText>
              <AppText
                variant="caption"
                color={colors.muted}
                style={{
                  textAlign: "center",
                  paddingHorizontal: spacing[8],
                }}
              >
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
              ListFooterComponent={renderTopRatedFooter(false)}
              renderItem={({ item }) => (
                <View style={st.buyAgainCard}>
                  <Image
                    source={{
                      uri: productImageUrl(item.image, "thumb"),
                    }}
                    style={st.buyAgainImg}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1, justifyContent: "space-between" }}>
                    <View>
                      <AppText
                        variant="label"
                        numberOfLines={2}
                        style={st.buyAgainTitle}
                      >
                        {item.title}
                      </AppText>
                      {item.variantLabel && (
                        <AppText
                          variant="caption"
                          color={colors.slate500}
                          numberOfLines={1}
                          style={{ marginTop: 2 }}
                        >
                          {item.variantLabel}
                        </AppText>
                      )}
                    </View>
                    <View>
                      <AppText
                        variant="priceSmall"
                        style={{ marginTop: spacing[1] }}
                      >
                        {formatMoney(item.price)}
                      </AppText>
                      <AppText
                        variant="caption"
                        color={colors.muted}
                        style={{ marginTop: spacing[0.5] }}
                      >
                        {t("accountOrders.lastOrdered", {
                          date: formatDate(item.lastOrderDate),
                        })}
                      </AppText>
                    </View>
                  </View>
                  <Pressable
                    style={st.buyAgainBtn}
                    onPress={() => handleBuyAgainAddToCart(item)}
                  >
                    <AppText style={st.buyAgainBtnText}>
                      {t("accountOrders.addToCart")}
                    </AppText>
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

// ─── Styles ──────────────────────────────────────────────────

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  tab: {
    flex: 1,
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    alignItems: "center",
    backgroundColor: colors.slate100,
  },
  tabActive: { backgroundColor: colors.brandBlue },
  tabText: { fontSize: 15, fontWeight: "600", color: colors.slate600 },
  tabTextActive: { color: colors.white },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[2],
  },
  searchInput: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    height: 40,
    gap: spacing[2],
  },
  searchField: {
    flex: 1,
    fontSize: 15,
    color: colors.foreground,
    paddingVertical: 0,
  },
  sortBtn: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sortOptions: {
    flexDirection: "row",
    gap: spacing[1.5],
    paddingHorizontal: spacing[4],
    marginBottom: spacing[3],
  },
  sortPill: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillActive: {
    backgroundColor: colors.brandBlue,
    borderColor: colors.brandBlue,
  },
  loader: { marginTop: spacing[16] },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
  },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },

  // Order / Return Card
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: colors.slate50,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  cardHeaderMeta: {
    flexDirection: "row",
    gap: spacing[4],
    flex: 1,
  },
  cardHeaderCol: {},
  cardHeaderRight: { alignItems: "flex-end" },
  metaLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.slate400,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 1,
  },
  metaValue: { fontSize: 14, fontWeight: "700", color: colors.foreground },
  cardStatusRow: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
  },
  gradientPill: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  gradientPillText: {
    fontSize: 11,
    fontWeight: "900",
    color: colors.white,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
  },
  progressContainer: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  progressStep: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  progressLine: {
    position: "absolute",
    top: 8,
    right: "50%",
    width: "100%",
    height: 2,
    zIndex: -1,
  },
  progressDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.slate300,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotDone: {
    backgroundColor: colors.brandOrange,
    borderColor: "transparent",
  },
  progressDotCurrent: {
    shadowColor: colors.brandOrange,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    textAlign: "center",
  },
  cardBody: {
    padding: spacing[4],
    gap: spacing[3],
  },
  lineItem: {
    flexDirection: "row",
    gap: spacing[3],
  },
  lineItemImg: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.slate100,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  lineItemImgPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  lineItemInfo: {
    flex: 1,
  },
  buyAgainInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: spacing[1],
  },
  buyAgainInlineText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brandBlue,
  },

  // Label / Tracking banners
  labelBanner: {
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: "rgba(45,78,207,0.3)",
    backgroundColor: "#eff6ff",
  },
  labelBannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  labelBannerRow: {
    gap: spacing[2],
  },
  multiLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing[2.5],
    borderWidth: 1,
    borderColor: "#bfdbfe",
    marginBottom: spacing[1.5],
  },
  labelSmallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  labelDownloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.brandBlue,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    marginTop: spacing[2],
    alignSelf: "flex-start",
  },
  trackingBanner: {
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  infoBannerTeal: {
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: "#ccfbf1",
    borderWidth: 1,
    borderColor: "#99f6e4",
  },
  infoBannerGray: {
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.slate50,
    borderWidth: 1,
    borderColor: colors.slate200,
  },
  infoBannerYellow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    backgroundColor: "#FFD93D",
  },
  infoBannerGreen: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: "#d1fae5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  infoBannerBlue: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: "#dbeafe",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  infoBannerAmber: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde68a",
  },

  // Action Buttons
  cardActions: {
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  actionBtn: {},

  // Footer
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.slate50,
    gap: spacing[2],
  },
  footerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1.5],
    paddingVertical: spacing[3],
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: borderRadius.lg,
  },
  footerBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.slate600,
  },
  footerBtnReview: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1.5],
    paddingVertical: spacing[3],
    backgroundColor: colors.brandOrange,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  footerBtnDisabled: {
    backgroundColor: colors.slate100,
    shadowOpacity: 0,
    elevation: 0,
  },
  footerBtnReviewText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.white,
  },

  // Buy Again
  buyAgainRow: { gap: spacing[3] },
  buyAgainCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  buyAgainImg: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
  },
  buyAgainTitle: { lineHeight: 18 },
  buyAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    marginTop: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.brandBlue,
  },
  buyAgainBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.white,
  },
});
