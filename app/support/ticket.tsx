import React, { useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { getQueryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";

const CATEGORIES = [
  { code: "TECHNICAL", labelKey: "support.ticket.catTechnical", icon: "build" },
  { code: "BILLING", labelKey: "support.ticket.catBilling", icon: "credit-card" },
  { code: "ACCOUNT", labelKey: "support.ticket.catAccount", icon: "account-circle" },
  { code: "OTHER", labelKey: "support.ticket.catOther", icon: "help-circle" },
];

export default function SubmitTicketScreen() {
  return (
    <RequireAuth>
      <TicketContent />
    </RequireAuth>
  );
}

function TicketContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!category || !body.trim()) {
      setError(t("support.ticket.validationError"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await customerFetch("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), category }),
      });
      const qc = getQueryClient();
      qc.invalidateQueries({ queryKey: queryKeys.messages.tickets.list() });
      qc.invalidateQueries({ queryKey: queryKeys.messages.unread() });
      router.replace(ROUTES.accountMessages);
    } catch (e: any) {
      setError(e.message || t("support.ticket.submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("support.ticket.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("support.ticket.whatsThisAbout")}
        </AppText>

        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.code}
              onPress={() => setCategory(cat.code)}
              style={[
                styles.categoryCard,
                category === cat.code && styles.categoryCardSelected,
              ]}
            >
              <Icon
                name={cat.icon}
                size={24}
                color={category === cat.code ? colors.brandBlue : colors.muted}
              />
              <AppText
                variant="label"
                color={category === cat.code ? colors.brandBlue : colors.foreground}
                align="center"
                style={{ marginTop: spacing[1] }}
              >
                {t(cat.labelKey)}
              </AppText>
            </Pressable>
          ))}
        </View>

        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("support.ticket.describeIssue")}
        </AppText>
        <TextInput
          style={styles.textArea}
          value={body}
          onChangeText={setBody}
          placeholder={t("support.ticket.placeholder")}
          placeholderTextColor={colors.mutedLight}
          multiline
          maxLength={2000}
          textAlignVertical="top"
        />
        <AppText variant="caption" color={colors.muted} align="right">
          {body.length}/2000
        </AppText>

        {error && (
          <View style={styles.errorBanner}>
            <Icon name="error-outline" size={18} color={colors.danger} />
            <AppText variant="caption" color={colors.danger} style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        )}

        <AppButton
          title={submitting ? t("support.ticket.submitting") : t("support.ticket.submit")}
          variant="primary"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={!category || !body.trim()}
          onPress={handleSubmit}
          style={{ marginTop: spacing[4] }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  sectionTitle: { marginTop: spacing[2], marginBottom: spacing[3] },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  categoryCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    alignItems: "center",
    ...shadows.sm,
  },
  categoryCardSelected: {
    borderWidth: 2,
    borderColor: colors.brandBlue,
    backgroundColor: colors.brandBlueLight,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.white,
    minHeight: 150,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: "#FEF2F2",
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginTop: spacing[3],
  },
});
