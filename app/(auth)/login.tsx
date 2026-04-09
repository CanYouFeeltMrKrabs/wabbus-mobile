import React, { useState } from "react";
import {
  View,
  TextInput,
  Pressable,
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
import { MAX_PASSWORD_LENGTH } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.back();
    } catch (e: any) {
      setError(e.message || t("auth.login.errorBadCredentials"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      {/* Close button */}
      <Pressable style={styles.close} onPress={() => router.back()} hitSlop={12}>
        <Icon name="close" size={24} color={colors.foreground} />
      </Pressable>

      <View style={styles.body}>
        <View style={styles.logoWrap}>
          <View style={styles.logo}>
            <AppText variant="heading" color={colors.white} weight="extrabold">
              W
            </AppText>
          </View>
        </View>

        <AppText variant="heading" align="center">
          {t("auth.login.welcomeBack")}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={styles.sub}>
          {t("auth.login.subtitle")}
        </AppText>

        {error && (
          <View style={styles.errorBanner}>
            <Icon name="error-outline" size={18} color={colors.error} />
            <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>{error}</AppText>
          </View>
        )}

        {/* Email */}
        <View style={styles.field}>
          <AppText variant="label" style={styles.fieldLabel}>
            {t("auth.login.emailLabel")}
          </AppText>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t("auth.login.emailPlaceholder")}
            placeholderTextColor={colors.mutedLight}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
          />
        </View>

        {/* Password */}
        <View style={styles.field}>
          <AppText variant="label" style={styles.fieldLabel}>
            {t("auth.login.passwordLabel")}
          </AppText>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder={t("auth.login.passwordPlaceholder")}
              placeholderTextColor={colors.mutedLight}
              secureTextEntry={!showPassword}
              autoComplete="password"
              maxLength={MAX_PASSWORD_LENGTH}
            />
            <Pressable
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
              hitSlop={8}
            >
              <Icon
                name={showPassword ? "visibility-off" : "visibility"}
                size={20}
                color={colors.muted}
              />
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => router.push(ROUTES.forgotPassword)} style={styles.forgotWrap}>
          <AppText variant="label" color={colors.brandBlue}>
            {t("auth.login.forgotPassword")}
          </AppText>
        </Pressable>

        <AppButton
          title={t("auth.login.signIn")}
          variant="primary"
          fullWidth
          size="lg"
          loading={loading}
          onPress={handleLogin}
          style={styles.submitBtn}
        />

        <View style={styles.registerRow}>
          <AppText variant="body" color={colors.muted}>
            {t("auth.login.noAccount")}{" "}
          </AppText>
          <Pressable onPress={() => router.replace(ROUTES.register)}>
            <AppText variant="body" color={colors.brandOrange} weight="bold">
              {t("auth.login.createOne")}
            </AppText>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  close: { position: "absolute", top: 56, left: spacing[4], zIndex: 10 },
  body: { flex: 1, paddingHorizontal: spacing[6], justifyContent: "center" },

  logoWrap: { alignItems: "center", marginBottom: spacing[6] },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.brandBlue,
    alignItems: "center",
    justifyContent: "center",
  },

  sub: { marginTop: spacing[1], marginBottom: spacing[6] },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing[2],
    backgroundColor: "#fee2e2", borderRadius: borderRadius.lg,
    padding: spacing[3], marginBottom: spacing[4],
  },
  field: { marginBottom: spacing[4] },
  fieldLabel: { marginBottom: spacing[1.5] },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.gray50,
  },
  passwordRow: { position: "relative" },
  passwordInput: { paddingRight: spacing[12] },
  eyeBtn: { position: "absolute", right: spacing[3], top: spacing[3] },

  forgotWrap: { alignSelf: "flex-end", marginBottom: spacing[4] },
  submitBtn: { marginTop: spacing[2] },
  registerRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing[6],
  },
});
