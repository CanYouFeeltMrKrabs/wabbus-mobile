import React, { useCallback, useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { colors, shadows } from "@/lib/theme";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import AuthScreenLayout, { AuthHeader } from "@/components/auth/AuthScreenLayout";
import AppleSignInButton from "@/components/auth/AppleSignInButton";
import { authStyles } from "@/components/auth/authStyles";

const PLACEHOLDER_MUTED = "#94a3b8";

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { register } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearAndGoBack = useCallback(() => {
    setEmail("");
    setPassword("");
    requestAnimationFrame(() => router.back());
  }, [router]);

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("auth.register.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout onClose={clearAndGoBack}>
      <AuthHeader title={t("auth.register.heading")} subtitle={t("auth.register.subtitle")} />

      {error && (
        <View style={authStyles.errorBanner}>
          <Icon name="error" size={24} color="#f87171" />
          <AppText style={authStyles.errorText}>{error}</AppText>
        </View>
      )}

      <View style={authStyles.fieldBlock}>
        <AppText style={authStyles.label}>{t("auth.register.emailLabel")}</AppText>
        <View style={authStyles.inputWrap}>
          <View style={authStyles.inputIcon}>
            <Icon name="email" size={24} color={colors.brandBlue} />
          </View>
          <TextInput
            style={authStyles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t("auth.register.emailPlaceholder")}
            placeholderTextColor={PLACEHOLDER_MUTED}
            keyboardType="email-address"
            textContentType="username"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>
      </View>

      <View style={authStyles.fieldBlock}>
        <AppText style={authStyles.label}>{t("auth.register.passwordLabel")}</AppText>
        <View style={authStyles.inputWrap}>
          <View style={authStyles.inputIcon}>
            <Icon name="lock" size={24} color={colors.brandBlue} />
          </View>
          <TextInput
            style={[authStyles.input, authStyles.inputWithToggle]}
            value={password}
            onChangeText={setPassword}
            placeholder={t("auth.register.passwordPlaceholder", { min: MIN_PASSWORD_LENGTH })}
            placeholderTextColor={PLACEHOLDER_MUTED}
            secureTextEntry={!showPassword}
            textContentType="none"
            autoComplete="off"
            maxLength={MAX_PASSWORD_LENGTH}
          />
          <Pressable
            style={authStyles.togglePassword}
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? t("auth.login.hidePassword") : t("auth.login.showPassword")}
          >
            <Icon
              name={showPassword ? "visibility-off" : "visibility"}
              size={24}
              color={colors.slate400}
            />
          </Pressable>
        </View>
      </View>

      <AppButton
        title={t("auth.register.createAccount")}
        accessibilityHint={loading ? t("auth.register.creatingAccount") : undefined}
        variant="primary"
        fullWidth
        size="lg"
        textStyle={{ fontSize: 17 }}
        loading={loading}
        onPress={handleRegister}
        style={[authStyles.submitBtn, shadows.authCta]}
      />

      <AppleSignInButton />

      <View style={authStyles.altRow}>
        <AppText style={authStyles.altMuted}>{t("auth.register.alreadyHaveAccount")} </AppText>
        <Pressable
          onPress={() => router.replace(ROUTES.login)}
          style={authStyles.altLink}
          hitSlop={4}
        >
          <AppText style={authStyles.altLinkText}>{t("auth.register.signIn")}</AppText>
          <Icon name="arrow-forward" size={20} color={colors.brandOrange} />
        </Pressable>
      </View>
    </AuthScreenLayout>
  );
}
