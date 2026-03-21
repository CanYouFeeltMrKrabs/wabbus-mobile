import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { customerFetch } from "@/lib/api";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
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
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleSubmit = async () => {
    if (!email.trim() || cooldown > 0) return;
    setLoading(true);
    try {
      await customerFetch("/customer-auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
      startCooldown();
    } catch (e: any) {
      if (e.status === 429) {
        startCooldown();
      }
      Alert.alert("Error", e.message || "Something went wrong.");
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

      <View style={styles.body}>
        <Icon name="lock-reset" size={48} color={colors.brandBlue} />
        <AppText variant="heading" style={styles.title}>
          {sent ? "Check Your Email" : "Forgot Password"}
        </AppText>

        {sent ? (
          <>
            <AppText variant="body" color={colors.muted} align="center" style={styles.desc}>
              If an account exists for {email}, we&apos;ve sent password reset instructions.
            </AppText>
            {cooldown > 0 && (
              <AppText variant="body" color={colors.muted} align="center" style={styles.cooldownText}>
                Please wait {cooldown}s before requesting again.
              </AppText>
            )}
            <AppButton title="Back to Sign In" variant="primary" fullWidth onPress={() => router.replace("/(auth)/login")} style={styles.btn} />
          </>
        ) : (
          <>
            <AppText variant="body" color={colors.muted} align="center" style={styles.desc}>
              Enter your email and we&apos;ll send you a link to reset your password.
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
              title={cooldown > 0 ? `Wait ${cooldown}s` : "Send Reset Link"}
              variant="primary"
              fullWidth
              size="lg"
              loading={loading}
              disabled={cooldown > 0}
              onPress={handleSubmit}
              style={styles.btn}
            />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  close: { position: "absolute", top: 56, left: spacing[4], zIndex: 10 },
  body: { flex: 1, paddingHorizontal: spacing[6], justifyContent: "center", alignItems: "center" },
  title: { marginTop: spacing[4] },
  desc: { marginTop: spacing[2], marginBottom: spacing[6], maxWidth: 280 },
  field: { width: "100%", marginBottom: spacing[4] },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: spacing[3], fontSize: fontSize.base, color: colors.foreground, backgroundColor: colors.gray50, width: "100%",
  },
  cooldownText: { marginBottom: spacing[4] },
  btn: { marginTop: spacing[2] },
});
