import React, { useCallback, useState } from "react";
import { View, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { colors, shadows } from "@/lib/theme";
import { MAX_PASSWORD_LENGTH } from "@/lib/constants";
import { ROUTES } from "@/lib/routes";
import AuthScreenLayout, { AuthHeader } from "@/components/auth/AuthScreenLayout";
import AppleSignInButton from "@/components/auth/AppleSignInButton";
import { authStyles } from "@/components/auth/authStyles";

const PLACEHOLDER_MUTED = "#94a3b8";

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearAndGoBack = useCallback(() => {
    setEmail("");
    setPassword("");
    requestAnimationFrame(() => router.back());
  }, [router]);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.back();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("auth.login.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreenLayout onClose={clearAndGoBack}>
      <AuthHeader title={t("auth.login.welcome")} subtitle={t("auth.login.subtitle")} />

      {error && (
        <View style={authStyles.errorBanner}>
          <Icon name="error" size={24} color="#f87171" />
          <AppText style={authStyles.errorText}>{error}</AppText>
        </View>
      )}

      <View style={authStyles.fieldBlock}>
        <AppText style={authStyles.label}>{t("auth.login.emailLabel")}</AppText>
        <View style={authStyles.inputWrap}>
          <View style={authStyles.inputIcon}>
            <Icon name="email" size={24} color={colors.brandBlue} />
          </View>
          <TextInput
            style={authStyles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t("auth.login.emailPlaceholder")}
            placeholderTextColor={PLACEHOLDER_MUTED}
            keyboardType="email-address"
            textContentType="username"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
          />
        </View>
      </View>

      <View style={authStyles.fieldBlock}>
        <AppText style={authStyles.label}>{t("auth.login.passwordLabel")}</AppText>
        <View style={authStyles.inputWrap}>
          <View style={authStyles.inputIcon}>
            <Icon name="lock" size={24} color={colors.brandBlue} />
          </View>
          <TextInput
            style={[authStyles.input, authStyles.inputWithToggle]}
            value={password}
            onChangeText={setPassword}
            placeholder={t("auth.login.passwordPlaceholder")}
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
        <Pressable
          onPress={() => router.push(ROUTES.forgotPassword)}
          style={authStyles.forgotLink}
          hitSlop={8}
        >
          <AppText style={authStyles.forgotText}>{t("auth.login.forgotPassword")}</AppText>
        </Pressable>
      </View>

      <AppButton
        title={t("auth.login.signIn")}
        accessibilityHint={loading ? t("auth.login.signingIn") : undefined}
        variant="primary"
        fullWidth
        size="lg"
        textStyle={{ fontSize: 17 }}
        loading={loading}
        onPress={handleLogin}
        style={[authStyles.submitBtn, shadows.authCta]}
      />

      <AppleSignInButton />

      <View style={authStyles.altRow}>
        <AppText style={authStyles.altMuted}>{t("auth.login.noAccount")} </AppText>
        <Pressable
          onPress={() => router.replace(ROUTES.register)}
          style={authStyles.altLink}
          hitSlop={4}
        >
          <AppText style={authStyles.altLinkText}>{t("auth.login.createOne")}</AppText>
          <Icon name="arrow-forward" size={20} color={colors.brandOrange} />
        </Pressable>
      </View>
    </AuthScreenLayout>
  );
}
