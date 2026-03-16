import React, { useState } from "react";
import {
  View,
  TextInput,
  Pressable,
  ScrollView,
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
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "@/lib/constants";

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
      Alert.alert("Missing Fields", "Please fill in all fields.");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert("Password Too Short", `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
      Alert.alert("Password Too Long", `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
      return;
    }
    setLoading(true);
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
      });
      router.back();
    } catch (e: any) {
      Alert.alert("Registration Failed", e.message || "Could not create account.");
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
          Create Account
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={styles.sub}>
          Join Wabbus to start shopping
        </AppText>

        <View style={styles.row}>
          <View style={[styles.field, styles.flex]}>
            <AppText variant="label" style={styles.fieldLabel}>First Name</AppText>
            <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="John" placeholderTextColor={colors.mutedLight} autoCapitalize="words" />
          </View>
          <View style={[styles.field, styles.flex]}>
            <AppText variant="label" style={styles.fieldLabel}>Last Name</AppText>
            <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Doe" placeholderTextColor={colors.mutedLight} autoCapitalize="words" />
          </View>
        </View>

        <View style={styles.field}>
          <AppText variant="label" style={styles.fieldLabel}>Email</AppText>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.mutedLight} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        </View>

        <View style={styles.field}>
          <AppText variant="label" style={styles.fieldLabel}>Password</AppText>
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} placeholderTextColor={colors.mutedLight} secureTextEntry autoComplete="new-password" maxLength={MAX_PASSWORD_LENGTH} />
        </View>

        <AppButton
          title="Create Account"
          variant="primary"
          fullWidth
          size="lg"
          loading={loading}
          onPress={handleRegister}
          style={styles.submitBtn}
        />

        <View style={styles.loginRow}>
          <AppText variant="body" color={colors.muted}>Already have an account? </AppText>
          <Pressable onPress={() => router.replace("/(auth)/login")}>
            <AppText variant="body" color={colors.brandOrange} weight="bold">Sign in</AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  close: { position: "absolute", top: 56, left: spacing[4], zIndex: 10 },
  body: { paddingHorizontal: spacing[6], paddingTop: spacing[16], paddingBottom: spacing[10] },
  logoWrap: { alignItems: "center", marginBottom: spacing[6] },
  logo: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.brandOrange, alignItems: "center", justifyContent: "center" },
  sub: { marginTop: spacing[1], marginBottom: spacing[6] },
  row: { flexDirection: "row", gap: spacing[3] },
  flex: { flex: 1 },
  field: { marginBottom: spacing[4] },
  fieldLabel: { marginBottom: spacing[1.5] },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg,
    padding: spacing[3], fontSize: fontSize.base, color: colors.foreground, backgroundColor: colors.gray50,
  },
  submitBtn: { marginTop: spacing[2] },
  loginRow: { flexDirection: "row", justifyContent: "center", marginTop: spacing[6] },
});
