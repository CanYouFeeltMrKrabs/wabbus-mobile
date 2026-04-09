import React from "react";
import { View, StyleSheet } from "react-native";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import { formatMoney } from "@/lib/money";
import { colors, spacing } from "@/lib/theme";

interface CartSummaryProps {
  subtotalCents: number;
  onCheckout: () => void;
}

export default function CartSummary({ subtotalCents, onCheckout }: CartSummaryProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <AppText variant="body" color={colors.muted}>{t("cart.subtotal")}</AppText>
        <AppText variant="body" weight="semibold">
          {formatMoney(subtotalCents)}
        </AppText>
      </View>
      <View style={styles.row}>
        <AppText variant="body" color={colors.muted}>{t("cart.shippingAndTax")}</AppText>
        <AppText variant="caption" color={colors.success} weight="medium">
          {t("cart.calculatedAtCheckout")}
        </AppText>
      </View>
      
      <View style={styles.divider} />
      
      <View style={styles.totalRow}>
        <AppText style={styles.totalLabel}>{t("cart.estimatedTotal")}</AppText>
        <AppText style={styles.totalPrice}>{formatMoney(subtotalCents)}</AppText>
      </View>

      <AppButton
        title={t("cart.proceedToCheckout")}
        variant="primary"
        iconRight="arrow-forward"
        fullWidth
        size="lg"
        onPress={onCheckout}
        style={styles.checkoutBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  divider: {
    height: 1,
    backgroundColor: colors.slate100,
    marginVertical: 16,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 20,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.foreground,
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.foreground,
  },
  checkoutBtn: {
    borderRadius: 16, // Matches tailwind rounded-2xl
    paddingVertical: 16,
    shadowColor: colors.brandBlue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 8,
  },
});
