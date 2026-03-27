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
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";

type Step = "request" | "verify" | "change";
const CODE_LENGTH = 6;

export default function ChangeEmailScreen() {
  return (
    <RequireAuth>
      <ChangeEmailContent />
    </RequireAuth>
  );
}

function ChangeEmailContent() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [step, setStep] = useState<Step>("request");
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [sessionToken, setSessionToken] = useState("");
  const [newEmail, setNewEmail] = useState("");
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
      Alert.alert("Error", e.message || "Unable to send verification code.");
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
      Alert.alert("Error", e.message || "Unable to resend code.");
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
      Alert.alert("Error", "Please enter the full 6-digit code.");
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
      Alert.alert("Error", e.message || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      Alert.alert("Error", "Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await customerFetch("/customer-auth/change-email", {
        method: "POST",
        body: JSON.stringify({ sessionToken, newEmail: trimmed }),
      });
      setSuccess(true);
      await refresh();
      setTimeout(() => router.back(), 2000);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Unable to update email.");
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
            Email Updated
          </AppText>
          <AppText variant="body" color={colors.muted} align="center">
            Your email has been changed successfully.
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
        <AppButton title="" variant="ghost" icon="arrow-back" onPress={() => router.back()} style={{ width: 44 }} />
        <AppText variant="title">Change Email</AppText>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Step 1: Request */}
        {step === "request" && (
          <View style={styles.stepCard}>
            <Icon name="shield-lock" size={40} color={colors.brandBlue} />
            <AppText variant="subtitle" style={styles.stepTitle}>
              Verify Your Identity
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.stepDesc}>
              We'll send a 6-digit code to{" "}
              {user?.email ? (
                <AppText variant="body" weight="semibold">{user.email}</AppText>
              ) : (
                "your current email"
              )}
              .
            </AppText>
            <AppButton
              title={loading ? "Sending..." : "Send Verification Code"}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              onPress={handleRequestCode}
            />
            <AppButton
              title="Cancel"
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
              Enter Verification Code
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.stepDesc}>
              Enter the 6-digit code sent to your email. Expires in 6 minutes.
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
              title={loading ? "Verifying..." : "Verify"}
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
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
              </AppText>
            </Pressable>
          </View>
        )}

        {/* Step 3: Enter new email */}
        {step === "change" && (
          <View style={styles.stepCard}>
            <Icon name="email-edit" size={40} color={colors.brandBlue} />
            <AppText variant="subtitle" style={styles.stepTitle}>
              Enter New Email
            </AppText>

            <View style={styles.field}>
              <AppText variant="label" style={styles.fieldLabel}>
                New email address
              </AppText>
              <TextInput
                style={styles.input}
                value={newEmail}
                onChangeText={setNewEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            <AppButton
              title={loading ? "Updating..." : "Update Email"}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              disabled={!newEmail.trim()}
              onPress={handleChangeEmail}
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
    width: "100%",
  },
});
