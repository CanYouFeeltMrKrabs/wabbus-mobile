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
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";

const CATEGORIES = [
  { code: "TECHNICAL", label: "Technical Issue", icon: "build" },
  { code: "BILLING", label: "Billing", icon: "credit-card" },
  { code: "ACCOUNT", label: "Account", icon: "account-circle" },
  { code: "OTHER", label: "Other", icon: "help-circle" },
];

export default function SubmitTicketScreen() {
  return (
    <RequireAuth>
      <TicketContent />
    </RequireAuth>
  );
}

function TicketContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!category || !body.trim()) {
      setError("Please select a category and describe your issue.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await customerFetch("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), category }),
      });
      router.replace(ROUTES.accountMessages);
    } catch (e: any) {
      setError(e.message || "Unable to submit ticket.");
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
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Submit a Ticket</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="subtitle" style={styles.sectionTitle}>
          What's this about?
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
                {cat.label}
              </AppText>
            </Pressable>
          ))}
        </View>

        <AppText variant="subtitle" style={styles.sectionTitle}>
          Describe your issue
        </AppText>
        <TextInput
          style={styles.textArea}
          value={body}
          onChangeText={setBody}
          placeholder="Please provide as much detail as possible..."
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
          title={submitting ? "Submitting..." : "Submit Ticket"}
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
