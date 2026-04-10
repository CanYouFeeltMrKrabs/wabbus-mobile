import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
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
import { useAuth } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";
import { ROUTES } from "@/lib/routes";

type Step = "request" | "verify" | "change";
const CODE_LENGTH = 6;

export default function ChangePasswordScreen() {
  return (
    <RequireAuth>
      <ChangePasswordContent />
    </RequireAuth>
  );
}

function ChangePasswordContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();

  const [step, setStep] = useState<Step>("request");
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [sessionToken, setSessionToken] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [success, setSuccess] = useState(false);

  const codeRefs = useRef<(TextInput | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleRequestCode = async () => {
    setLoading(true);
    try {
      await customerFetch("/customer-auth/request-account-verify", { method: "POST" });
      setStep("verify");
      startCooldown();
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("account.verify.errorSendCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      await customerFetch("/customer-auth/request-account-verify", { method: "POST" });
      startCooldown();
      setCode(Array(CODE_LENGTH).fill(""));
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("account.verify.errorResendCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = useCallback((index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const digit = value.slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < CODE_LENGTH - 1) {
      codeRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleCodeKeyPress = useCallback(
    (index: number, e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
        codeRefs.current[index - 1]?.focus();
      }
    },
    [code],
  );

  const handleVerifyCode = async () => {
    const fullCode = code.join("");
    if (fullCode.length !== CODE_LENGTH) {
      Alert.alert(t("common.error"), t("account.verify.errorFullCode"));
      return;
    }

    setLoading(true);
    try {
      const data = await customerFetch<{ sessionToken: string }>(
        "/customer-auth/verify-account-code",
        { method: "POST", body: JSON.stringify({ code: fullCode }) },
      );
      setSessionToken(data.sessionToken);
      setStep("change");
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("account.verify.errorInvalidCode"));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(t("common.error"), t("account.password.errorMinPassword", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      Alert.alert(t("common.error"), t("account.password.errorMaxPassword", { max: MAX_PASSWORD_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t("common.error"), t("account.password.errorMismatch"));
      return;
    }

    setLoading(true);
    try {
      await customerFetch("/customer-auth/change-password", {
        method: "POST",
        body: JSON.stringify({ sessionToken, currentPassword, newPassword }),
      });
      setSuccess(true);
      await logout();
      setTimeout(() => router.replace(ROUTES.login), 2000);
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("account.password.errorChangePassword"));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.center}>
          <Icon name="check-circle" size={48} color={colors.success} />
          <AppText variant="heading" style={styles.successTitle}>
            {t("account.password.successHeading")}
          </AppText>
          <AppText variant="body" color={colors.muted} align="center">
            {t("account.password.successRedirecting")}
          </AppText>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("account.password.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Step 1: Request */}
        {step === "request" && (
          <View style={styles.stepCard}>
            <Icon name="verified-user" size={40} color={colors.brandBlue} />
            <AppText variant="subtitle" style={styles.stepTitle}>
              {t("account.verify.verifyIdentity")}
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.stepDesc}>
              {t("account.verify.sendCodeToEmail")}
            </AppText>
            <AppButton
              title={loading ? t("account.verify.sending") : t("account.verify.sendVerificationCode")}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              onPress={handleRequestCode}
            />
            <AppButton
              title={t("common.cancel")}
              variant="ghost"
              onPress={() => router.back()}
              style={styles.cancelBtn}
            />
          </View>
        )}

        {/* Step 2: Verify code */}
        {step === "verify" && (
          <View style={styles.stepCard}>
            <Icon name="dialpad" size={40} color={colors.brandBlue} />
            <AppText variant="subtitle" style={styles.stepTitle}>
              {t("account.verify.enterVerificationCode")}
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.stepDesc}>
              {t("account.verify.codeExpiresDesc")}
            </AppText>

            <View style={styles.codeRow}>
              {code.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={(el) => {
                    codeRefs.current[i] = el;
                  }}
                  style={[styles.codeInput, digit ? styles.codeInputFilled : null]}
                  value={digit}
                  onChangeText={(v) => handleCodeChange(i, v)}
                  onKeyPress={(e) => handleCodeKeyPress(i, e)}
                  keyboardType="number-pad"
                  maxLength={1}
                  selectTextOnFocus
                />
              ))}
            </View>

            <AppButton
              title={loading ? t("account.verify.verifying") : t("account.verify.verify")}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              disabled={code.join("").length !== CODE_LENGTH}
              onPress={handleVerifyCode}
            />
            <Pressable
              onPress={handleResendCode}
              disabled={cooldown > 0 || loading}
              style={styles.resendBtn}
            >
              <AppText
                variant="body"
                color={cooldown > 0 ? colors.muted : colors.brandBlue}
                weight="semibold"
              >
                {cooldown > 0 ? t("account.verify.resendCodeIn", { cooldown }) : t("account.verify.resendCode")}
              </AppText>
            </Pressable>
          </View>
        )}

        {/* Step 3: New password */}
        {step === "change" && (
          <View style={styles.stepCard}>
            <Icon name="lock" size={40} color={colors.brandBlue} />
            <AppText variant="subtitle" style={styles.stepTitle}>
              {t("account.password.setNewPassword")}
            </AppText>

            <View style={styles.field}>
              <AppText variant="label" style={styles.fieldLabel}>
                {t("account.password.currentPassword")}
              </AppText>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  secureTextEntry={!showCurrent}
                  autoCapitalize="none"
                  autoComplete="current-password"
                />
                <Pressable onPress={() => setShowCurrent((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
                  <Icon name={showCurrent ? "eye-off" : "eye"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="label" style={styles.fieldLabel}>
                {t("account.password.newPassword")}
              </AppText>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={t("account.password.newPasswordPlaceholder", { min: MIN_PASSWORD_LENGTH })}
                  placeholderTextColor={colors.mutedLight}
                  secureTextEntry={!showNew}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <Pressable onPress={() => setShowNew((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
                  <Icon name={showNew ? "eye-off" : "eye"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="label" style={styles.fieldLabel}>
                {t("account.password.confirmNewPassword")}
              </AppText>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={t("account.password.confirmPlaceholder")}
                  placeholderTextColor={colors.mutedLight}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <Pressable onPress={() => setShowConfirm((v) => !v)} style={styles.eyeBtn} hitSlop={8}>
                  <Icon name={showConfirm ? "eye-off" : "eye"} size={20} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            <AppButton
              title={loading ? t("account.password.changing") : t("account.password.changePassword")}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              disabled={!currentPassword || !newPassword || !confirmPassword}
              onPress={handleChangePassword}
              style={{ marginTop: spacing[2] }}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing[6] },
  successTitle: { marginTop: spacing[4], marginBottom: spacing[2] },
  stepCard: { alignItems: "center", paddingTop: spacing[6] },
  stepTitle: { marginTop: spacing[4] },
  stepDesc: { marginTop: spacing[2], marginBottom: spacing[6], maxWidth: 300 },
  codeRow: {
    flexDirection: "row",
    gap: spacing[2],
    marginBottom: spacing[4],
    justifyContent: "center",
  },
  codeInput: {
    width: 44,
    height: 52,
    borderWidth: 1.5,
    borderColor: colors.brandBlue,
    borderRadius: borderRadius.lg,
    textAlign: "center",
    fontSize: fontSize.xl,
    fontWeight: "700",
    color: colors.foreground,
    backgroundColor: colors.white,
  },
  codeInputFilled: { backgroundColor: colors.brandBlueLight },
  resendBtn: { marginTop: spacing[4], alignItems: "center" },
  cancelBtn: { marginTop: spacing[3] },
  field: { width: "100%", marginBottom: spacing[3] },
  fieldLabel: { marginBottom: spacing[1] },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.white,
  },
  passwordWrap: { position: "relative", width: "100%" },
  passwordInput: { paddingRight: spacing[10] },
  eyeBtn: {
    position: "absolute",
    right: spacing[3],
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
});
