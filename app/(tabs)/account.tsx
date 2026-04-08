import React from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

type MenuItem = {
  icon: string;
  label: string;
  route: string;
  color?: string;
};

const MENU_ITEMS: MenuItem[] = [
  { icon: "receipt-long", label: "Orders", route: ROUTES.orders },
  { icon: "location-on", label: "Addresses", route: ROUTES.accountAddresses },
  { icon: "credit-card", label: "Payment Methods", route: ROUTES.accountPaymentMethods },
  { icon: "person", label: "Account Details", route: ROUTES.accountDetails },
  { icon: "favorite", label: "Wishlist", route: ROUTES.accountWishlist },
  { icon: "chat", label: "Messages", route: ROUTES.accountMessages },
  { icon: "help-outline", label: "Support", route: ROUTES.support },
];

function MenuRow({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]} onPress={onPress}>
      <View style={styles.menuIcon}>
        <Icon name={item.icon} size={22} color={colors.brandBlue} />
      </View>
      <AppText variant="body" weight="medium" style={styles.menuLabel}>
        {item.label}
      </AppText>
      <Icon name="chevron-right" size={20} color={colors.gray400} />
    </Pressable>
  );
}

export default function AccountScreen() {
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
        <View style={styles.avatar}>
          <Icon name="person" size={32} color={colors.white} />
        </View>
        {isLoggedIn ? (
          <View>
            <AppText variant="title">
              {user?.firstName} {user?.lastName}
            </AppText>
            <AppText variant="caption">{user?.email}</AppText>
          </View>
        ) : (
          <View>
            <AppText variant="title">Welcome to Wabbus</AppText>
            <AppText variant="caption">Sign in for the best experience</AppText>
          </View>
        )}
      </View>

      {!isLoggedIn && (
        <View style={styles.authRow}>
          <AppButton
            title="Sign In"
            variant="primary"
            fullWidth
            onPress={() => router.push(ROUTES.login)}
          />
          <AppButton
            title="Create Account"
            variant="outline"
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
            onPress={() => router.push(item.route as any)}
          />
        ))}
      </View>

      {isLoggedIn && (
        <AppButton
          title="Sign Out"
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
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[4],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginTop: spacing[4],
    ...shadows.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.brandBlue,
    alignItems: "center",
    justifyContent: "center",
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
