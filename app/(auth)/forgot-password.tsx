import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { customerFetch, FetchError } from "@/lib/api";
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";
import { ROUTES } from "@/lib/routes";

type Step = "email" | "code" | "password";
const STEPS: Step[] = ["email", "code", "password"];
const CODE_LENGTH = 6;

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [resetSessionToken, setResetSessionToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const handleSendCode = async () => {
    if (!email.trim() || cooldown > 0) return;
    setLoading(true);
    try {
      await customerFetch("/customer-auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setStep("code");
      startCooldown();
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      if (e instanceof FetchError && e.status === 429) {
        startCooldown();
      }
      Alert.alert("Error", e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setLoading(true);
    try {
      await customerFetch("/customer-auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      startCooldown();
      setCode(Array(CODE_LENGTH).fill(""));
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    } catch (e: any) {
      if (e instanceof FetchError && e.status === 429) {
        startCooldown();
      }
      Alert.alert("Error", e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeChange = useCallback(
    (index: number, value: string) => {
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
    },
    [],
  );

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
      Alert.alert("Error", "Please enter the full 6-digit code.");
      return;
    }

    setLoading(true);
    try {
      const data = await customerFetch<{ resetSessionToken: string }>(
        "/customer-auth/verify-reset-code",
        {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), code: fullCode }),
        },
      );
      setResetSessionToken(data.resetSessionToken);
      setStep("password");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Invalid or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      Alert.alert("Error", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      Alert.alert("Error", `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await customerFetch("/customer-auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ resetSessionToken, newPassword }),
      });
      setSuccess(true);
      setTimeout(() => router.replace(ROUTES.login), 2000);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to reset password. Please start over.");
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);

  if (success) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.body}>
          <Icon name="check-circle" size={48} color={colors.success} />
          <AppText variant="heading" style={styles.title}>
            Password Reset!
          </AppText>
          <AppText variant="body" color={colors.muted} align="center" style={styles.desc}>
            Your password has been reset. Redirecting to sign in...
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
      <Pressable style={styles.close} onPress={() => router.back()} hitSlop={12}>
        <Icon name="close" size={24} color={colors.foreground} />
      </Pressable>

      <View style={styles.body}>
        {/* Step indicator */}
        <View style={styles.stepRow}>
          {STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      i === stepIndex
                        ? colors.brandBlue
                        : i < stepIndex
                          ? colors.brandBlueLight
                          : colors.gray200,
                  },
                ]}
              />
              {i < STEPS.length - 1 && (
                <View
                  style={[
                    styles.stepLine,
                    {
                      backgroundColor:
                        i < stepIndex ? colors.brandBlueLight : colors.gray200,
                    },
                  ]}
                />
              )}
            </React.Fragment>
          ))}
        </View>

        {/* Step: email */}
        {step === "email" && (
          <>
            <Icon name="lock-reset" size={48} color={colors.brandBlue} />
            <AppText variant="heading" style={styles.title}>
              Forgot Password
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.desc}>
              Enter your email and we&apos;ll send you a 6-digit reset code.
            </AppText>
            <View style={styles.field}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
            <AppButton
              title={cooldown > 0 ? `Wait ${cooldown}s` : "Send Reset Code"}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              disabled={cooldown > 0 || !email.trim()}
              onPress={handleSendCode}
              style={styles.btn}
            />
          </>
        )}

        {/* Step: code */}
        {step === "code" && (
          <>
            <Icon name="dialpad" size={48} color={colors.brandBlue} />
            <AppText variant="heading" style={styles.title}>
              Enter Your Code
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.desc}>
              We sent a 6-digit code to {email}
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
                  textContentType="oneTimeCode"
                  selectTextOnFocus
                />
              ))}
            </View>

            <AppButton
              title={loading ? "Verifying..." : "Verify Code"}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              disabled={code.join("").length !== CODE_LENGTH}
              onPress={handleVerifyCode}
              style={styles.btn}
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
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </AppText>
            </Pressable>
          </>
        )}

        {/* Step: new password */}
        {step === "password" && (
          <>
            <Icon name="lock" size={48} color={colors.brandBlue} />
            <AppText variant="heading" style={styles.title}>
              Set New Password
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.desc}>
              Choose a strong password for your account.
            </AppText>

            <View style={styles.field}>
              <AppText variant="label" style={styles.label}>
                New password
              </AppText>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={`Min. ${MIN_PASSWORD_LENGTH} characters`}
                  placeholderTextColor={colors.mutedLight}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  hitSlop={8}
                >
                  <Icon
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
            </View>

            <View style={styles.field}>
              <AppText variant="label" style={styles.label}>
                Confirm password
              </AppText>
              <View style={styles.passwordWrap}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Re-enter your password"
                  placeholderTextColor={colors.mutedLight}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoComplete="new-password"
                  maxLength={MAX_PASSWORD_LENGTH}
                />
                <Pressable
                  onPress={() => setShowConfirm((v) => !v)}
                  style={styles.eyeBtn}
                  hitSlop={8}
                >
                  <Icon
                    name={showConfirm ? "eye-off" : "eye"}
                    size={20}
                    color={colors.muted}
                  />
                </Pressable>
              </View>
            </View>

            <AppButton
              title={loading ? "Resetting..." : "Reset Password"}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              disabled={!newPassword || !confirmPassword}
              onPress={handleResetPassword}
              style={styles.btn}
            />
          </>
        )}

        {/* Back to sign in */}
        <Pressable onPress={() => router.replace(ROUTES.login)} style={styles.backBtn}>
          <Icon name="arrow-left" size={16} color={colors.muted} />
          <AppText variant="body" color={colors.muted}>
            Back to sign in
          </AppText>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  close: { position: "absolute", top: 56, left: spacing[4], zIndex: 10 },
  body: {
    flex: 1,
    paddingHorizontal: spacing[6],
    justifyContent: "center",
    alignItems: "center",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[6],
    gap: spacing[2],
  },
  stepDot: { width: 10, height: 10, borderRadius: 5 },
  stepLine: { width: 32, height: 2, borderRadius: 1 },
  title: { marginTop: spacing[4] },
  desc: { marginTop: spacing[2], marginBottom: spacing[6], maxWidth: 280 },
  field: { width: "100%", marginBottom: spacing[4] },
  label: { marginBottom: spacing[1] },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.gray50,
    width: "100%",
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
  codeInputFilled: {
    backgroundColor: colors.brandBlueLight,
  },
  btn: { marginTop: spacing[2] },
  resendBtn: { marginTop: spacing[4], alignItems: "center" },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    marginTop: spacing[6],
  },
});
