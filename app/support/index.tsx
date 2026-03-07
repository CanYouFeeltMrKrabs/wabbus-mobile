import React from "react";
import { View, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

const SUPPORT_OPTIONS = [
  { icon: "chat", title: "Live Chat", desc: "Chat with our support team", action: "chat" },
  { icon: "email", title: "Submit a Ticket", desc: "We'll get back to you within 24h", action: "ticket" },
  { icon: "help-outline", title: "FAQ", desc: "Browse common questions", action: "faq" },
  { icon: "local-shipping", title: "Track Order", desc: "Check your delivery status", action: "track" },
  { icon: "assignment-return", title: "Returns & Refunds", desc: "Start a return or check status", action: "returns" },
];

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Support</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Icon name="support-agent" size={40} color={colors.brandBlue} />
          <AppText variant="title" style={styles.heroTitle}>How can we help?</AppText>
          <AppText variant="body" color={colors.muted} align="center">
            We&apos;re here to help with your orders, returns, and any questions.
          </AppText>
        </View>

        {SUPPORT_OPTIONS.map((opt) => (
          <Pressable key={opt.action} style={({ pressed }) => [styles.optionCard, pressed && { opacity: 0.9 }]}>
            <View style={styles.optionIcon}>
              <Icon name={opt.icon} size={24} color={colors.brandBlue} />
            </View>
            <View style={styles.optionText}>
              <AppText variant="label">{opt.title}</AppText>
              <AppText variant="caption">{opt.desc}</AppText>
            </View>
            <Icon name="chevron-right" size={20} color={colors.gray400} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  heroCard: {
    backgroundColor: colors.card, borderRadius: borderRadius.xl, padding: spacing[6],
    alignItems: "center", marginBottom: spacing[4], ...shadows.sm,
  },
  heroTitle: { marginTop: spacing[2], marginBottom: spacing[1] },
  optionCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: colors.card,
    borderRadius: borderRadius.xl, padding: spacing[4], marginBottom: spacing[2], ...shadows.sm,
  },
  optionIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandBlueLight, alignItems: "center", justifyContent: "center", marginRight: spacing[3] },
  optionText: { flex: 1 },
});
