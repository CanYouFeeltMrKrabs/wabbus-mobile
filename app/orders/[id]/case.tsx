import React from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import i18n from "@/i18n";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { useOrderCaseDetail } from "@/lib/queries";
import { formatDate } from "@/lib/orderHelpers";
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { ROUTES } from "@/lib/routes";
import { buildCarrierTrackingUrl } from "@/lib/carrierTrackingUrl";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type CaseItem = {
  id?: number;
  publicId?: string;
  quantity: number;
  orderItem: {
    id?: number;
    publicId?: string;
    quantity: number;
    unitPrice?: string | number | null;
    productVariant?: {
      title?: string | null;
      sku?: string | null;
      product?: {
        title?: string | null;
        images?: Array<{ key?: string; url?: string }> | null;
      } | null;
    } | null;
  };
};

type CaseData = {
  id: string;
  status: "OPEN" | "RESOLVED" | "CLOSED";
  resolutionIntent?: string | null;
  resolutionFinal?: string | null;
  linkedTicketPublicId?: string | null;
  createdAt: string;
  updatedAt: string;
  note: string | null;
  order: {
    publicId?: string;
    orderNumber?: string | null;
    createdAt?: string | null;
  };
  items: CaseItem[];
  refund: {
    status: string;
    amountCents: number;
    provider: string;
    createdAt: string;
  } | null;
  storeCredit?: {
    type: string;
    amountCents: number;
    createdAt: string;
  } | null;
  replacementShipment?: {
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    status: string | null;
    estimatedDelivery: string | null;
  } | null;
};

const STATUS_CONFIG: Record<
  string,
  { labelKey: string; bg: string; fg: string; dotColor: string }
> = {
  OPEN: { labelKey: "accountOrders.case.statusInReview", bg: "#fef3c7", fg: "#92400e", dotColor: "#f59e0b" },
  RESOLVED: { labelKey: "accountOrders.case.statusResolved", bg: "#d1fae5", fg: "#065f46", dotColor: "#10b981" },
  CLOSED: { labelKey: "accountOrders.case.statusClosed", bg: "#f3f4f6", fg: "#4b5563", dotColor: "#9ca3af" },
};

function pickCaseItemImage(item: CaseItem): string | null {
  const img = item.orderItem.productVariant?.product?.images?.[0] ?? null;
  if (!img) return null;
  const url = img.url;
  const key = img.key;
  if (url && (url.startsWith("http://") || url.startsWith("https://"))) return url;
  if (key) return productImageUrl(key, "thumb");
  return null;
}

function itemTitle(item: CaseItem): string {
  const productTitle = item.orderItem.productVariant?.product?.title;
  const variantTitle = item.orderItem.productVariant?.title;
  if (productTitle) return productTitle;
  if (variantTitle && variantTitle !== "Default") return variantTitle;
  return i18n.t("accountOrders.case.itemFallback", { id: item.orderItem?.publicId ?? "?" });
}

function itemVariantLabel(item: CaseItem): string | undefined {
  const vt = item.orderItem?.productVariant?.title?.trim();
  return vt && vt !== "Default" ? vt : undefined;
}

function resolvedMessage(caseData: CaseData): string {
  switch (caseData.resolutionFinal) {
    case "REFUNDED":
    case "RETURNED_AND_REFUNDED":
      return caseData.refund
        ? i18n.t("accountOrders.case.resolvedRefund")
        : i18n.t("accountOrders.case.resolvedRefundFallback");
    case "STORE_CREDIT_ISSUED":
      return caseData.storeCredit
        ? i18n.t("accountOrders.case.resolvedStoreCredit")
        : i18n.t("accountOrders.case.resolvedStoreCreditFallback");
    case "REPLACEMENT_DELIVERED":
      return caseData.replacementShipment
        ? i18n.t("accountOrders.case.resolvedReplacement")
        : i18n.t("accountOrders.case.resolvedReplacementFallback");
    case "DENIED":
      return i18n.t("accountOrders.case.resolvedDenied");
    default:
      return i18n.t("accountOrders.case.resolvedDefault");
  }
}

function normalizeQueryParam(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

export default function OrderCaseScreen() {
  return (
    <RequireAuth>
      <CaseContent />
    </RequireAuth>
  );
}

function CaseContent() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string; issueId?: string | string[] }>();
  const issueId = normalizeQueryParam(params.issueId);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: caseDataRaw, isLoading: loading, isError } = useOrderCaseDetail(issueId);
  const caseData = caseDataRaw as unknown as CaseData | undefined;

  const error = !issueId
    ? t("accountOrders.case.noCaseId")
    : isError
      ? t("accountOrders.case.errorLoad")
      : null;

  const statusInfo = STATUS_CONFIG[caseData?.status ?? "OPEN"] ?? STATUS_CONFIG.OPEN;

  if (loading) {
    return (
      <View style={[st.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (error || !caseData) {
    return (
      <View style={[st.center, { paddingTop: insets.top }]}>
        <Icon name="error-outline" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[2] }}>
          {error || t("accountOrders.case.notFound")}
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

  const replTrackUrl =
    caseData.replacementShipment?.trackingUrl ||
    buildCarrierTrackingUrl(
      caseData.replacementShipment?.carrier ?? null,
      caseData.replacementShipment?.trackingNumber ?? null
    );

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("accountOrders.case.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        {caseData.refund && caseData.refund.status === "SUCCEEDED" && (
          <View style={[st.banner, { backgroundColor: "#d1fae5", borderColor: "#a7f3d0" }]}>
            <Icon name="check-circle" size={24} color="#059669" />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" color="#065f46">
                {t("accountOrders.case.refundProcessed", { amount: formatMoney(caseData.refund.amountCents ?? 0) })}
              </AppText>
              <AppText variant="caption" color="#059669">
                {formatDate(caseData.refund.createdAt)}
              </AppText>
            </View>
          </View>
        )}

        {caseData.refund && caseData.refund.status === "PENDING" && (
          <View style={[st.banner, { backgroundColor: "#dbeafe", borderColor: "#bfdbfe" }]}>
            <Icon name="hourglass-top" size={24} color="#2563eb" />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" color="#1e40af">
                {t("accountOrders.case.refundProcessing", { amount: formatMoney(caseData.refund.amountCents ?? 0) })}
              </AppText>
              <AppText variant="caption" color="#2563eb">
                {t("accountOrders.case.refundProcessingDesc")}
              </AppText>
            </View>
          </View>
        )}

        {caseData.refund && caseData.refund.status === "FAILED" && (
          <View style={[st.banner, { backgroundColor: "#fef3c7", borderColor: "#fde68a" }]}>
            <Icon name="schedule" size={24} color="#d97706" />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" color="#92400e">
                {t("accountOrders.case.refundPendingRetry", { amount: formatMoney(caseData.refund.amountCents ?? 0) })}
              </AppText>
              <AppText variant="caption" color="#d97706">
                {t("accountOrders.case.refundRetrying")}
              </AppText>
            </View>
          </View>
        )}

        {caseData.storeCredit && (
          <View style={[st.banner, { backgroundColor: "#e0e7ff", borderColor: "#c7d2fe" }]}>
            <Icon name="account-balance-wallet" size={24} color="#4f46e5" />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" color="#3730a3">
                {t("accountOrders.case.storeCreditIssued", { amount: formatMoney(caseData.storeCredit.amountCents ?? 0) })}
              </AppText>
              <AppText variant="caption" color="#4f46e5">
                {formatDate(caseData.storeCredit.createdAt)}
              </AppText>
            </View>
          </View>
        )}

        {caseData.replacementShipment && (
          <View style={[st.banner, { backgroundColor: "#fef3c7", borderColor: "#fde68a" }]}>
            <Icon name="inventory-2" size={24} color="#d97706" />
            <View style={{ flex: 1 }}>
              <AppText weight="bold" color="#92400e">
                {caseData.replacementShipment.status === "DELIVERED"
                  ? t("accountOrders.case.replacementDelivered")
                  : t("accountOrders.case.replacementOnTheWay")}
              </AppText>
              {caseData.replacementShipment.trackingNumber && (
                <AppText variant="caption" color="#d97706">
                  {caseData.replacementShipment.carrier || t("accountOrders.case.carrierFallback")} •{" "}
                  {caseData.replacementShipment.trackingNumber}
                </AppText>
              )}
            </View>
            {replTrackUrl ? (
              <Pressable onPress={() => Linking.openURL(replTrackUrl)}>
                <AppText variant="caption" color="#d97706" weight="bold">
                  {t("accountOrders.case.track")}
                </AppText>
              </Pressable>
            ) : null}
          </View>
        )}

        <View style={st.card}>
          <View style={st.caseHeader}>
            <View>
              <AppText variant="caption" color={colors.muted}>
                {t("accountOrders.case.caseNumber", { id: caseData.id })}
              </AppText>
              <AppText variant="caption" color={colors.muted}>
                {t("accountOrders.case.filed", { date: formatDate(caseData.createdAt) })}
              </AppText>
              {caseData.order?.orderNumber ? (
                <AppText variant="tiny" color={colors.gray400}>
                  {t("accountOrders.case.orderNumber", { number: caseData.order.orderNumber })}
                </AppText>
              ) : null}
            </View>
            <View style={[st.statusBadge, { backgroundColor: statusInfo.bg }]}>
              <View style={[st.statusDot, { backgroundColor: statusInfo.dotColor }]} />
              <AppText variant="tiny" weight="bold" color={statusInfo.fg}>
                {t(statusInfo.labelKey)}
              </AppText>
            </View>
          </View>

          {caseData.status === "OPEN" && (
            <View style={[st.infoBox, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}>
              <AppText variant="caption" color="#1e40af">
                {t("accountOrders.case.reviewingCase")}
              </AppText>
            </View>
          )}

          {caseData.status === "RESOLVED" && (
            <View style={[st.infoBox, { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" }]}>
              <AppText variant="caption" color="#065f46">
                {resolvedMessage(caseData)}
              </AppText>
            </View>
          )}

          {caseData.status === "CLOSED" && (
            <View style={[st.infoBox, { backgroundColor: "#f9fafb", borderColor: "#e5e7eb" }]}>
              <AppText variant="caption" color="#6b7280">
                {t("accountOrders.case.closedMessage")}
              </AppText>
              <Pressable onPress={() => router.push(ROUTES.supportTicket)}>
                <AppText variant="caption" color={colors.brandBlue} weight="bold">
                  {t("accountOrders.case.contactSupport")}
                </AppText>
              </Pressable>
            </View>
          )}
        </View>

        <View style={st.card}>
          <AppText variant="subtitle" style={{ marginBottom: spacing[3] }}>
            {t("accountOrders.case.reportedItems")}
          </AppText>
          {caseData.items.map((item, idx) => {
            const imgSrc = pickCaseItemImage(item);
            return (
              <View key={item.publicId ?? String(idx)} style={st.itemRow}>
                {imgSrc ? (
                  <Image source={{ uri: imgSrc }} style={st.itemImg} resizeMode="cover" />
                ) : (
                  <View style={[st.itemImg, st.itemImgPlaceholder]}>
                    <Icon name="image" size={20} color={colors.gray300} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <AppText variant="label" numberOfLines={2}>
                    {itemTitle(item)}
                  </AppText>
                  {itemVariantLabel(item) ? (
                    <AppText variant="tiny" color={colors.muted}>
                      {itemVariantLabel(item)}
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="label">{t("accountOrders.case.qtyLabel", { count: item.quantity })}</AppText>
              </View>
            );
          })}
        </View>

        <View style={st.card}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing[2],
              marginBottom: spacing[3],
            }}
          >
            <Icon name="chat-bubble-outline" size={18} color={colors.muted} />
            <AppText variant="subtitle">{t("accountOrders.case.conversation")}</AppText>
          </View>
          <AppText variant="caption" color={colors.muted} style={{ marginBottom: spacing[3] }}>
            {t("accountOrders.case.conversationInInbox")}
          </AppText>
          <AppButton
            title={t("accountOrders.case.viewConversation")}
            variant="primary"
            fullWidth
            icon="mail-outline"
            onPress={() => router.push(ROUTES.accountCase(caseData.id))}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing[3],
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  caseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing[3],
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1.5],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1.5],
    borderRadius: 999,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  infoBox: {
    padding: spacing[3],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing[2],
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[2],
    backgroundColor: "#f9fafb",
    borderRadius: borderRadius.lg,
    marginBottom: spacing[2],
  },
  itemImg: { width: 56, height: 56, borderRadius: borderRadius.md },
  itemImgPlaceholder: {
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
});
