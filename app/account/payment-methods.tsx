import React, { useCallback, useMemo, useState } from "react";
import {
  View, FlatList, Pressable, Alert,
  StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";
import i18n from "@/i18n";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { usePaymentMethods, useStoreCreditBalance } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { showToast } from "@/lib/toast";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

function prettifyBrand(type?: string | null, brand?: string | null) {
  const b = (brand || "").trim();
  const t = (type || "").trim();
  if (t === "us_bank_account") return b || i18n.t("account.paymentMethods.bankAccount");
  if (t === "link") return i18n.t("account.paymentMethods.link");
  if (t === "cashapp") return i18n.t("account.paymentMethods.cashAppPay");
  if (!b) return i18n.t("account.paymentMethods.card");
  return b.charAt(0).toUpperCase() + b.slice(1);
}

function fmtExp(m?: number | null, y?: number | null) {
  if (!m || !y) return "";
  return `${String(m).padStart(2, "0")}/${String(y).slice(-2)}`;
}

function pmIcon(type?: string | null): string {
  if (type === "us_bank_account" || type === "sepa_debit") return "account-balance";
  if (type === "link") return "link";
  return "credit-card";
}

export default function PaymentMethodsScreen() {
  return <RequireAuth><PaymentMethodsContent /></RequireAuth>;
}

function PaymentMethodsContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  const {
    data: paymentData,
    isLoading: loading,
    refetch: refetchMethods,
    error: fetchError,
  } = usePaymentMethods();

  const { data: creditBalanceCents = 0 } = useStoreCreditBalance();

  const methods = paymentData ?? [];
  const displayError = error || (fetchError ? t("account.paymentMethods.errorLoad") : null);

  const setDefault = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await customerFetch(`/payments/methods/${id}/default`, { method: "PATCH" });
      await refetchMethods();
      showToast(t("account.paymentMethods.toastDefaultUpdated"), "success");
    } catch {
      showToast(t("account.paymentMethods.toastDefaultFailed"), "error");
    } finally {
      setBusyId(null);
    }
  }, [refetchMethods, t]);

  const removeMethod = useCallback(async (id: string) => {
    Alert.alert(
      t("account.paymentMethods.removeTitle"),
      t("account.paymentMethods.removeConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            setBusyId(id);
            try {
              await customerFetch(`/payments/methods/${id}`, { method: "DELETE" });
              await refetchMethods();
              showToast(t("account.paymentMethods.toastRemoved"), "success");
            } catch {
              showToast(t("account.paymentMethods.toastRemoveFailed"), "error");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }, [refetchMethods, t]);

  const handleAddCard = useCallback(async () => {
    if (addingCard) return;
    setAddingCard(true);
    setError(null);
    try {
      const data = await customerFetch<{ clientSecret: string }>("/payments/setup-intent", {
        method: "POST",
      });

      const { error: initError } = await initPaymentSheet({
        setupIntentClientSecret: data.clientSecret,
        merchantDisplayName: "Wabbus",
        returnURL: "wabbus://account/payment-methods",
      });

      if (initError) throw new Error(initError.message || t("account.paymentMethods.errorInitSetup"));

      // Small delay to let the navigation stack settle before presenting
      // the native Stripe view controller — prevents SIGABRT on iOS
      await new Promise((r) => setTimeout(r, 500));

      let presentError: any = null;
      try {
        const result = await presentPaymentSheet();
        presentError = result.error;
      } catch (nativeErr: any) {
        // Native-level crash from Stripe's UIViewController presentation.
        // Gracefully handle instead of letting the app crash.
        console.warn("[Stripe] presentPaymentSheet native error:", nativeErr);
        setError(t("account.paymentMethods.errorSetupFailed"));
        return;
      }

      if (presentError) {
        if (presentError.code === "Canceled") return;
        throw new Error(presentError.message || t("account.paymentMethods.errorSetupFailed"));
      }
      // The web calls /payments/confirm-setup after Stripe confirms the setup intent.
      // This tells the backend to attach the payment method to the customer.
      const setupIntentId = data.clientSecret.split("_secret_")[0];
      await customerFetch("/payments/confirm-setup", {
        method: "POST",
        body: JSON.stringify({ setupIntentId }),
      });

      await refetchMethods();
      showToast(t("account.paymentMethods.toastCardAdded"), "success");
    } catch (e: any) {
      setError(e.message || t("account.paymentMethods.errorAddCard"));
    } finally {
      setAddingCard(false);
    }
  }, [addingCard, refetchMethods, t]);

  const sorted = useMemo(
    () => [...methods].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault)),
    [methods],
  );

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <BackButton />
        <AppText variant="title">{t("account.paymentMethods.heading")}</AppText>
        <View style={{ width: 44 }} />
      </View>

      {displayError && (
        <View style={s.errorBanner}>
          <Icon name="error-outline" size={18} color={colors.error} />
          <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>{displayError}</AppText>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={s.loader} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.stripePaymentMethodId}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {creditBalanceCents > 0 && (
                <View style={s.creditCard}>
                  <Icon name="account-balance-wallet" size={24} color={colors.success} />
                  <View style={{ marginLeft: spacing[3], flex: 1 }}>
                    <AppText variant="label">{t("account.paymentMethods.storeCredit")}</AppText>
                    <AppText variant="body" color={colors.success} weight="bold">
                      {formatMoney(creditBalanceCents)}
                    </AppText>
                  </View>
                </View>
              )}

              {sorted.length > 0 && (
                <AppText variant="subtitle" style={s.sectionTitle}>{t("account.paymentMethods.savedMethods")}</AppText>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="credit-card" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted}>{t("account.paymentMethods.noSavedMethods")}</AppText>
              <AppText variant="body" color={colors.mutedLight} align="center">
                {t("account.paymentMethods.noSavedMethodsDesc")}
              </AppText>
            </View>
          }
          renderItem={({ item }) => {
            const busy = busyId === item.stripePaymentMethodId;
            const brandLabel = prettifyBrand(item.type, item.brand);
            const expLabel = fmtExp(item.expMonth, item.expYear);
            const iconName = pmIcon(item.type);

            return (
              <View style={[s.methodCard, item.isDefault && s.methodCardDefault]}>
                <View style={s.methodIconBox}>
                  <Icon name={iconName} size={22} color={colors.brandBlue} />
                </View>
                <View style={s.methodInfo}>
                  <View style={s.methodRow}>
                    <AppText variant="label">{brandLabel}</AppText>
                    {item.isDefault && (
                      <View style={s.defaultBadge}>
                        <AppText variant="tiny" color={colors.brandBlue} weight="bold">{t("account.paymentMethods.default")}</AppText>
                      </View>
                    )}
                  </View>
                  {item.last4 && (
                    <AppText variant="body" color={colors.muted}>•••• {item.last4}</AppText>
                  )}
                  {expLabel && (
                    <AppText variant="caption" color={colors.mutedLight}>{t("account.paymentMethods.expires", { exp: expLabel })}</AppText>
                  )}
                </View>
                <View style={s.methodActions}>
                  {!item.isDefault && (
                    <Pressable
                      onPress={() => setDefault(item.stripePaymentMethodId)}
                      disabled={busy}
                      style={s.actionBtn}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={colors.brandBlue} />
                      ) : (
                        <AppText variant="tiny" color={colors.brandBlue} weight="semibold">{t("account.paymentMethods.setDefault")}</AppText>
                      )}
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => removeMethod(item.stripePaymentMethodId)}
                    disabled={busy}
                    style={s.actionBtn}
                  >
                    <Icon name="delete-outline" size={18} color={busy ? colors.gray300 : colors.error} />
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListFooterComponent={
            <View style={s.footerWrap}>
              <Pressable
                onPress={handleAddCard}
                disabled={addingCard}
                style={[s.addPill, addingCard && { opacity: 0.6 }]}
              >
                {addingCard ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Icon name="add" size={22} color={colors.white} />
                )}
                <AppText variant="body" weight="bold" color={colors.white}>
                  {t("account.paymentMethods.addPaymentMethod")}
                </AppText>
              </Pressable>
              <View style={s.footer}>
                <Icon name="lock" size={14} color={colors.mutedLight} />
                <AppText variant="tiny" color={colors.mutedLight} style={{ marginLeft: spacing[1] }}>
                  {t("account.paymentMethods.securedByStripe")}
                </AppText>
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[2], paddingVertical: spacing[2],
  },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    marginHorizontal: spacing[4], marginTop: spacing[2],
    backgroundColor: colors.errorLight, borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  loader: { marginTop: spacing[16] },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  sectionTitle: { marginTop: spacing[4], marginBottom: spacing[3] },

  creditCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.successLight, borderRadius: borderRadius.xl,
    padding: spacing[4], marginTop: spacing[2],
  },

  empty: {
    alignItems: "center", justifyContent: "center",
    paddingVertical: spacing[16], gap: spacing[3],
  },

  methodCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[4], marginBottom: spacing[3],
    borderWidth: 1, borderColor: colors.transparent,
    ...shadows.sm,
  },
  methodCardDefault: {
    borderColor: colors.brandBlueBorder,
  },
  methodIconBox: {
    width: 44, height: 44, borderRadius: borderRadius.lg,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center", justifyContent: "center",
    marginRight: spacing[3],
  },
  methodInfo: { flex: 1 },
  methodRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  defaultBadge: {
    backgroundColor: colors.brandBlueLight,
    paddingHorizontal: spacing[1.5], paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
  methodActions: {
    alignItems: "flex-end", gap: spacing[2], marginLeft: spacing[2],
  },
  actionBtn: {
    paddingVertical: spacing[1], paddingHorizontal: spacing[2],
  },

  footer: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: spacing[4],
  },
  footerWrap: {
    paddingTop: spacing[4],
  },
  addPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    backgroundColor: colors.brandBlue,
    borderRadius: borderRadius.full,
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[6],
  },
});
