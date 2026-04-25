import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, ScrollView, Pressable, TextInput, Switch,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Image,
} from "react-native";
import KeyboardDoneBar, { KEYBOARD_DONE_ID } from "@/components/ui/KeyboardDoneBar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import BackButton from "@/components/ui/BackButton";
import { useCheckout } from "@/lib/useCheckout";
import { formatMoney } from "@/lib/money";
import { productImageUrl } from "@/lib/image";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import type { CheckoutAddress } from "@/lib/types";
import { trackEvent } from "@/lib/tracker";
import { trackCustomerEvent, flushCustomerEvents } from "@/lib/customerTracker";

/* ── Section card ────────────────────────────────────────────────────────── */

function SectionCard({
  title,
  complete,
  right,
  children,
}: {
  title: string;
  complete?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={sc.card}>
      <View style={sc.header}>
        <View style={sc.headerLeft}>
          {complete != null && (
            <Icon
              name="check-circle"
              size={16}
              color={complete ? colors.success : colors.gray300}
            />
          )}
          <AppText variant="body" weight="bold">{title}</AppText>
        </View>
        {right && <View>{right}</View>}
      </View>
      <View style={sc.body}>{children}</View>
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing[3],
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  body: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
  },
});

/* ── Text field ──────────────────────────────────────────────────────────── */

function Field({ label, value, onChangeText, placeholder, autoCapitalize, keyboardType, autoComplete }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; autoCapitalize?: "none" | "words" | "sentences";
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric";
  autoComplete?: string;
}) {
  return (
    <View style={f.field}>
      <AppText variant="bodySmall" weight="semibold" color={colors.slate600}>{label}</AppText>
      <TextInput
        style={f.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        autoCapitalize={autoCapitalize ?? "words"}
        keyboardType={keyboardType ?? "default"}
        autoComplete={autoComplete as any}
        inputAccessoryViewID={
          Platform.OS === "ios" && (keyboardType === "phone-pad" || keyboardType === "numeric")
            ? KEYBOARD_DONE_ID
            : undefined
        }
      />
    </View>
  );
}

const f = StyleSheet.create({
  field: { marginBottom: spacing[3] },
  input: {
    marginTop: spacing[1],
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3.5], paddingVertical: Platform.OS === "ios" ? spacing[3] : spacing[2.5],
    fontSize: fontSize.md, color: colors.foreground, backgroundColor: colors.white,
  },
});

/* ── Compact selected-address summary ────────────────────────────────────── */

function SelectedAddressSummary({ addr }: { addr: CheckoutAddress }) {
  const name = [addr.firstName, addr.lastName].filter(Boolean).join(" ") || addr.fullName || "";
  return (
    <View style={sa.card}>
      <Icon name="location-on" size={20} color={colors.brandBlue} />
      <View style={sa.text}>
        {!!name && <AppText variant="body" weight="semibold">{name}</AppText>}
        <AppText variant="body" color={colors.slate600}>
          {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}
        </AppText>
        <AppText variant="body" color={colors.slate600}>
          {addr.city}, {addr.state} {addr.postalCode}
        </AppText>
        {!!addr.phone && (
          <AppText variant="bodySmall" color={colors.muted}>{addr.phone}</AppText>
        )}
      </View>
    </View>
  );
}

const sa = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing[2.5],
    backgroundColor: colors.brandBlueLight,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: colors.brandBlueBorder,
  },
  text: { flex: 1, gap: spacing[0.5] },
});

/* ── Address picker radio card ───────────────────────────────────────────── */

function AddressRadio({ addr, selected, onSelect }: {
  addr: CheckoutAddress; selected: boolean; onSelect: () => void;
}) {
  const { t } = useTranslation();
  const name = [addr.firstName, addr.lastName].filter(Boolean).join(" ") || addr.fullName || t("checkout.addressFallback");
  return (
    <Pressable style={[ar.card, selected && ar.cardSelected]} onPress={onSelect}>
      <View style={[ar.dot, selected && ar.dotSelected]}>
        {selected && <View style={ar.dotInner} />}
      </View>
      <View style={ar.info}>
        <AppText variant="body" weight="medium">{name}</AppText>
        <AppText variant="bodySmall" color={colors.slate500}>
          {addr.line1}{addr.line2 ? `, ${addr.line2}` : ""}, {addr.city}, {addr.state} {addr.postalCode}
        </AppText>
      </View>
      {addr.isDefault && (
        <View style={ar.badge}>
          <AppText variant="caption" color={colors.brandBlue} weight="bold">{t("checkout.default")}</AppText>
        </View>
      )}
    </Pressable>
  );
}

const ar = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center",
    borderRadius: borderRadius.lg,
    padding: spacing[3], marginBottom: spacing[2],
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  cardSelected: { borderColor: colors.brandBlue, backgroundColor: colors.brandBlueLight },
  dot: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.gray300,
    alignItems: "center", justifyContent: "center",
    marginRight: spacing[3],
  },
  dotSelected: { borderColor: colors.brandBlue },
  dotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandBlue },
  info: { flex: 1 },
  badge: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing[1.5], paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.brandBlueBorder,
  },
});

/* ── Add-address form (used for both shipping + billing) ─────────────────── */

function AddAddressForm({
  first, setFirst, last, setLast,
  line1, setLine1, line2, setLine2,
  city, setCity, state, setState,
  postcode, setPostcode, phone, setPhone,
  saving, onSave, onCancel,
}: {
  first: string; setFirst: (v: string) => void;
  last: string; setLast: (v: string) => void;
  line1: string; setLine1: (v: string) => void;
  line2: string; setLine2: (v: string) => void;
  city: string; setCity: (v: string) => void;
  state: string; setState: (v: string) => void;
  postcode: string; setPostcode: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={af.wrap}>
      <View style={af.row}>
        <View style={af.half}><Field label={t("checkout.firstName")} value={first} onChangeText={setFirst} /></View>
        <View style={af.half}><Field label={t("checkout.lastName")} value={last} onChangeText={setLast} /></View>
      </View>
      <Field label={t("checkout.addressLabel")} value={line1} onChangeText={setLine1} autoComplete="street-address" />
      <Field label={t("checkout.aptSuiteOptional")} value={line2} onChangeText={setLine2} />
      <View style={af.row}>
        <View style={af.half}><Field label={t("checkout.city")} value={city} onChangeText={setCity} /></View>
        <View style={af.half}><Field label={t("checkout.state")} value={state} onChangeText={setState} /></View>
      </View>
      <View style={af.row}>
        <View style={af.half}><Field label={t("checkout.zip")} value={postcode} onChangeText={setPostcode} keyboardType="numeric" autoComplete="postal-code" /></View>
        <View style={af.half}><Field label={t("checkout.phoneOptional")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" /></View>
      </View>
      <View style={[af.row, { marginTop: spacing[1] }]}>
        <AppButton
          title={saving ? t("checkout.savingAddress") : t("checkout.saveAddress")}
          variant="primary"
          onPress={onSave}
          disabled={saving}
          style={{ flex: 1, marginRight: spacing[2] }}
        />
        <AppButton
          title={t("checkout.cancel")}
          variant="outline"
          onPress={onCancel}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

const af = StyleSheet.create({
  wrap: { marginTop: spacing[3], borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing[3] },
  row: { flexDirection: "row", gap: spacing[2] },
  half: { flex: 1 },
});

/* ── Totals row ──────────────────────────────────────────────────────────── */

function TotalRow({ label, value, bold, color: textColor }: {
  label: string; value: string; bold?: boolean; color?: string;
}) {
  return (
    <View style={trs.row}>
      <AppText
        variant={bold ? "body" : "body"}
        color={textColor ?? (bold ? colors.foreground : colors.muted)}
        weight={bold ? "bold" : undefined}
      >
        {label}
      </AppText>
      <AppText
        variant={bold ? "subtitle" : "body"}
        color={textColor ?? colors.foreground}
        weight={bold ? "bold" : undefined}
      >
        {value}
      </AppText>
    </View>
  );
}

const trs = StyleSheet.create({
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: spacing[1],
  },
});

/* ── Placing overlay with delayed cancel ──────────────────────────────────── */

function PlacingOverlay({ insetTop, onCancel }: { insetTop: number; onCancel: () => void }) {
  const { t } = useTranslation();
  const [showCancel, setShowCancel] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowCancel(true), 8_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[s.center, { paddingTop: insetTop }]}>
      <ActivityIndicator size="large" color={colors.brandBlue} />
      <AppText variant="subtitle" color={colors.foreground} style={{ marginTop: spacing[4] }}>
        {t("checkout.placingYourOrder")}
      </AppText>
      <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[1] }}>
        {t("checkout.dontCloseApp")}
      </AppText>
      {showCancel && (
        <AppButton
          title={t("checkout.cancel")}
          variant="ghost"
          onPress={onCancel}
          style={{ marginTop: spacing[8] }}
        />
      )}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  Main checkout screen                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const c = useCheckout();

  const [changingShipping, setChangingShipping] = useState(false);

  const beginCheckoutTracked = useRef(false);
  const placingOrderRef = useRef(false);
  placingOrderRef.current = c.placingOrder;
  const addressCompleteRef = useRef(c.addressComplete);
  addressCompleteRef.current = c.addressComplete;
  const totalCentsRef = useRef(c.totalCents);
  totalCentsRef.current = c.totalCents;
  const isGuestRef = useRef(c.isGuest);
  isGuestRef.current = c.isGuest;

  useEffect(() => {
    if (c.cartLoading || c.cartItems.length === 0) return;
    if (beginCheckoutTracked.current) return;
    beginCheckoutTracked.current = true;
    void trackEvent("begin_checkout");
  }, [c.cartLoading, c.cartItems.length]);

  useEffect(() => {
    return () => {
      if (!placingOrderRef.current) {
        const lastStep = addressCompleteRef.current ? "address_complete" : "started";
        trackCustomerEvent("customer.checkout.abandoned", {
          lastStep,
          totalCents: totalCentsRef.current ?? null,
          isGuest: isGuestRef.current,
        });
        flushCustomerEvents();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBack = useCallback(() => router.back(), [router]);

  const handlePay = useCallback(() => {
    c.setError(null);
    c.handlePay();
  }, [c.handlePay, c.setError]);

  const handleSelectPayment = useCallback(() => {
    c.setError(null);
    c.selectPaymentMethod();
  }, [c.selectPaymentMethod, c.setError]);

  const displayTotal = c.creditFullyCovered
    ? "$0.00"
    : formatMoney(c.stripeAmountCents > 0 ? c.stripeAmountCents : c.totalCents);

  const selectedShippingAddr = c.addresses.find((a) => a.publicId === c.shippingAddressId) ?? null;

  /* ── Loading ── */
  if (c.cartLoading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
        <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[3] }}>
          {t("checkout.loadingCheckout")}
        </AppText>
      </View>
    );
  }

  /* ── Empty ── */
  if (c.cartItems.length === 0) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <Icon name="shopping-cart" size={48} color={colors.gray300} />
        <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>{t("checkout.emptyCart")}</AppText>
        <AppButton title={t("checkout.continueShopping")} variant="primary" onPress={handleBack} style={{ marginTop: spacing[4] }} />
      </View>
    );
  }

  /* ── Placing ── */
  if (c.step === "placing") {
    return <PlacingOverlay insetTop={insets.top} onCancel={() => {
      c.setStep("review");
      c.setError(t("checkout.paymentCancelled"));
    }} />;
  }

  /* ── Determine auth shipping section state ── */
  const authHasAddresses = !c.isGuest && c.addresses.length > 0;
  const authHasSelectedAddr = authHasAddresses && !!selectedShippingAddr;
  const showShippingPicker = !c.isGuest && (changingShipping || !authHasSelectedAddr);
  const authNoAddresses = !c.isGuest && c.addresses.length === 0;

  return (
    <View
      style={[s.screen, { paddingTop: insets.top }]}
    >
      <KeyboardDoneBar />
      {/* Header */}
      <View style={s.header}>
        <BackButton icon="close" onPress={handleBack} />
        <AppText variant="title">{t("checkout.pageTitle")}</AppText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {c.error && (
          <View style={s.errorBanner}>
            <Icon name="error-outline" size={16} color={colors.error} />
            <AppText variant="body" color={colors.error} style={{ flex: 1 }}>{c.error}</AppText>
          </View>
        )}

        {/* ── 1. Guest email ── */}
        {c.isGuest && (
          <SectionCard title={t("checkout.contactTitle")} complete={!!c.guestEmail.trim()}>
            <Field
              label={t("checkout.emailLabel")}
              value={c.guestEmail}
              onChangeText={c.setGuestEmail}
              placeholder={t("checkout.emailPlaceholder")}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <AppText variant="bodySmall" color={colors.mutedLight}>{t("checkout.emailHint")}</AppText>
          </SectionCard>
        )}

        {/* ── 2. Shipping address ── */}
        <SectionCard
          title={t("checkout.shippingAddressTitle")}
          complete={c.isGuest
            ? !!(c.guestFirstName.trim() && c.guestLine1.trim() && c.guestCity.trim() && c.guestState.trim() && c.guestPostcode.trim())
            : !!c.shippingAddressId}
          right={
            !c.isGuest ? (
              c.showAddAddress ? (
                <Pressable onPress={() => c.setShowAddAddress(false)}>
                  <AppText variant="bodySmall" color={colors.brandBlue} weight="bold">{t("checkout.cancel")}</AppText>
                </Pressable>
              ) : authHasSelectedAddr && !changingShipping ? (
                <Pressable onPress={() => setChangingShipping(true)}>
                  <AppText variant="bodySmall" color={colors.brandBlue} weight="bold">{t("checkout.change")}</AppText>
                </Pressable>
              ) : null
            ) : undefined
          }
        >
          {c.isGuest ? (
            /* Guest: inline address fields */
            <>
              <View style={s.row}>
                <View style={s.half}><Field label={t("checkout.firstName")} value={c.guestFirstName} onChangeText={c.setGuestFirstName} autoComplete="given-name" /></View>
                <View style={s.half}><Field label={t("checkout.lastName")} value={c.guestLastName} onChangeText={c.setGuestLastName} autoComplete="family-name" /></View>
              </View>
              <Field label={t("checkout.addressLabel")} value={c.guestLine1} onChangeText={c.setGuestLine1} autoComplete="street-address" />
              <Field label={t("checkout.aptSuiteOptional")} value={c.guestLine2} onChangeText={c.setGuestLine2} />
              <View style={s.row}>
                <View style={s.half}><Field label={t("checkout.city")} value={c.guestCity} onChangeText={c.setGuestCity} /></View>
                <View style={s.half}><Field label={t("checkout.state")} value={c.guestState} onChangeText={c.setGuestState} /></View>
              </View>
              <View style={s.row}>
                <View style={s.half}><Field label={t("checkout.zip")} value={c.guestPostcode} onChangeText={c.setGuestPostcode} keyboardType="numeric" autoComplete="postal-code" /></View>
                <View style={s.half}><Field label={t("checkout.phoneOptional")} value={c.guestPhone} onChangeText={c.setGuestPhone} keyboardType="phone-pad" autoComplete="tel" /></View>
              </View>
            </>
          ) : authHasSelectedAddr && !showShippingPicker && !c.showAddAddress ? (
            /* Auth: compact selected address summary */
            <SelectedAddressSummary addr={selectedShippingAddr!} />
          ) : (
            /* Auth: address picker OR empty state */
            <>
              {authNoAddresses && !c.showAddAddress && (
                <View style={s.emptyState}>
                  <Icon name="add-location-alt" size={28} color={colors.gray400} />
                  <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[2] }}>
                    {t("checkout.noSavedAddresses")}
                  </AppText>
                  <AppButton
                    title={t("checkout.addNewAddress")}
                    variant="primary"
                    icon="add"
                    size="sm"
                    onPress={() => c.setShowAddAddress(true)}
                    style={{ marginTop: spacing[3] }}
                  />
                </View>
              )}

              {authHasAddresses && showShippingPicker && !c.showAddAddress && (
                <>
                  {c.addresses.map((addr) => (
                    <AddressRadio
                      key={addr.publicId}
                      addr={addr}
                      selected={c.shippingAddressId === addr.publicId}
                      onSelect={() => {
                        c.setShippingAddressId(addr.publicId);
                        setChangingShipping(false);
                      }}
                    />
                  ))}
                  <Pressable onPress={() => c.setShowAddAddress(true)} style={s.addAddrBtn}>
                    <Icon name="add" size={18} color={colors.brandBlue} />
                    <AppText variant="body" weight="semibold" color={colors.brandBlue}>{t("checkout.addNewAddress")}</AppText>
                  </Pressable>
                </>
              )}

              {!c.isGuest && c.showAddAddress && (
                <AddAddressForm
                  first={c.newAddrFirst} setFirst={c.setNewAddrFirst}
                  last={c.newAddrLast} setLast={c.setNewAddrLast}
                  line1={c.newAddrLine1} setLine1={c.setNewAddrLine1}
                  line2={c.newAddrLine2} setLine2={c.setNewAddrLine2}
                  city={c.newAddrCity} setCity={c.setNewAddrCity}
                  state={c.newAddrState} setState={c.setNewAddrState}
                  postcode={c.newAddrPostcode} setPostcode={c.setNewAddrPostcode}
                  phone={c.newAddrPhone} setPhone={c.setNewAddrPhone}
                  saving={c.savingAddress}
                  onSave={c.handleAddAddress}
                  onCancel={() => c.setShowAddAddress(false)}
                />
              )}
            </>
          )}
        </SectionCard>

        {/* ── 3. Billing address ── */}
        <SectionCard
          title={t("checkout.billingAddressTitle")}
          complete={c.isGuest
            ? (c.billingSameAsShipping ? !!(c.guestFirstName.trim() && c.guestLine1.trim()) : !!(c.gBillFirstName.trim() && c.gBillLine1.trim()))
            : (c.billingSameAsShipping ? !!c.shippingAddressId : !!c.billingAddressId)}
        >
          <View style={s.toggleRow}>
            <AppText variant="body" style={{ flex: 1 }}>{t("checkout.sameAsShipping")}</AppText>
            <Switch
              value={c.billingSameAsShipping}
              onValueChange={c.setBillingSameAsShipping}
              trackColor={{ true: colors.brandBlue, false: colors.gray200 }}
              thumbColor={colors.white}
            />
          </View>

          {!c.billingSameAsShipping && (
            <View style={{ marginTop: spacing[3] }}>
              {c.isGuest ? (
                <>
                  <View style={s.row}>
                    <View style={s.half}><Field label={t("checkout.firstName")} value={c.gBillFirstName} onChangeText={c.setGBillFirstName} autoComplete="given-name" /></View>
                    <View style={s.half}><Field label={t("checkout.lastName")} value={c.gBillLastName} onChangeText={c.setGBillLastName} autoComplete="family-name" /></View>
                  </View>
                  <Field label={t("checkout.addressLabel")} value={c.gBillLine1} onChangeText={c.setGBillLine1} autoComplete="street-address" />
                  <Field label={t("checkout.aptSuiteOptional")} value={c.gBillLine2} onChangeText={c.setGBillLine2} />
                  <View style={s.row}>
                    <View style={s.half}><Field label={t("checkout.city")} value={c.gBillCity} onChangeText={c.setGBillCity} /></View>
                    <View style={s.half}><Field label={t("checkout.state")} value={c.gBillState} onChangeText={c.setGBillState} /></View>
                  </View>
                  <View style={s.row}>
                    <View style={s.half}><Field label={t("checkout.zip")} value={c.gBillPostcode} onChangeText={c.setGBillPostcode} keyboardType="numeric" autoComplete="postal-code" /></View>
                    <View style={s.half}><Field label={t("checkout.phoneOptional")} value={c.gBillPhone} onChangeText={c.setGBillPhone} keyboardType="phone-pad" autoComplete="tel" /></View>
                  </View>
                </>
              ) : c.addresses.length > 0 ? (
                c.addresses.map((addr) => (
                  <AddressRadio
                    key={addr.publicId}
                    addr={addr}
                    selected={c.billingAddressId === addr.publicId}
                    onSelect={() => c.setBillingAddressId(addr.publicId)}
                  />
                ))
              ) : (
                <AppText variant="body" color={colors.muted}>{t("checkout.noSavedAddresses")}</AppText>
              )}
            </View>
          )}
        </SectionCard>

        {/* ── 4. Store credit ── */}
        {!c.isGuest && c.creditBalanceCents > 0 && (
          <SectionCard title={t("checkout.storeCredit")} complete={c.useStoreCredit}>
            <View style={s.creditRow}>
              <Icon name="account-balance-wallet" size={18} color={colors.success} />
              <View style={{ flex: 1, marginLeft: spacing[2] }}>
                <AppText variant="body" weight="medium">
                  {t("checkout.creditAvailable", { amount: formatMoney(c.creditBalanceCents) })}
                </AppText>
                {c.useStoreCredit && (
                  <AppText variant="bodySmall" color={colors.success} style={{ marginTop: spacing[0.5] }}>
                    {c.creditFullyCovered
                      ? t("checkout.creditFullyCovered")
                      : t("checkout.creditApplied", { amount: formatMoney(c.creditApplicableCents) })}
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
          </SectionCard>
        )}

        {/* ── 5. Payment method ── */}
        <SectionCard title={t("checkout.paymentMethodTitle")} complete={!c.requirePaymentMethod || c.creditFullyCovered || !!c.paymentOption}>
          {c.creditFullyCovered ? (
            <View style={s.payInfoRow}>
              <Icon name="check-circle" size={20} color={colors.success} />
              <AppText variant="body" color={colors.success} style={{ marginLeft: spacing[2], flex: 1 }}>
                {t("checkout.creditCoversOrder")}
              </AppText>
            </View>
          ) : c.paymentOption ? (
            <Pressable style={s.payInfoRow} onPress={handleSelectPayment} disabled={c.selectingPayment}>
              <View style={s.payIconCircle}>
                <Icon name="credit-card" size={16} color={colors.brandBlue} />
              </View>
              <View style={{ marginLeft: spacing[2.5], flex: 1 }}>
                <AppText variant="body" weight="semibold">{c.paymentOption.label}</AppText>
                <AppText variant="bodySmall" color={colors.success}>{t("checkout.paymentSelected")}</AppText>
              </View>
              <AppText variant="bodySmall" color={colors.brandBlue} weight="bold">{t("checkout.change")}</AppText>
            </Pressable>
          ) : (
            <Pressable style={s.paySelectBtn} onPress={handleSelectPayment} disabled={c.selectingPayment}>
              {c.selectingPayment ? (
                <ActivityIndicator size="small" color={colors.brandBlue} />
              ) : (
                <>
                  <View style={s.payIconCircle}>
                    <Icon name="add" size={16} color={colors.brandBlue} />
                  </View>
                  <View style={{ marginLeft: spacing[2.5], flex: 1 }}>
                    <AppText variant="body" weight="semibold" color={colors.brandBlue}>{t("checkout.selectPaymentMethod")}</AppText>
                    <AppText variant="bodySmall" color={colors.muted}>{t("checkout.securePaymentSheetHint")}</AppText>
                  </View>
                  <Icon name="chevron-right" size={18} color={colors.brandBlue} />
                </>
              )}
            </Pressable>
          )}
        </SectionCard>

        {/* ── 6. Order summary ── */}
        <SectionCard title={t("checkout.yourOrder")}>
          {c.cartItems.map((item) => (
            <View key={item.publicId} style={s.itemRow}>
              {item.image ? (
                <Image
                  source={{ uri: productImageUrl(item.image, "thumb") }}
                  style={s.itemImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={[s.itemImg, s.itemImgPlaceholder]}>
                  <Icon name="image" size={18} color={colors.gray300} />
                </View>
              )}
              <View style={s.itemInfo}>
                <AppText variant="body" numberOfLines={2} weight="medium">{item.title}</AppText>
                {item.vendorName ? (
                  <AppText variant="bodySmall" color={colors.muted}>{item.vendorName}</AppText>
                ) : null}
                {item.variantLabel ? (
                  <AppText variant="bodySmall" color={colors.muted}>{item.variantLabel}</AppText>
                ) : null}
                <AppText variant="bodySmall" color={colors.slate500}>
                  {t("checkout.qtyLabel", { count: item.quantity })} × {formatMoney(item.unitPriceCents)}
                </AppText>
              </View>
              <AppText variant="body" weight="bold">{formatMoney(item.unitPriceCents * item.quantity)}</AppText>
            </View>
          ))}

          <View style={s.totals}>
            <TotalRow label={t("checkout.subtotal")} value={formatMoney(c.serverCart?.subtotalCents ?? c.subtotalCents)} />
            {c.serverCart && (
              <>
                <TotalRow
                  label={t("checkout.shipping")}
                  value={c.serverCart.shippingCents === 0 ? t("checkout.shippingFree") : formatMoney(c.serverCart.shippingCents)}
                />
                <TotalRow label={t("checkout.tax")} value={formatMoney(c.serverCart.taxCents)} />
              </>
            )}
            {c.creditApplicableCents > 0 && (
              <TotalRow
                label={t("checkout.storeCreditLabel")}
                value={`−${formatMoney(c.creditApplicableCents)}`}
                color={colors.success}
              />
            )}
            <View style={s.totalDivider} />
            <TotalRow
              label={c.creditFullyCovered ? t("checkout.amountDue") : t("checkout.total")}
              value={displayTotal}
              bold
              color={c.creditFullyCovered ? colors.success : undefined}
            />
          </View>
        </SectionCard>
      </ScrollView>

      {/* ── Fixed bottom pay bar ── */}
      <View style={[s.bottomBar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
        <View style={s.bottomRow}>
          <AppText variant="body" weight="semibold" color={colors.slate600}>
            {c.creditFullyCovered ? t("checkout.amountDue") : t("checkout.total")}
          </AppText>
          <AppText variant="title" color={c.creditFullyCovered ? colors.success : colors.foreground}>
            {displayTotal}
          </AppText>
        </View>

        {c.error && (
          <AppText variant="bodySmall" color={colors.error} style={{ marginBottom: spacing[2] }}>{c.error}</AppText>
        )}

        <AppButton
          title={c.placingOrder
            ? t("checkout.placingOrder")
            : c.creditFullyCovered
              ? t("checkout.placeOrder")
              : t("checkout.payAmount", { amount: displayTotal })}
          variant="primary"
          fullWidth
          size="lg"
          loading={c.placingOrder}
          disabled={!c.canPlaceOrder || (c.requirePaymentMethod && !c.creditFullyCovered && !c.paymentOption)}
          onPress={handlePay}
        />
      </View>
    </View>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing[4], paddingVertical: spacing[2.5],
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.white,
  },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    backgroundColor: colors.errorLight, borderRadius: borderRadius.lg,
    padding: spacing[3], marginBottom: spacing[3],
  },
  content: { paddingHorizontal: spacing[4], paddingTop: spacing[3], paddingBottom: 160 },
  row: { flexDirection: "row", gap: spacing[2] },
  half: { flex: 1 },
  toggleRow: { flexDirection: "row", alignItems: "center" },
  creditRow: { flexDirection: "row", alignItems: "center" },
  emptyState: {
    alignItems: "center",
    paddingVertical: spacing[4],
  },
  addAddrBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing[1.5],
    paddingVertical: spacing[2.5],
    borderWidth: 1.5, borderColor: colors.brandBlue,
    borderRadius: borderRadius.lg, borderStyle: "dashed",
  },
  payInfoRow: {
    flexDirection: "row", alignItems: "center",
  },
  payIconCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center", justifyContent: "center",
  },
  paySelectBtn: {
    flexDirection: "row" as const, alignItems: "center" as const,
    borderWidth: 1.5, borderColor: colors.brandBlue,
    borderRadius: borderRadius.lg, borderStyle: "dashed" as const,
    padding: spacing[3],
  },
  itemRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing[2.5], marginBottom: spacing[1.5],
    borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  itemImg: {
    width: 52, height: 52, borderRadius: borderRadius.md,
    marginRight: spacing[3], backgroundColor: colors.gray100,
  },
  itemImgPlaceholder: {
    alignItems: "center", justifyContent: "center",
  },
  itemInfo: { flex: 1, marginRight: spacing[2], gap: spacing[0.5] },
  totals: { marginTop: spacing[2], paddingTop: spacing[1] },
  totalDivider: {
    borderTopWidth: 1, borderTopColor: colors.border,
    marginTop: spacing[2], marginBottom: spacing[1],
  },
  bottomBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing[4], paddingTop: spacing[3],
    borderTopWidth: 1, borderTopColor: colors.border,
    ...shadows.lg,
  },
  bottomRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: spacing[3],
  },
});
