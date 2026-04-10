import React from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type MenuItem = {
  icon: string;
  labelKey: string;
  route: string;
};

const MENU_ITEMS: MenuItem[] = [
  { icon: "receipt-long", labelKey: "account.menu.orders", route: ROUTES.orders },
  { icon: "location-on", labelKey: "account.menu.addresses", route: ROUTES.accountAddresses },
  { icon: "credit-card", labelKey: "account.menu.paymentMethods", route: ROUTES.accountPaymentMethods },
  { icon: "person", labelKey: "account.menu.accountDetails", route: ROUTES.accountDetails },
  { icon: "favorite", labelKey: "account.menu.wishlist", route: ROUTES.accountWishlist },
  { icon: "chat", labelKey: "account.menu.messages", route: ROUTES.accountMessages },
  { icon: "help-outline", labelKey: "account.menu.support", route: ROUTES.support },
];

const LEGAL_ITEMS: MenuItem[] = [
  { icon: "description", labelKey: "account.legal.termsOfService", route: ROUTES.terms },
  { icon: "privacy-tip", labelKey: "account.legal.privacyPolicy", route: ROUTES.privacy },
  { icon: "mail-outline", labelKey: "account.legal.contactUs", route: ROUTES.contact },
];

function MenuRow({ item, t, onPress }: { item: MenuItem; t: (key: string) => string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]} onPress={onPress}>
      <View style={styles.menuIcon}>
        <Icon name={item.icon} size={22} color={colors.brandBlue} />
      </View>
      <AppText variant="body" weight="medium" style={styles.menuLabel}>
        {t(item.labelKey)}
      </AppText>
      <Icon name="chevron-right" size={20} color={colors.gray400} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoggedIn, logout } = useAuth();

  return (
    <ScrollView
      style={[styles.screen, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <View style={styles.profileCard}>
        {isLoggedIn ? (
          <View style={styles.profileTextBlock}>
            <AppText variant="heading" style={styles.profileHeadline}>
              {user?.name || t("account.hub.yourAccount")}
            </AppText>
            <AppText variant="bodySmall" color={colors.muted} style={styles.profileSubline}>
              {user?.email}
            </AppText>
          </View>
        ) : (
          <View style={styles.profileTextBlock}>
            <AppText variant="heading" style={styles.profileHeadline}>
              {t("account.hub.welcomeToWabbus")}
            </AppText>
            <AppText variant="bodySmall" color={colors.muted} style={styles.profileSubline}>
              {t("account.hub.signInForBest")}
            </AppText>
          </View>
        )}
      </View>

      {!isLoggedIn && (
        <View style={styles.authRow}>
          <AppButton
            title={t("account.hub.signIn")}
            variant="primary"
            fullWidth
            onPress={() => router.push(ROUTES.login)}
          />
          <AppButton
            title={t("account.hub.createAccount")}
            variant="accent"
            fullWidth
            onPress={() => router.push(ROUTES.register)}
          />
        </View>
      )}

      {/* Menu items */}
      <View style={styles.menuCard}>
        {MENU_ITEMS.map((item) => (
          <MenuRow
            key={item.route}
            item={item}
            t={t}
            onPress={() => router.push(item.route as any)}
          />
        ))}
      </View>

      {/* Legal */}
      <View style={styles.menuCard}>
        {LEGAL_ITEMS.map((item) => (
          <MenuRow
            key={item.route}
            item={item}
            t={t}
            onPress={() => router.push(item.route as any)}
          />
        ))}
      </View>

      {isLoggedIn && (
        <AppButton
          title={t("account.hub.signOut")}
          variant="ghost"
          icon="logout"
          onPress={logout}
          style={styles.logoutBtn}
        />
      )}

      <View style={{ height: spacing[10] }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing[4] },

  profileCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    paddingVertical: spacing[5],
    paddingHorizontal: spacing[4],
    marginTop: spacing[4],
    ...shadows.sm,
  },
  profileTextBlock: {
    width: "100%",
  },
  profileHeadline: {
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
  },
  profileSubline: {
    marginTop: spacing[1.5],
    fontSize: 15,
    lineHeight: 22,
  },

  authRow: { marginTop: spacing[3], gap: spacing[2] },

  menuCard: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    marginTop: spacing[4],
    overflow: "hidden",
    ...shadows.sm,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing[3.5],
    paddingHorizontal: spacing[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuRowPressed: { backgroundColor: colors.gray50 },
  menuIcon: { width: 36, alignItems: "center" },
  menuLabel: { flex: 1 },

  logoutBtn: { marginTop: spacing[4] },
});
