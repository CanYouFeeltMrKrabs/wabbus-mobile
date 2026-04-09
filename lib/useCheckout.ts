import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQueryClient } from "@tanstack/react-query";
import { initPaymentSheet, presentPaymentSheet } from "@stripe/stripe-react-native";
import { customerFetch, publicFetch, AuthError } from "./api";
import { API_BASE } from "./config";
import { useAuth } from "./auth";
import { useCart } from "./cart";
import { mergeGuestCart } from "./mergeGuestCart";
import { trackCustomerEvent } from "./customerTracker";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import type {
  CheckoutAddress,
  ServerCartResponse,
  CheckoutResponse,
  GuestCheckoutData,
  CartItem,
} from "./types";

const IDEMPOTENCY_KEY = "wabbus_checkout_idempotency";
const PENDING_ORDER_KEY = "wabbus_checkout_pending";

const TIMEOUT_CHECKOUT_MS = 30_000;
const TIMEOUT_CONFIRM_MS = 120_000;

function raceTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out — please try again.`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

type PendingOrder = {
  orderId: string | number;
  hasPaymentIntent: boolean;
  stripeAmountCents?: number;
  usedStoreCredit?: boolean;
  shippingAddressId?: string;
  billingAddressId?: string | null;
  cartFingerprint?: string;
};

function makeIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildCartFingerprint(items: CartItem[], totalCents: number): string {
  if (!items.length) return "";
  const sorted = [...items]
    .sort((a, b) => a.variantPublicId.localeCompare(b.variantPublicId))
    .map((i) => `${i.variantPublicId}:${i.quantity}`)
    .join(",");
  return `${sorted}|${totalCents}`;
}

function normalizeAddresses(payload: unknown): CheckoutAddress[] {
  if (Array.isArray(payload)) return payload as CheckoutAddress[];
  if (payload && typeof payload === "object" && "addresses" in payload) {
    const obj = payload as { addresses: unknown };
    if (Array.isArray(obj.addresses)) return obj.addresses as CheckoutAddress[];
  }
  return [];
}

export type CheckoutStep = "address" | "payment" | "review" | "placing";

const IDEMPOTENCY_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export function useCheckout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, authStatus, isLoggedIn, refresh: refreshAuth } = useAuth();
  const { items: cartItems, subtotalCents, clearCart, refreshCart } = useCart();
  const isGuest = authStatus === "unauthenticated";
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Step management ──
  const [step, setStep] = useState<CheckoutStep>("address");
  const [error, setError] = useState<string | null>(null);

  // ── Server cart (with totals) ──
  const [serverCart, setServerCart] = useState<ServerCartResponse | null>(null);
  const [cartLoading, setCartLoading] = useState(true);

  // ── Addresses ──
  const [addresses, setAddresses] = useState<CheckoutAddress[]>([]);
  const [shippingAddressId, setShippingAddressId] = useState<string | null>(null);
  const [billingAddressId, setBillingAddressId] = useState<string | null>(null);
  const [billingSameAsShipping, setBillingSameAsShipping] = useState(true);

  // ── Guest fields ──
  const [guestEmail, setGuestEmail] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestLine1, setGuestLine1] = useState("");
  const [guestLine2, setGuestLine2] = useState("");
  const [guestCity, setGuestCity] = useState("");
  const [guestState, setGuestState] = useState("");
  const [guestPostcode, setGuestPostcode] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // ── Guest billing address (separate from shipping) ──
  const [gBillFirstName, setGBillFirstName] = useState("");
  const [gBillLastName, setGBillLastName] = useState("");
  const [gBillLine1, setGBillLine1] = useState("");
  const [gBillLine2, setGBillLine2] = useState("");
  const [gBillCity, setGBillCity] = useState("");
  const [gBillState, setGBillState] = useState("");
  const [gBillPostcode, setGBillPostcode] = useState("");
  const [gBillPhone, setGBillPhone] = useState("");

  // ── Store credit ──
  const [creditBalanceCents, setCreditBalanceCents] = useState(0);
  const [useStoreCredit, setUseStoreCredit] = useState(false);

  // ── Saved payment methods ──
  const [savedMethods, setSavedMethods] = useState<Array<{
    stripePaymentMethodId: string;
    brand?: string | null;
    last4?: string | null;
    expMonth?: number | null;
    expYear?: number | null;
    isDefault?: boolean | null;
  }>>([]);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);

  // ── Payment state ──
  const [placingOrder, setPlacingOrder] = useState(false);
  const payingRef = useRef(false);
  const idempotencyKeyRef = useRef<string>("");
  const pendingOrderRef = useRef<PendingOrder | null>(null);

  // ── Add address form ──
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddrFirst, setNewAddrFirst] = useState("");
  const [newAddrLast, setNewAddrLast] = useState("");
  const [newAddrLine1, setNewAddrLine1] = useState("");
  const [newAddrLine2, setNewAddrLine2] = useState("");
  const [newAddrCity, setNewAddrCity] = useState("");
  const [newAddrState, setNewAddrState] = useState("");
  const [newAddrPostcode, setNewAddrPostcode] = useState("");
  const [newAddrPhone, setNewAddrPhone] = useState("");

  // ── Derived values ──
  const totalCents = serverCart?.totalCents ?? subtotalCents;
  const creditApplicableCents = useStoreCredit
    ? Math.min(creditBalanceCents, totalCents)
    : 0;
  const stripeAmountCents = totalCents - creditApplicableCents;
  const creditFullyCovered = useStoreCredit && stripeAmountCents <= 0 && totalCents > 0;
  const requirePaymentMethod = !creditFullyCovered;

  const cartFingerprint = useMemo(
    () => buildCartFingerprint(cartItems, totalCents),
    [cartItems, totalCents],
  );

  const guestShippingComplete = !!(
    guestFirstName.trim() && guestLastName.trim() && guestLine1.trim() &&
    guestCity.trim() && guestState.trim() && guestPostcode.trim()
  );

  const guestBillingComplete = billingSameAsShipping || !!(
    gBillFirstName.trim() && gBillLastName.trim() && gBillLine1.trim() &&
    gBillCity.trim() && gBillState.trim() && gBillPostcode.trim()
  );

  const addressComplete = isGuest
    ? guestShippingComplete && guestBillingComplete
    : !!shippingAddressId && (billingSameAsShipping || !!billingAddressId);

  const canProceedToPayment = addressComplete && (!isGuest || !!guestEmail.trim());
  const canPlaceOrder = cartItems.length > 0 && addressComplete && !placingOrder
    && (!isGuest || (!!guestEmail.trim()));

  // ── Load idempotency key from storage (with TTL guard) ──
  useEffect(() => {
    (async () => {
      let key = await AsyncStorage.getItem(IDEMPOTENCY_KEY).catch(() => null);
      const pendingRaw = await AsyncStorage.getItem(PENDING_ORDER_KEY).catch(() => null);
      let pending: PendingOrder | null = null;
      if (pendingRaw) {
        try { pending = JSON.parse(pendingRaw); } catch { /* ignore */ }
      }

      // Expire stale keys: the timestamp is embedded in the key (prefix before '-')
      const keyAge = key ? Date.now() - parseInt(key.split("-")[0], 10) : Infinity;
      if (!key || (keyAge > IDEMPOTENCY_MAX_AGE_MS && !pending)) {
        key = makeIdempotencyKey();
        await AsyncStorage.setItem(IDEMPOTENCY_KEY, key).catch(() => {});
        await AsyncStorage.removeItem(PENDING_ORDER_KEY).catch(() => {});
        pending = null;
      }

      idempotencyKeyRef.current = key;
      pendingOrderRef.current = pending;
    })();
  }, []);

  // ── Load server cart + addresses + credit (on mount) ──
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCartLoading(true);

      if (isLoggedIn) {
        try { await mergeGuestCart(); } catch { /* best effort */ }

        const [cartData, addrData, creditData, methodsData] = await Promise.all([
          customerFetch<ServerCartResponse>("/cart").catch(() => null),
          customerFetch<unknown>("/customer-addresses").catch(() => null),
          customerFetch<{ balanceCents?: number }>("/payments/credit-balance").catch(() => null),
          customerFetch<any>("/payments/methods").catch(() => null),
        ]);

        if (cancelled) return;

        if (cartData) setServerCart(cartData);

        const addrList = normalizeAddresses(addrData);
        setAddresses(addrList);
        if (addrList.length > 0 && !shippingAddressId) {
          const defaultAddr = addrList.find((a) => a.isDefault) ?? addrList[0];
          setShippingAddressId(defaultAddr.publicId);
          setBillingAddressId(defaultAddr.publicId);
        }

        if (creditData?.balanceCents) setCreditBalanceCents(creditData.balanceCents);

        const methods = Array.isArray(methodsData) ? methodsData : methodsData?.paymentMethods ?? [];
        setSavedMethods(methods);
        const defaultMethod = methods.find((m: any) => m.isDefault) ?? methods[0];
        if (defaultMethod?.stripePaymentMethodId) {
          setSelectedPaymentMethodId(defaultMethod.stripePaymentMethodId);
        }
      }

      if (cancelled) return;
      setCartLoading(false);
    })();

    return () => { cancelled = true; };
  }, [isLoggedIn]);

  // ── Sync billing with shipping ──
  useEffect(() => {
    if (billingSameAsShipping) setBillingAddressId(shippingAddressId);
  }, [billingSameAsShipping, shippingAddressId]);

  // ── Add new address ──
  const handleAddAddress = useCallback(async () => {
    if (!newAddrFirst.trim() || !newAddrLine1.trim() || !newAddrCity.trim() ||
        !newAddrState.trim() || !newAddrPostcode.trim()) return;

    setSavingAddress(true);
    setError(null);

    try {
      const created = await customerFetch<any>("/customer-addresses", {
        method: "POST",
        body: JSON.stringify({
          firstName: newAddrFirst.trim(),
          lastName: newAddrLast.trim(),
          line1: newAddrLine1.trim(),
          line2: newAddrLine2.trim() || undefined,
          city: newAddrCity.trim(),
          state: newAddrState.trim(),
          postalCode: newAddrPostcode.trim(),
          country: "US",
          phone: newAddrPhone.trim() || undefined,
        }),
      });

      const addr: CheckoutAddress | null = created?.address || created || null;
      if (addr?.publicId) {
        setAddresses((prev) => [addr, ...prev]);
        setShippingAddressId(addr.publicId);
        if (billingSameAsShipping) setBillingAddressId(addr.publicId);
      }

      setShowAddAddress(false);
      setNewAddrFirst(""); setNewAddrLast(""); setNewAddrLine1(""); setNewAddrLine2("");
      setNewAddrCity(""); setNewAddrState(""); setNewAddrPostcode(""); setNewAddrPhone("");
    } catch {
      setError("Failed to save address.");
    } finally {
      setSavingAddress(false);
    }
  }, [newAddrFirst, newAddrLast, newAddrLine1, newAddrLine2, newAddrCity, newAddrState, newAddrPostcode, newAddrPhone, billingSameAsShipping]);

  // ── Build guest data ──
  const guestData: GuestCheckoutData | null = useMemo(() => {
    if (!isGuest || !guestEmail.trim() || !guestShippingComplete) return null;
    return {
      email: guestEmail.trim(),
      shippingAddress: {
        firstName: guestFirstName.trim(),
        lastName: guestLastName.trim(),
        line1: guestLine1.trim(),
        line2: guestLine2.trim() || undefined,
        city: guestCity.trim(),
        state: guestState.trim(),
        postalCode: guestPostcode.trim(),
        country: "US",
        phone: guestPhone.trim() || undefined,
      },
      billingAddress: billingSameAsShipping ? undefined : {
        firstName: gBillFirstName.trim(),
        lastName: gBillLastName.trim(),
        line1: gBillLine1.trim(),
        line2: gBillLine2.trim() || undefined,
        city: gBillCity.trim(),
        state: gBillState.trim(),
        postalCode: gBillPostcode.trim(),
        country: "US",
        phone: gBillPhone.trim() || undefined,
      },
      items: cartItems.map((it) => ({
        variantPublicId: it.variantPublicId,
        quantity: it.quantity,
      })),
    };
  }, [isGuest, guestEmail, guestShippingComplete, guestFirstName, guestLastName,
      guestLine1, guestLine2, guestCity, guestState, guestPostcode, guestPhone,
      billingSameAsShipping,
      gBillFirstName, gBillLastName, gBillLine1, gBillLine2,
      gBillCity, gBillState, gBillPostcode, gBillPhone,
      cartItems]);

  // ── Place order ──
  const handlePay = useCallback(async () => {
    if (payingRef.current) return;
    if (isGuest ? !guestData : !shippingAddressId) return;

    payingRef.current = true;
    setPlacingOrder(true);
    setStep("placing");
    setError(null);

    trackCustomerEvent("customer.checkout.step.completed", {
      step: "payment_submitted",
      isGuest,
    });

    try {
      const billingPublicId = billingSameAsShipping ? shippingAddressId : billingAddressId;

      // Invalidate stale pending orders
      if (pendingOrderRef.current) {
        const po = pendingOrderRef.current;
        const stale =
          (po.usedStoreCredit !== undefined && po.usedStoreCredit !== useStoreCredit) ||
          (po.shippingAddressId !== undefined && po.shippingAddressId !== shippingAddressId) ||
          (po.cartFingerprint !== undefined && po.cartFingerprint !== cartFingerprint);

        if (stale) {
          pendingOrderRef.current = null;
          const freshKey = makeIdempotencyKey();
          idempotencyKeyRef.current = freshKey;
          await AsyncStorage.setItem(IDEMPOTENCY_KEY, freshKey).catch(() => {});
          await AsyncStorage.removeItem(PENDING_ORDER_KEY).catch(() => {});
        }
      }

      let orderIdentifier: string | number | undefined;
      let clientSecret: string | null = null;

      if (pendingOrderRef.current) {
        orderIdentifier = pendingOrderRef.current.orderId;
      } else {
        let data: CheckoutResponse;

        if (isGuest && guestData) {
          const guestPromise = (async () => {
            const res = await fetch(`${API_BASE}/checkout/guest`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": idempotencyKeyRef.current,
              },
              credentials: "include",
              body: JSON.stringify({
                email: guestData.email,
                shippingAddress: guestData.shippingAddress,
                billingAddress: guestData.billingAddress,
                items: guestData.items,
                useStoreCredit: useStoreCredit || undefined,
              }),
            });

            if (!res.ok) {
              const body = await res.json().catch(() => null);
              const msg = body?.message ||
                (res.status === 409
                  ? "Account already exists for that email. Please sign in instead."
                  : "Checkout failed. Please try again.");
              throw new Error(msg);
            }

            return res.json() as Promise<CheckoutResponse>;
          })();

          data = await raceTimeout(guestPromise, TIMEOUT_CHECKOUT_MS, "Checkout");

          // Backend may establish a session for the guest — pick it up
          await refreshAuth().catch(() => {});
        } else {
          data = await raceTimeout(
            customerFetch<CheckoutResponse>("/checkout", {
              method: "POST",
              headers: { "Idempotency-Key": idempotencyKeyRef.current },
              body: JSON.stringify({
                shippingAddressPublicId: shippingAddressId,
                billingAddressPublicId: billingPublicId || undefined,
                useStoreCredit: useStoreCredit || undefined,
              }),
            }),
            TIMEOUT_CHECKOUT_MS,
            "Checkout",
          );
        }

        orderIdentifier = data?.orderPublicId ?? data?.orderId;
        clientSecret =
          data?.payment?.clientSecret ??
          data?.clientSecret ??
          data?.paymentClientSecret ??
          data?.paymentIntentClientSecret ??
          data?.stripeClientSecret ??
          null;

        if (orderIdentifier) {
          pendingOrderRef.current = {
            orderId: orderIdentifier,
            hasPaymentIntent: !!clientSecret,
            stripeAmountCents: data?.stripeAmountCents ?? undefined,
            usedStoreCredit: useStoreCredit,
            shippingAddressId: shippingAddressId ?? undefined,
            billingAddressId: billingPublicId,
            cartFingerprint,
          };
          await AsyncStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(pendingOrderRef.current)).catch(() => {});
        }

        // Store credit fully covered — skip Stripe
        if (data?.payment?.status === "PAID") {
          await cleanupAfterOrder();
          router.replace(ROUTES.orderComplete(orderIdentifier ?? ""));
          return;
        }
      }

      // Need Stripe payment
      if (requirePaymentMethod && orderIdentifier) {
        if (!clientSecret) {
          const intentData = await raceTimeout(
            customerFetch<{ clientSecret?: string }>("/payments/create-intent", {
              method: "POST",
              body: JSON.stringify({ orderPublicId: orderIdentifier }),
            }),
            TIMEOUT_CHECKOUT_MS,
            "Payment setup",
          );
          clientSecret = intentData?.clientSecret ?? null;
        }

        if (!clientSecret) {
          throw new Error("We couldn't set up payment for this order. Please try again.");
        }

        const { error: initError } = await initPaymentSheet({
          paymentIntentClientSecret: clientSecret,
          merchantDisplayName: "Wabbus",
          allowsDelayedPaymentMethods: false,
          returnURL: "wabbus://order-complete",
        });

        if (initError) {
          throw new Error(initError.message || "Could not initialize payment.");
        }

        const { error: presentError } = await presentPaymentSheet();

        if (presentError) {
          if (presentError.code === "Canceled") {
            setStep("review");
            return;
          }
          throw new Error(presentError.message || "Payment failed. Please try again.");
        }

        try {
          await raceTimeout(
            customerFetch("/payments/confirm-order", {
              method: "POST",
              body: JSON.stringify({ orderPublicId: orderIdentifier }),
            }),
            TIMEOUT_CONFIRM_MS,
            "Order confirmation",
          );
        } catch { /* webhook will handle it */ }
      }

      await cleanupAfterOrder();
      router.replace(ROUTES.orderComplete(orderIdentifier ?? ""));
    } catch (e) {
      if (!isGuest && e instanceof AuthError) {
        router.replace(ROUTES.login);
        return;
      }
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Something went wrong placing your order.");
        setStep("review");
      }
    } finally {
      payingRef.current = false;
      if (mountedRef.current) setPlacingOrder(false);
    }
  }, [
    shippingAddressId, billingAddressId, billingSameAsShipping,
    requirePaymentMethod, useStoreCredit, cartFingerprint,
    isGuest, guestData, router, clearCart, refreshAuth,
  ]);

  async function cleanupAfterOrder() {
    pendingOrderRef.current = null;
    const freshKey = makeIdempotencyKey();
    idempotencyKeyRef.current = freshKey;
    await AsyncStorage.setItem(IDEMPOTENCY_KEY, freshKey).catch(() => {});
    await AsyncStorage.removeItem(PENDING_ORDER_KEY).catch(() => {});
    await clearCart();
    queryClient.invalidateQueries({ queryKey: queryKeys.cart() });
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.addresses.all() });
    queryClient.invalidateQueries({ queryKey: queryKeys.storeCredit() });
  }

  return {
    // Step
    step, setStep,
    error, setError,

    // Cart
    cartItems, cartLoading,
    serverCart, subtotalCents, totalCents,
    stripeAmountCents,

    // Auth
    isGuest, isLoggedIn, user,

    // Addresses (auth)
    addresses, shippingAddressId, setShippingAddressId,
    billingAddressId, setBillingAddressId,
    billingSameAsShipping, setBillingSameAsShipping,

    // Add address form
    showAddAddress, setShowAddAddress, savingAddress,
    handleAddAddress,
    newAddrFirst, setNewAddrFirst,
    newAddrLast, setNewAddrLast,
    newAddrLine1, setNewAddrLine1,
    newAddrLine2, setNewAddrLine2,
    newAddrCity, setNewAddrCity,
    newAddrState, setNewAddrState,
    newAddrPostcode, setNewAddrPostcode,
    newAddrPhone, setNewAddrPhone,

    // Guest fields
    guestEmail, setGuestEmail,
    guestFirstName, setGuestFirstName,
    guestLastName, setGuestLastName,
    guestLine1, setGuestLine1,
    guestLine2, setGuestLine2,
    guestCity, setGuestCity,
    guestState, setGuestState,
    guestPostcode, setGuestPostcode,
    guestPhone, setGuestPhone,

    // Guest billing address
    gBillFirstName, setGBillFirstName,
    gBillLastName, setGBillLastName,
    gBillLine1, setGBillLine1,
    gBillLine2, setGBillLine2,
    gBillCity, setGBillCity,
    gBillState, setGBillState,
    gBillPostcode, setGBillPostcode,
    gBillPhone, setGBillPhone,

    // Store credit
    creditBalanceCents, useStoreCredit, setUseStoreCredit,
    creditApplicableCents, creditFullyCovered,

    // Payment
    requirePaymentMethod,
    placingOrder, handlePay,
    canProceedToPayment, canPlaceOrder,
    addressComplete,

    // Saved payment methods
    savedMethods, selectedPaymentMethodId, setSelectedPaymentMethodId,
  };
}
