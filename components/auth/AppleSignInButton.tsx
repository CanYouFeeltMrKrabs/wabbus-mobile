import React, { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useTranslation } from "@/hooks/useT";
import { useAuth } from "@/lib/auth";
import AppText from "@/components/ui/AppText";
import { colors, spacing } from "@/lib/theme";

export default function AppleSignInButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const { appleSignIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  if (Platform.OS !== "ios") return null;

  const handleAppleSignIn = async () => {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        setError(t("auth.apple.errorNoToken"));
        return;
      }

      await appleSignIn({
        identityToken: credential.identityToken,
        fullName: credential.fullName
          ? {
              givenName: credential.fullName.givenName ?? undefined,
              familyName: credential.fullName.familyName ?? undefined,
            }
          : undefined,
      });

      router.back();
    } catch (e: unknown) {
      if ((e as any)?.code === "ERR_REQUEST_CANCELED") return;
      setError(e instanceof Error ? e.message : t("auth.apple.errorGeneric"));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <AppText style={styles.dividerText}>{t("auth.apple.or")}</AppText>
        <View style={styles.dividerLine} />
      </View>

      {error && (
        <AppText style={styles.errorText}>{error}</AppText>
      )}

      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={16}
        style={styles.appleButton}
        onPress={handleAppleSignIn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing[4],
    alignItems: "center",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    marginBottom: spacing[4],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.slate200,
  },
  dividerText: {
    marginHorizontal: spacing[4],
    fontSize: 14,
    fontWeight: "500",
    color: colors.slate400,
  },
  appleButton: {
    width: "100%",
    height: 54,
  },
  errorText: {
    fontSize: 14,
    color: "#be123c",
    fontWeight: "500",
    marginBottom: spacing[3],
    textAlign: "center",
  },
});
