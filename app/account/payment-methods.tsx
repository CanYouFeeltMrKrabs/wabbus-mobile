import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, FlatList, Pressable, Alert,
  StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { showToast } from "@/lib/toast";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import type { PaymentMethod } from "@/lib/types";

function prettifyBrand(type?: string | null, brand?: string | null) {
  const b = (brand || "").trim();
  const t = (type || "").trim();
  if (t === "us_bank_account") return b || "Bank account";
  if (t === "link") return "Link";
  if (t === "cashapp") return "Cash App Pay";
  if (!b) return "Card";
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
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [creditBalanceCents, setCreditBalanceCents] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addingCard, setAddingCard] = useState(false);

  const loadMethods = useCallback(async () => {
    try {
      setError(null);
      const [methodsData, creditData] = await Promise.all([
        customerFetch<any>("/payments/methods"),
        customerFetch<{ balanceCents?: number }>("/payments/credit-balance").catch(() => null),
      ]);

      const list = Array.isArray(methodsData)
        ? methodsData
        : Array.isArray(methodsData?.methods)
          ? methodsData.methods
          : [];

      setMethods(list);
      setCreditBalanceCents(creditData?.balanceCents ?? 0);
    } catch {
      setError("Unable to load payment methods.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => { loadMethods(); }, [loadMethods]);

  const setDefault = useCallback(async (id: string) => {
    setBusyId(id);
    try {
      await customerFetch(`/payments/methods/${id}/default`, { method: "PATCH" });
      await loadMethods();
      showToast("Default payment method updated", "success");
    } catch {
      showToast("Failed to update default", "error");
    } finally {
      setBusyId(null);
    }
  }, [loadMethods]);

  const removeMethod = useCallback(async (id: string) => {
    Alert.alert(
      "Remove Payment Method",
      "Are you sure you want to remove this payment method?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusyId(id);
            try {
              await customerFetch(`/payments/methods/${id}`, { method: "DELETE" });
              await loadMethods();
              showToast("Payment method removed", "success");
            } catch {
              showToast("Failed to remove payment method", "error");
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }, [loadMethods]);

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

      if (initError) throw new Error(initError.message || "Could not initialize card setup.");

      const { error: presentError } = await presentPaymentSheet();

      if (presentError) {
        if (presentError.code === "Canceled") return;
        throw new Error(presentError.message || "Card setup failed.");
      }

      await loadMethods();
      showToast("Card added successfully", "success");
    } catch (e: any) {
      setError(e.message || "Unable to add card. Please try again.");
    } finally {
      setAddingCard(false);
    }
  }, [addingCard, loadMethods]);

  const sorted = useMemo(
    () => [...methods].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault)),
    [methods],
  );

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Payment Methods</AppText>
        <Pressable onPress={handleAddCard} disabled={addingCard} hitSlop={8} style={{ width: 44, alignItems: "center", justifyContent: "center" }}>
          {addingCard ? (
            <ActivityIndicator size="small" color={colors.brandBlue} />
          ) : (
            <Icon name="add-circle-outline" size={26} color={colors.brandBlue} />
          )}
        </Pressable>
      </View>

      {error && (
        <View style={s.errorBanner}>
          <Icon name="error-outline" size={18} color={colors.error} />
          <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>{error}</AppText>
        </View>
      )}

      {!loaded ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={s.loader} />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(m) => m.stripePaymentMethodId}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Store credit balance */}
              {creditBalanceCents > 0 && (
                <View style={s.creditCard}>
                  <Icon name="account-balance-wallet" size={24} color={colors.success} />
                  <View style={{ marginLeft: spacing[3], flex: 1 }}>
                    <AppText variant="label">Store Credit</AppText>
                    <AppText variant="body" color={colors.success} weight="bold">
                      {formatMoney(creditBalanceCents)}
                    </AppText>
                  </View>
                </View>
              )}

              {sorted.length > 0 && (
                <AppText variant="subtitle" style={s.sectionTitle}>Saved Methods</AppText>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Icon name="credit-card" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted}>No saved payment methods</AppText>
              <AppText variant="body" color={colors.mutedLight} align="center">
                Payment methods are saved automatically during checkout.
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
                        <AppText variant="tiny" color={colors.brandBlue} weight="bold">DEFAULT</AppText>
                      </View>
                    )}
                  </View>
                  {item.last4 && (
                    <AppText variant="body" color={colors.muted}>•••• {item.last4}</AppText>
                  )}
                  {expLabel && (
                    <AppText variant="caption" color={colors.mutedLight}>Expires {expLabel}</AppText>
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
                        <AppText variant="tiny" color={colors.brandBlue} weight="semibold">Set Default</AppText>
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
            <View style={s.footer}>
              <Icon name="lock" size={14} color={colors.mutedLight} />
              <AppText variant="tiny" color={colors.mutedLight} style={{ marginLeft: spacing[1] }}>
                Payment info is secured by Stripe
              </AppText>
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
    paddingVertical: spacing[6],
  },
});
