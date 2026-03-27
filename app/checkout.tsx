import React, { useCallback } from "react";
import {
  View, ScrollView, Pressable, TextInput, Switch,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useCheckout, type CheckoutStep } from "@/lib/useCheckout";
import { formatMoney } from "@/lib/money";
import { FALLBACK_IMAGE } from "@/lib/config";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import type { CheckoutAddress } from "@/lib/types";

function StepIndicator({ current }: { current: CheckoutStep }) {
  const steps: { key: CheckoutStep; label: string }[] = [
    { key: "address", label: "Address" },
    { key: "payment", label: "Payment" },
    { key: "review", label: "Review" },
  ];

  const idx = steps.findIndex((s) => s.key === current);

  return (
    <View style={si.row}>
      {steps.map((s, i) => {
        const done = i < idx;
        const active = s.key === current;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <View style={[si.line, (done || active) && si.lineActive]} />
            )}
            <View style={[si.dot, done && si.dotDone, active && si.dotActive]}>
              {done ? (
                <Icon name="check" size={12} color={colors.white} />
              ) : (
                <AppText variant="tiny" color={active ? colors.white : colors.muted} weight="bold">
                  {i + 1}
                </AppText>
              )}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const si = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: spacing[3] },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.gray200, alignItems: "center", justifyContent: "center",
  },
  dotActive: { backgroundColor: colors.brandBlue },
  dotDone: { backgroundColor: colors.success },
  line: { flex: 1, height: 2, backgroundColor: colors.gray200, marginHorizontal: spacing[2], maxWidth: 60 },
  lineActive: { backgroundColor: colors.brandBlue },
});

function Field({ label, value, onChangeText, placeholder, autoCapitalize, keyboardType, autoComplete }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; autoCapitalize?: "none" | "words" | "sentences";
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  autoComplete?: string;
}) {
  return (
    <View style={f.field}>
      <AppText variant="caption" weight="semibold" style={f.label}>{label}</AppText>
      <TextInput
        style={f.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        autoCapitalize={autoCapitalize ?? "words"}
        keyboardType={keyboardType ?? "default"}
        autoComplete={autoComplete as any}
      />
    </View>
  );
}

const f = StyleSheet.create({
  field: { marginBottom: spacing[3] },
  label: { marginBottom: spacing[1] },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3], paddingVertical: spacing[2.5],
    fontSize: fontSize.base, color: colors.foreground, backgroundColor: colors.white,
  },
});

function AddressCard({ addr, selected, onSelect }: {
  addr: CheckoutAddress; selected: boolean; onSelect: () => void;
}) {
  const name = [addr.firstName, addr.lastName].filter(Boolean).join(" ") || addr.fullName || "Address";
  return (
    <Pressable
      style={[ac.card, selected && ac.cardSelected]}
      onPress={onSelect}
    >
      <View style={ac.radio}>
        <View style={[ac.radioOuter, selected && ac.radioOuterActive]}>
          {selected && <View style={ac.radioInner} />}
        </View>
      </View>
      <View style={ac.info}>
        <AppText variant="label">{name}</AppText>
        <AppText variant="caption" color={colors.muted}>
          {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}
        </AppText>
        <AppText variant="caption" color={colors.muted}>
          {addr.city}, {addr.state} {addr.postalCode}
        </AppText>
      </View>
      {addr.isDefault && (
        <View style={ac.badge}>
          <AppText variant="tiny" color={colors.brandBlue} weight="bold">DEFAULT</AppText>
        </View>
      )}
    </Pressable>
  );
}

const ac = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[4], marginBottom: spacing[2],
    borderWidth: 2, borderColor: colors.transparent,
    ...shadows.sm,
  },
  cardSelected: { borderColor: colors.brandBlue },
  radio: { marginRight: spacing[3] },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.gray300,
    alignItems: "center", justifyContent: "center",
  },
  radioOuterActive: { borderColor: colors.brandBlue },
  radioInner: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.brandBlue,
  },
  info: { flex: 1 },
  badge: {
    backgroundColor: colors.brandBlueLight,
    paddingHorizontal: spacing[2], paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
  },
});

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCheckout();

  const goBack = useCallback(() => {
    if (c.step === "payment") c.setStep("address");
    else if (c.step === "review") c.setStep("payment");
    else router.back();
  }, [c.step, router]);

  const stepTitle =
    c.step === "address" ? "Shipping" :
    c.step === "payment" ? "Payment" :
    c.step === "placing" ? "Placing Order" :
    "Review & Pay";

  if (c.cartLoading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
        <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[3] }}>
          Loading checkout…
        </AppText>
      </View>
    );
  }

  if (c.cartItems.length === 0) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Icon name="shopping-cart" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted}>Your cart is empty</AppText>
        <AppButton title="Continue Shopping" variant="primary" onPress={() => router.back()} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[s.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={goBack} hitSlop={12}>
          <Icon name={c.step === "address" ? "close" : "arrow-back"} size={24} color={colors.foreground} />
        </Pressable>
        <AppText variant="title">{stepTitle}</AppText>
        <View style={{ width: 24 }} />
      </View>

      {c.step !== "placing" && <StepIndicator current={c.step} />}

      {c.error && (
        <View style={s.errorBanner}>
          <Icon name="error-outline" size={18} color={colors.error} />
          <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>
            {c.error}
          </AppText>
        </View>
      )}

      {/* ── PLACING (spinner) ── */}
      {c.step === "placing" && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
          <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[4] }}>
            Placing your order…
          </AppText>
          <AppText variant="caption" color={colors.mutedLight} style={{ marginTop: spacing[1] }}>
            Please don't close the app
          </AppText>
        </View>
      )}

      {/* ── ADDRESS STEP ── */}
      {c.step === "address" && (
        <>
          <ScrollView
            contentContainerStyle={s.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Guest email */}
            {c.isGuest && (
              <View style={s.section}>
                <AppText variant="subtitle" style={s.sectionTitle}>Contact</AppText>
                <Field
                  label="Email"
                  value={c.guestEmail}
                  onChangeText={c.setGuestEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <AppText variant="tiny" color={colors.mutedLight}>
                  We'll send your order confirmation here.
                </AppText>
              </View>
            )}

            <View style={s.section}>
              <AppText variant="subtitle" style={s.sectionTitle}>Shipping Address</AppText>

              {c.isGuest ? (
                <>
                  <View style={s.row}>
                    <View style={s.halfField}>
                      <Field label="First name" value={c.guestFirstName} onChangeText={c.setGuestFirstName} autoComplete="given-name" />
                    </View>
                    <View style={s.halfField}>
                      <Field label="Last name" value={c.guestLastName} onChangeText={c.setGuestLastName} autoComplete="family-name" />
                    </View>
                  </View>
                  <Field label="Address" value={c.guestLine1} onChangeText={c.setGuestLine1} autoComplete="street-address" />
                  <Field label="Apt / Suite (optional)" value={c.guestLine2} onChangeText={c.setGuestLine2} />
                  <View style={s.row}>
                    <View style={s.halfField}>
                      <Field label="City" value={c.guestCity} onChangeText={c.setGuestCity} />
                    </View>
                    <View style={s.halfField}>
                      <Field label="State" value={c.guestState} onChangeText={c.setGuestState} />
                    </View>
                  </View>
                  <View style={s.row}>
                    <View style={s.halfField}>
                      <Field label="ZIP" value={c.guestPostcode} onChangeText={c.setGuestPostcode} keyboardType="numeric" autoComplete="postal-code" />
                    </View>
                    <View style={s.halfField}>
                      <Field label="Phone (optional)" value={c.guestPhone} onChangeText={c.setGuestPhone} keyboardType="phone-pad" autoComplete="tel" />
                    </View>
                  </View>
                </>
              ) : (
                <>
                  {c.addresses.map((addr) => (
                    <AddressCard
                      key={addr.publicId}
                      addr={addr}
                      selected={c.shippingAddressId === addr.publicId}
                      onSelect={() => c.setShippingAddressId(addr.publicId)}
                    />
                  ))}

                  {c.showAddAddress ? (
                    <View style={s.addForm}>
                      <AppText variant="label" style={{ marginBottom: spacing[3] }}>New Address</AppText>
                      <View style={s.row}>
                        <View style={s.halfField}>
                          <Field label="First name" value={c.newAddrFirst} onChangeText={c.setNewAddrFirst} />
                        </View>
                        <View style={s.halfField}>
                          <Field label="Last name" value={c.newAddrLast} onChangeText={c.setNewAddrLast} />
                        </View>
                      </View>
                      <Field label="Address" value={c.newAddrLine1} onChangeText={c.setNewAddrLine1} />
                      <Field label="Apt / Suite (optional)" value={c.newAddrLine2} onChangeText={c.setNewAddrLine2} />
                      <View style={s.row}>
                        <View style={s.halfField}>
                          <Field label="City" value={c.newAddrCity} onChangeText={c.setNewAddrCity} />
                        </View>
                        <View style={s.halfField}>
                          <Field label="State" value={c.newAddrState} onChangeText={c.setNewAddrState} />
                        </View>
                      </View>
                      <View style={s.row}>
                        <View style={s.halfField}>
                          <Field label="ZIP" value={c.newAddrPostcode} onChangeText={c.setNewAddrPostcode} keyboardType="numeric" />
                        </View>
                        <View style={s.halfField}>
                          <Field label="Phone (opt)" value={c.newAddrPhone} onChangeText={c.setNewAddrPhone} keyboardType="phone-pad" />
                        </View>
                      </View>
                      <View style={s.row}>
                        <AppButton
                          title={c.savingAddress ? "Saving…" : "Save Address"}
                          variant="primary"
                          onPress={c.handleAddAddress}
                          disabled={c.savingAddress}
                          style={{ flex: 1, marginRight: spacing[2] }}
                        />
                        <AppButton
                          title="Cancel"
                          variant="outline"
                          onPress={() => c.setShowAddAddress(false)}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </View>
                  ) : (
                    <AppButton
                      title="Add New Address"
                      variant="outline"
                      icon="add"
                      onPress={() => c.setShowAddAddress(true)}
                      fullWidth
                      style={{ marginTop: spacing[1] }}
                    />
                  )}
                </>
              )}
            </View>
          </ScrollView>

          <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
            <AppButton
              title="Continue to Payment"
              variant="primary"
              fullWidth
              size="lg"
              disabled={!c.canProceedToPayment}
              onPress={() => { c.setError(null); c.setStep("payment"); }}
            />
          </View>
        </>
      )}

      {/* ── PAYMENT STEP ── */}
      {c.step === "payment" && (
        <>
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* Store credit */}
            {!c.isGuest && c.creditBalanceCents > 0 && (
              <View style={s.section}>
                <View style={s.creditRow}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">Store Credit</AppText>
                    <AppText variant="caption" color={colors.muted}>
                      {formatMoney(c.creditBalanceCents)} available
                    </AppText>
                    {c.useStoreCredit && (
                      <AppText variant="tiny" color={colors.success}>
                        {c.creditFullyCovered
                          ? "Fully covers this order"
                          : `−${formatMoney(c.creditApplicableCents)} applied`}
                      </AppText>
                    )}
                  </View>
                  <Switch
                    value={c.useStoreCredit}
                    onValueChange={c.setUseStoreCredit}
                    trackColor={{ true: colors.brandBlue, false: colors.gray200 }}
                    thumbColor={colors.white}
                  />
                </View>
              </View>
            )}

            <View style={s.section}>
              <AppText variant="subtitle" style={s.sectionTitle}>Payment Method</AppText>
              {c.creditFullyCovered ? (
                <View style={s.creditCoveredCard}>
                  <Icon name="check-circle" size={24} color={colors.success} />
                  <AppText variant="body" color={colors.success} style={{ marginLeft: spacing[2], flex: 1 }}>
                    Store credit covers this order — no additional payment needed
                  </AppText>
                </View>
              ) : (
                <View style={s.stripeCard}>
                  <Icon name="credit-card" size={24} color={colors.brandBlue} />
                  <View style={{ marginLeft: spacing[3], flex: 1 }}>
                    <AppText variant="label">Card Payment</AppText>
                    <AppText variant="caption" color={colors.muted}>
                      You'll enter card details securely on the next step via Stripe
                    </AppText>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
            <AppButton
              title="Review Order"
              variant="primary"
              fullWidth
              size="lg"
              onPress={() => { c.setError(null); c.setStep("review"); }}
            />
          </View>
        </>
      )}

      {/* ── REVIEW STEP ── */}
      {c.step === "review" && (
        <>
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* Shipping summary */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <AppText variant="subtitle">Shipping</AppText>
                <Pressable onPress={() => c.setStep("address")}>
                  <AppText variant="caption" color={colors.brandBlue} weight="semibold">Edit</AppText>
                </Pressable>
              </View>
              {c.isGuest ? (
                <View style={s.summaryCard}>
                  <AppText variant="label">{c.guestFirstName} {c.guestLastName}</AppText>
                  <AppText variant="caption" color={colors.muted}>{c.guestLine1}</AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {c.guestCity}, {c.guestState} {c.guestPostcode}
                  </AppText>
                </View>
              ) : (
                (() => {
                  const addr = c.addresses.find((a) => a.publicId === c.shippingAddressId);
                  if (!addr) return null;
                  const name = [addr.firstName, addr.lastName].filter(Boolean).join(" ") || addr.fullName || "";
                  return (
                    <View style={s.summaryCard}>
                      <AppText variant="label">{name}</AppText>
                      <AppText variant="caption" color={colors.muted}>{addr.line1}</AppText>
                      <AppText variant="caption" color={colors.muted}>
                        {addr.city}, {addr.state} {addr.postalCode}
                      </AppText>
                    </View>
                  );
                })()
              )}
            </View>

            {/* Items */}
            <View style={s.section}>
              <AppText variant="subtitle" style={s.sectionTitle}>
                Items ({c.cartItems.length})
              </AppText>
              {c.cartItems.map((item) => (
                <View key={item.publicId} style={s.itemRow}>
                  <Image
                    source={{ uri: item.image || FALLBACK_IMAGE }}
                    style={s.itemImg}
                    resizeMode="cover"
                  />
                  <View style={s.itemInfo}>
                    <AppText variant="caption" numberOfLines={2}>{item.title}</AppText>
                    <AppText variant="tiny" color={colors.muted}>Qty: {item.quantity}</AppText>
                  </View>
                  <AppText variant="label">{formatMoney(item.unitPriceCents * item.quantity)}</AppText>
                </View>
              ))}
            </View>

            {/* Totals */}
            <View style={s.section}>
              <View style={s.totalRow}>
                <AppText variant="body" color={colors.muted}>Subtotal</AppText>
                <AppText variant="body">{formatMoney(c.serverCart?.subtotalCents ?? c.subtotalCents)}</AppText>
              </View>
              {c.serverCart && (
                <>
                  <View style={s.totalRow}>
                    <AppText variant="body" color={colors.muted}>Shipping</AppText>
                    <AppText variant="body">
                      {c.serverCart.shippingCents === 0 ? "Free" : formatMoney(c.serverCart.shippingCents)}
                    </AppText>
                  </View>
                  <View style={s.totalRow}>
                    <AppText variant="body" color={colors.muted}>Tax</AppText>
                    <AppText variant="body">{formatMoney(c.serverCart.taxCents)}</AppText>
                  </View>
                </>
              )}
              {c.creditApplicableCents > 0 && (
                <View style={s.totalRow}>
                  <AppText variant="body" color={colors.success}>Store Credit</AppText>
                  <AppText variant="body" color={colors.success}>−{formatMoney(c.creditApplicableCents)}</AppText>
                </View>
              )}
              <View style={[s.totalRow, s.totalRowFinal]}>
                <AppText variant="subtitle">Total</AppText>
                <AppText variant="title" color={c.creditFullyCovered ? colors.success : colors.foreground}>
                  {c.creditFullyCovered ? "$0.00" : formatMoney(c.stripeAmountCents > 0 ? c.stripeAmountCents : c.totalCents)}
                </AppText>
              </View>
            </View>
          </ScrollView>

          <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
            <AppButton
              title={c.placingOrder
                ? "Placing Order…"
                : c.creditFullyCovered
                  ? "Place Order"
                  : `Pay ${formatMoney(c.stripeAmountCents > 0 ? c.stripeAmountCents : c.totalCents)}`
              }
              variant="primary"
              fullWidth
              size="lg"
              loading={c.placingOrder}
              disabled={!c.canPlaceOrder}
              onPress={c.handlePay}
            />
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingVertical: spacing[3],
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    marginHorizontal: spacing[4], marginTop: spacing[2],
    backgroundColor: colors.errorLight, borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[24] },
  section: { marginTop: spacing[5] },
  sectionTitle: { marginBottom: spacing[3] },
  sectionHeader: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: spacing[3],
  },
  row: { flexDirection: "row", gap: spacing[2] },
  halfField: { flex: 1 },
  addForm: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[4], marginTop: spacing[2], ...shadows.sm,
  },
  bottomBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing[4], paddingTop: spacing[3],
    borderTopWidth: 1, borderTopColor: colors.border,
    ...shadows.lg,
  },
  creditRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[4], ...shadows.sm,
  },
  creditCoveredCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.successLight, borderRadius: borderRadius.xl,
    padding: spacing[4],
  },
  stripeCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[4], ...shadows.sm,
  },
  summaryCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl,
    padding: spacing[4], ...shadows.sm,
  },
  itemRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    padding: spacing[3], marginBottom: spacing[2], ...shadows.sm,
  },
  itemImg: { width: 52, height: 52, borderRadius: borderRadius.md, marginRight: spacing[3] },
  itemInfo: { flex: 1, marginRight: spacing[2] },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing[1.5],
  },
  totalRowFinal: {
    borderTopWidth: 1, borderTopColor: colors.border,
    marginTop: spacing[2], paddingTop: spacing[3],
  },
});
