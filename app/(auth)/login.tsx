import React, { useState } from "react";
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import Icon from "@/components/ui/Icon";
import { useAuth } from "@/lib/auth";
import { colors, spacing, borderRadius, fontSize } from "@/lib/theme";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.back();
    } catch (e: any) {
      Alert.alert("Login Failed", e.message || "Invalid email or password.");
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
          Welcome Back
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={styles.sub}>
          Sign in to your Wabbus account
        </AppText>

        {/* Email */}
        <View style={styles.field}>
          <AppText variant="label" style={styles.fieldLabel}>
            Email
          </AppText>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
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
            Password
          </AppText>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="Enter your password"
              placeholderTextColor={colors.mutedLight}
              secureTextEntry={!showPassword}
              autoComplete="password"
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

        <Pressable onPress={() => router.push("/(auth)/forgot-password")} style={styles.forgotWrap}>
          <AppText variant="label" color={colors.brandBlue}>
            Forgot password?
          </AppText>
        </Pressable>

        <AppButton
          title="Sign In"
          variant="primary"
          fullWidth
          size="lg"
          loading={loading}
          onPress={handleLogin}
          style={styles.submitBtn}
        />

        <View style={styles.registerRow}>
          <AppText variant="body" color={colors.muted}>
            Don&apos;t have an account?{" "}
          </AppText>
          <Pressable onPress={() => router.replace("/(auth)/register")}>
            <AppText variant="body" color={colors.brandOrange} weight="bold">
              Create one
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
