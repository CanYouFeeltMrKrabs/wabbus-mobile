import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Image,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import BackButton from "@/components/ui/BackButton";
import RequireAuth from "@/components/ui/RequireAuth";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { customerFetch } from "@/lib/api";
import { productImageUrl } from "@/lib/image";
import { ROUTES } from "@/lib/routes";
import { ALLOWED_ATTACH_TYPES, MAX_ATTACH_SIZE } from "@/lib/constants";
import { pickDocument, uploadFileAuth, type PickedFile } from "@/lib/fileUpload";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import { useTranslation } from "@/hooks/useT";
import i18n from "@/i18n";

type Step = "select" | "reason" | "compose" | "success";

type SelectableItem = {
  key: string;
  itemId: string;
  orderId: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  title: string;
  variantLabel?: string;
  imageUrl: string | null;
};

const REASON_OPTIONS = [
  {
    value: "ORDER_ISSUE",
    labelKey: "support.messageSeller.reasonOrderIssue",
    descKey: "support.messageSeller.reasonOrderIssueDesc",
  },
  {
    value: "SHIPPING",
    labelKey: "support.messageSeller.reasonShipping",
    descKey: "support.messageSeller.reasonShippingDesc",
  },
  {
    value: "PRODUCT_QUALITY",
    labelKey: "support.messageSeller.reasonProductQuality",
    descKey: "support.messageSeller.reasonProductQualityDesc",
  },
  {
    value: "GENERAL",
    labelKey: "support.messageSeller.reasonGeneral",
    descKey: "support.messageSeller.reasonGeneralDesc",
  },
  {
    value: "OTHER",
    labelKey: "support.messageSeller.reasonOther",
    descKey: "support.messageSeller.reasonOtherDesc",
  },
  {
    value: "CANCELLATION_REQUEST",
    labelKey: "support.messageSeller.reasonCancellation",
    descKey: "support.messageSeller.reasonCancellationDesc",
  },
];

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function parseOrderItems(order: any): SelectableItem[] {
  const rawItems: any[] = Array.isArray(order?.items)
    ? order.items
    : Array.isArray(order?.orderItems)
      ? order.orderItems
      : [];

  const orderPublicId = safeStr(order?.publicId ?? order?.id ?? "");
  const orderNumber = safeStr(order?.orderNumber ?? orderPublicId);

  const parsed: SelectableItem[] = [];
  for (const it of rawItems) {
    const itemPublicId = safeStr(it?.publicId ?? it?.id ?? "");
    const vendorPublicId = safeStr(it?.vendor?.publicId ?? it?.vendorPublicId ?? it?.vendorId ?? "");
    if (!itemPublicId || !vendorPublicId) continue;

    const vendorName =
      safeStr(it?.vendor?.name) || safeStr(it?.vendorName) || i18n.t("support.messageSeller.vendorFallback");
    const title =
      safeStr(it?.productVariant?.product?.title) ||
      safeStr(it?.productVariant?.title) ||
      safeStr(it?.title) ||
      i18n.t("support.messageSeller.itemFallback", { id: itemPublicId });
    const vt = safeStr(it?.productVariant?.title).trim();

    const imgUrl =
      it?.productVariant?.product?.images?.[0]?.url ||
      it?.productVariant?.product?.imageUrl ||
      it?.imageUrl ||
      it?.image ||
      null;

    parsed.push({
      key: `${orderPublicId}-${itemPublicId}`,
      itemId: itemPublicId,
      orderId: orderPublicId,
      orderNumber,
      vendorId: vendorPublicId,
      vendorName,
      title,
      variantLabel: vt && vt !== "Default" ? vt : undefined,
      imageUrl: imgUrl ? productImageUrl(imgUrl, "thumb") : null,
    });
  }
  return parsed;
}

export default function MessageSellerScreen() {
  return (
    <RequireAuth>
      <MessageSellerWizard />
    </RequireAuth>
  );
}

function MessageSellerWizard() {
  const { t } = useTranslation();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: orderData, isLoading: loading } = useQuery({
    queryKey: queryKeys.orders.detail(orderId ?? "__none__"),
    queryFn: async () => {
      if (!orderId) return [];
      const data = await customerFetch<any>(`/orders/by-public-id/${orderId}`);
      const order = data?.order ?? data;
      let parsed = parseOrderItems(order);

      if (parsed.length === 0) {
        const allData = await customerFetch<any>("/orders?limit=50");
        const orders: any[] = Array.isArray(allData?.data)
          ? allData.data
          : Array.isArray(allData?.orders)
            ? allData.orders
            : Array.isArray(allData)
              ? allData
              : [];
        for (const o of orders) {
          parsed.push(...parseOrderItems(o));
        }
      }

      return parsed;
    },
    enabled: !!orderId,
  });

  const items: SelectableItem[] = Array.isArray(orderData) ? orderData : [];

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [conversationPublicId, setConversationPublicId] = useState<string | null>(null);
  const [attachedFile, setAttachedFile] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const sendingRef = useRef(false);

  const selectedItem = useMemo(() => items.find((it) => it.key === selectedKey) ?? null, [items, selectedKey]);

  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (!didAutoSelect.current && items.length === 1) {
      didAutoSelect.current = true;
      setSelectedKey(items[0].key);
      setStep("reason");
    }
  }, [items]);

  const handleAttach = useCallback(async () => {
    try {
      const result = await pickDocument({ type: ALLOWED_ATTACH_TYPES });
      if (!result) return;
      if (!ALLOWED_ATTACH_TYPES.includes(result.mimeType)) {
        Alert.alert(t("support.messageSeller.unsupportedFile"), t("support.messageSeller.unsupportedFileDesc"));
        return;
      }
      if (result.size && result.size > MAX_ATTACH_SIZE) {
        Alert.alert(t("support.messageSeller.fileTooLarge"), t("support.messageSeller.fileTooLargeDesc"));
        return;
      }
      setAttachedFile(result);
    } catch {
      // user cancelled
    }
  }, [t]);

  const handleSend = useCallback(async () => {
    if (sendingRef.current || !selectedItem || !messageBody.trim()) return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);

    try {
      const convData = await customerFetch<any>("/messages/conversations", {
        method: "POST",
        body: JSON.stringify({
          orderPublicId: selectedItem.orderId,
          vendorPublicId: selectedItem.vendorId,
        }),
      });

      const convPublicId = convData?.publicId ?? convData?.conversation?.publicId;
      if (!convPublicId) throw new Error("Could not create conversation.");

      let attachment: { key: string; fileName: string; mimeType: string; size: number } | undefined;
      if (attachedFile) {
        setUploading(true);
        try {
          const uploaded = await uploadFileAuth({
            presignUrl: "/uploads/customer-chat-attachment",
            confirmUrl: "/uploads/chat-attachment/confirm",
            file: attachedFile,
            extraPresignBody: { context: "convo", entityId: convPublicId },
          });
          if (uploaded.key) {
            attachment = {
              key: uploaded.key,
              fileName: attachedFile.name,
              mimeType: attachedFile.mimeType,
              size: attachedFile.size,
            };
          }
        } catch {
          // proceed without attachment
        }
        setUploading(false);
      }

      const msgPayload: Record<string, unknown> = { body: messageBody.trim() };
      if (selectedReason) msgPayload.reasonCode = selectedReason;
      if (attachment) msgPayload.attachment = attachment;

      await customerFetch(`/messages/conversations/${convPublicId}/messages`, {
        method: "POST",
        body: JSON.stringify(msgPayload),
      });

      setConversationPublicId(convPublicId);
      setStep("success");
    } catch {
      setSendError(t("support.messageSeller.sendError"));
    } finally {
      setSending(false);
      sendingRef.current = false;
    }
  }, [selectedItem, messageBody, selectedReason, attachedFile, t]);

  const stepTitle =
    step === "select"
      ? t("support.messageSeller.stepSelect")
      : step === "reason"
        ? t("support.messageSeller.stepReason")
        : step === "compose"
          ? t("support.messageSeller.stepCompose")
          : t("support.messageSeller.stepSuccess");

  if (loading) {
    return (
      <View style={[st.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[st.screen, { paddingTop: insets.top }]}>
        <View style={st.header}>
          <BackButton
            icon={step === "select" || step === "success" ? "close" : "arrow-back"}
            onPress={() => {
              if (step === "success" || step === "select") router.back();
              else if (step === "compose") setStep("reason");
              else if (step === "reason") {
                if (items.length > 1) setStep("select");
                else router.back();
              }
            }}
            style={{ width: 44 }}
          />
          <AppText variant="title">{stepTitle}</AppText>
          <View style={{ width: 44 }} />
        </View>

        {step !== "success" && (
          <View style={st.progress}>
            {["select", "reason", "compose"].map((s) => {
              const idx = ["select", "reason", "compose"].indexOf(step);
              const dotIdx = ["select", "reason", "compose"].indexOf(s);
              return (
                <View
                  key={s}
                  style={[
                    st.progressDot,
                    {
                      backgroundColor: idx >= dotIdx ? colors.brandBlue : colors.gray200,
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        <ScrollView
          contentContainerStyle={st.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === "select" && (
            <>
              {items.length === 0 ? (
                <View style={st.emptyState}>
                  <Icon name="inbox" size={48} color={colors.gray300} />
                  <AppText variant="subtitle" color={colors.muted}>
                    {t("support.messageSeller.noItems")}
                  </AppText>
                </View>
              ) : (
                items.map((item) => (
                  <Pressable
                    key={item.key}
                    style={[st.selectCard, selectedKey === item.key && st.selectCardActive]}
                    onPress={() => setSelectedKey(item.key)}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={st.selectImg} resizeMode="cover" />
                    ) : (
                      <View
                        style={[
                          st.selectImg,
                          { backgroundColor: colors.gray100, alignItems: "center", justifyContent: "center" },
                        ]}
                      >
                        <Icon name="image" size={20} color={colors.gray300} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <AppText variant="label" numberOfLines={2}>
                        {item.title}
                      </AppText>
                      {item.variantLabel && (
                        <AppText variant="tiny" color={colors.muted}>
                          {item.variantLabel}
                        </AppText>
                      )}
                      <AppText variant="tiny" color={colors.muted}>
                        {t("support.messageSeller.soldBy", { name: item.vendorName })}
                      </AppText>
                      <AppText variant="tiny" color={colors.gray400}>
                        {t("support.messageSeller.orderLabel", { number: item.orderNumber.slice(0, 8) })}
                      </AppText>
                    </View>
                    <View style={[st.radio, selectedKey === item.key && st.radioActive]}>
                      {selectedKey === item.key && <View style={st.radioDot} />}
                    </View>
                  </Pressable>
                ))
              )}
              {selectedKey && (
                <AppButton
                  title={t("support.messageSeller.continue")}
                  variant="primary"
                  fullWidth
                  onPress={() => setStep("reason")}
                  style={{ marginTop: spacing[4] }}
                />
              )}
            </>
          )}

          {step === "reason" && (
            <>
              {REASON_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={[st.reasonCard, selectedReason === opt.value && st.reasonCardActive]}
                  onPress={() => setSelectedReason(opt.value)}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{t(opt.labelKey)}</AppText>
                    <AppText variant="tiny" color={colors.muted}>
                      {t(opt.descKey)}
                    </AppText>
                  </View>
                  <View style={[st.radio, selectedReason === opt.value && st.radioActive]}>
                    {selectedReason === opt.value && <View style={st.radioDot} />}
                  </View>
                </Pressable>
              ))}
              {selectedReason && (
                <AppButton
                  title={t("support.messageSeller.continue")}
                  variant="primary"
                  fullWidth
                  onPress={() => setStep("compose")}
                  style={{ marginTop: spacing[4] }}
                />
              )}
            </>
          )}

          {step === "compose" && selectedItem && (
            <>
              <View style={st.composePreview}>
                <AppText variant="tiny" color={colors.muted}>
                  {t("support.messageSeller.sendingTo", { name: selectedItem.vendorName })}
                </AppText>
                <AppText variant="label" numberOfLines={1}>
                  {selectedItem.title}
                </AppText>
              </View>

              <TextInput
                style={st.composeInput}
                multiline
                placeholder={t("support.messageSeller.composePlaceholder")}
                placeholderTextColor={colors.gray400}
                value={messageBody}
                onChangeText={setMessageBody}
                textAlignVertical="top"
              />

              <View style={st.composeActions}>
                <Pressable onPress={handleAttach} style={st.attachBtn}>
                  <Icon name="attach-file" size={20} color={colors.muted} />
                  <AppText variant="caption" color={colors.muted}>
                    {attachedFile ? t("support.messageSeller.fileAttached") : t("support.messageSeller.attachImage")}
                  </AppText>
                </Pressable>
                {attachedFile && (
                  <Pressable onPress={() => setAttachedFile(null)}>
                    <Icon name="close" size={18} color={colors.error} />
                  </Pressable>
                )}
              </View>

              {sendError && (
                <View style={st.errorBox}>
                  <AppText variant="caption" color={colors.error}>
                    {sendError}
                  </AppText>
                </View>
              )}

              <AppButton
                title={sending || uploading ? t("support.messageSeller.sending") : t("support.messageSeller.sendMessage")}
                variant="primary"
                fullWidth
                disabled={!messageBody.trim() || sending || uploading}
                onPress={handleSend}
                style={{ marginTop: spacing[4] }}
              />
            </>
          )}

          {step === "success" && (
            <View style={st.successState}>
              <View style={st.successIcon}>
                <Icon name="check-circle" size={56} color="#059669" />
              </View>
              <AppText variant="subtitle" style={{ textAlign: "center", marginTop: spacing[4] }}>
                {t("support.messageSeller.successTitle")}
              </AppText>
              <AppText variant="caption" color={colors.muted} style={{ textAlign: "center", marginTop: spacing[2] }}>
                {t("support.messageSeller.successSubtitle")}
              </AppText>

              <View style={{ marginTop: spacing[6], gap: spacing[3], width: "100%" }}>
                {conversationPublicId && (
                  <AppButton
                    title={t("support.messageSeller.viewConversation")}
                    variant="primary"
                    fullWidth
                    icon="chat-bubble-outline"
                    onPress={() => router.push(ROUTES.accountConversation(conversationPublicId) as any)}
                  />
                )}
                <AppButton
                  title={t("support.messageSeller.backToOrders")}
                  variant="outline"
                  fullWidth
                  onPress={() => router.push(ROUTES.orders as any)}
                />
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  progress: { flexDirection: "row", justifyContent: "center", gap: spacing[2], paddingBottom: spacing[3] },
  progressDot: { width: 32, height: 4, borderRadius: 2 },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },

  selectCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    marginBottom: spacing[2],
    borderWidth: 2,
    borderColor: "transparent",
    ...shadows.sm,
  },
  selectCardActive: { borderColor: colors.brandBlue },
  selectImg: { width: 56, height: 56, borderRadius: borderRadius.md },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.gray300,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: colors.brandBlue },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.brandBlue },

  reasonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[2],
    borderWidth: 2,
    borderColor: "transparent",
    ...shadows.sm,
  },
  reasonCardActive: { borderColor: colors.brandBlue },

  composePreview: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    marginBottom: spacing[4],
    ...shadows.sm,
  },
  composeInput: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    minHeight: 160,
    fontSize: fontSize.base,
    color: colors.foreground,
    ...shadows.sm,
  },
  composeActions: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: spacing[2] },
  attachBtn: { flexDirection: "row", alignItems: "center", gap: spacing[1] },
  errorBox: { backgroundColor: "#fee2e2", padding: spacing[3], borderRadius: borderRadius.lg, marginTop: spacing[2] },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: spacing[10] },
  successState: { alignItems: "center", paddingVertical: spacing[8] },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#ecfdf5",
    alignItems: "center",
    justifyContent: "center",
  },
});
