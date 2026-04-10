import React, { useState, useCallback } from "react";
import { View, TextInput, ScrollView, StyleSheet, Alert, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { useAuth } from "@/lib/auth";
import { customerFetch, FetchError } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

export default function DeleteAccountScreen() {
  return <RequireAuth><DeleteAccountContent /></RequireAuth>;
}

function DeleteAccountContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refresh } = useAuth();

  const isPending = user?.accountStatus === "PENDING_DELETION";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleRequestDeletion = useCallback(async () => {
    if (!password.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await customerFetch("/customer-auth/request-deletion", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      await logout();
      showToast(t("account.deleteAccount.successTitle"), "success");
    } catch (e) {
      if (e instanceof FetchError && e.status === 400) {
        setError(t("account.deleteAccount.errorPassword"));
      } else {
        setError(t("account.deleteAccount.errorGeneric"));
      }
    } finally {
      setLoading(false);
    }
  }, [password, t, logout]);

  const handleCancelDeletion = useCallback(() => {
    Alert.alert(
      t("account.deleteAccount.cancelConfirmTitle"),
      t("account.deleteAccount.cancelConfirmBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("account.deleteAccount.cancelConfirmButton"),
          onPress: async () => {
            setLoading(true);
            try {
              await customerFetch("/customer-auth/cancel-deletion", {
                method: "POST",
              });
              await refresh();
              showToast(t("account.deleteAccount.cancelSuccess"), "success");
            } catch {
              showToast(t("account.deleteAccount.cancelError"), "error");
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  }, [t, refresh]);

  const bullets = [
    t("account.deleteAccount.bullet1"),
    t("account.deleteAccount.bullet2"),
    t("account.deleteAccount.bullet3"),
    t("account.deleteAccount.bullet4"),
  ];

  if (isPending) {
    return (
      <View style={[st.screen, { paddingTop: insets.top }]}>
        <View style={st.header}>
          <BackButton />
          <AppText variant="title">{t("account.deleteAccount.title")}</AppText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={st.content}>
          <View style={st.pendingCard}>
            <Icon name="schedule" size={40} color={colors.warning} />
            <AppText variant="subtitle" style={{ marginTop: spacing[3] }}>
              {t("account.deleteAccount.pendingTitle")}
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2] }}>
              {t("account.deleteAccount.pendingBody", {
                date: formatDate(user?.deletionScheduledAt),
              })}
            </AppText>
          </View>

          <AppButton
            title={t("account.deleteAccount.cancelDeletion")}
            variant="primary"
            fullWidth
            icon="restore"
            loading={loading}
            onPress={handleCancelDeletion}
            style={{ marginTop: spacing[4] }}
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[st.screen, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <BackButton />
        <AppText variant="title">{t("account.deleteAccount.title")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <View style={st.warningCard}>
          <Icon name="warning" size={32} color={colors.error} />
          <AppText variant="subtitle" style={{ marginTop: spacing[3] }}>
            {t("account.deleteAccount.warningTitle")}
          </AppText>
          <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[2] }}>
            {t("account.deleteAccount.warningBody")}
          </AppText>
        </View>

        <AppText variant="label" style={{ marginTop: spacing[5], marginBottom: spacing[2] }}>
          {t("account.deleteAccount.whatHappens")}
        </AppText>
        {bullets.map((b) => (
          <View key={b} style={st.bullet}>
            <Icon name="remove-circle-outline" size={18} color={colors.error} style={{ marginTop: 2 }} />
            <AppText variant="body" color={colors.muted} style={{ flex: 1 }}>{b}</AppText>
          </View>
        ))}

        <View style={st.divider} />

        <AppText variant="label" style={{ marginBottom: spacing[2] }}>
          {t("account.deleteAccount.confirmPassword")}
        </AppText>
        <View style={st.inputWrap}>
          <TextInput
            style={st.input}
            placeholder={t("account.deleteAccount.passwordPlaceholder")}
            placeholderTextColor={colors.mutedLight}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="current-password"
          />
          <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={12} style={st.eyeBtn}>
            <Icon name={showPassword ? "visibility-off" : "visibility"} size={22} color={colors.muted} />
          </Pressable>
        </View>

        {error && (
          <View style={st.errorBanner}>
            <Icon name="error" size={18} color={colors.error} />
            <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>{error}</AppText>
          </View>
        )}

        <AppButton
          title={loading ? t("account.deleteAccount.confirming") : t("account.deleteAccount.confirmButton")}
          variant="danger"
          fullWidth
          icon="delete-forever"
          loading={loading}
          disabled={!password.trim() || loading}
          onPress={handleRequestDeletion}
          style={{ marginTop: spacing[4] }}
        />

        <View style={{ height: spacing[10] }} />
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  warningCard: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  pendingCard: {
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.xl,
    padding: spacing[5],
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  bullet: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    marginTop: spacing[2],
    paddingLeft: spacing[1],
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginVertical: spacing[5],
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing[3],
    ...shadows.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing[3],
    fontSize: 16,
    color: colors.foreground,
  },
  eyeBtn: { padding: spacing[1] },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginTop: spacing[3],
  },
});
