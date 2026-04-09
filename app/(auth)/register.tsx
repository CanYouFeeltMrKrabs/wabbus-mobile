import React, { useState } from "react";
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError(t("auth.register.errorEmptyFields"));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.register.errorMinPassword", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      setError(t("auth.register.errorMaxPassword", { max: MAX_PASSWORD_LENGTH }));
      return;
    }
    setLoading(true);
    try {
      await register({ email: email.trim(), password });
      router.back();
    } catch (e: any) {
      setError(e.message || t("auth.register.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <Pressable style={styles.close} onPress={() => router.back()} hitSlop={12}>
        <Icon name="close" size={24} color={colors.foreground} />
      </Pressable>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <View style={styles.logo}>
            <AppText variant="heading" color={colors.white} weight="extrabold">
              W
            </AppText>
          </View>
        </View>

        <AppText variant="heading" align="center">
          {t("auth.register.heading")}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={styles.sub}>
          {t("auth.register.subtitle")}
        </AppText>

        {error && (
          <View style={styles.errorBanner}>
            <Icon name="error-outline" size={18} color={colors.error} />
            <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>{error}</AppText>
          </View>
        )}

        <View style={styles.field}>
          <AppText variant="label" style={styles.fieldLabel}>{t("auth.register.emailLabel")}</AppText>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={t("auth.register.emailPlaceholder")} placeholderTextColor={colors.mutedLight} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        </View>

        <View style={styles.field}>
          <AppText variant="label" style={styles.fieldLabel}>{t("auth.register.passwordLabel")}</AppText>
          <View style={styles.passwordRow}>
            <TextInput style={[styles.input, styles.passwordInput]} value={password} onChangeText={setPassword} placeholder={t("auth.register.passwordPlaceholder", { min: MIN_PASSWORD_LENGTH })} placeholderTextColor={colors.mutedLight} secureTextEntry={!showPassword} autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} />
            <Pressable style={styles.eyeBtn} onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
              <Icon name={showPassword ? "visibility-off" : "visibility"} size={20} color={colors.muted} />
            </Pressable>
          </View>
        </View>

        <AppButton
          title={t("auth.register.createAccount")}
          variant="primary"
          fullWidth
          size="lg"
          loading={loading}
          onPress={handleRegister}
          style={styles.submitBtn}
        />

        <View style={styles.loginRow}>
          <AppText variant="body" color={colors.muted}>{t("auth.register.alreadyHaveAccount")} </AppText>
          <Pressable onPress={() => router.replace(ROUTES.login)}>
            <AppText variant="body" color={colors.brandOrange} weight="bold">{t("auth.register.signIn")}</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  close: { position: "absolute", top: 56, left: spacing[4], zIndex: 10 },
  body: { flexGrow: 1, paddingHorizontal: spacing[6], justifyContent: "center", paddingBottom: spacing[10] },
  logoWrap: { alignItems: "center", marginBottom: spacing[6] },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.brandOrange, alignItems: "center", justifyContent: "center" },
  sub: { marginTop: spacing[1], marginBottom: spacing[6] },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    backgroundColor: "#fee2e2", borderRadius: borderRadius.lg,
    padding: spacing[3], marginBottom: spacing[4],
  },
  field: { marginBottom: spacing[4] },
  fieldLabel: { marginBottom: spacing[1.5] },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: spacing[3], fontSize: fontSize.base, color: colors.foreground, backgroundColor: colors.gray50,
  },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: spacing[12] },
  eyeBtn: { position: "absolute", right: spacing[3], top: spacing[3] },
  submitBtn: { marginTop: spacing[2] },
  loginRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing[6] },
});
