import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import i18n from "@/i18n";
import { captureException } from "@/lib/sentry";
import AppText from "./AppText";
import AppButton from "./AppButton";
import Icon from "./Icon";
import { colors, spacing, borderRadius } from "@/lib/theme";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, { componentStack: info.componentStack ?? undefined });
    if (__DEV__) {
      console.error("ErrorBoundary caught:", error, info.componentStack);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.iconWrap}>
              <Icon name="error-outline" size={56} color={colors.brandOrange} />
            </View>
            <AppText variant="title" align="center" style={styles.heading}>
              {i18n.t("common.somethingWentWrong")}
            </AppText>
            <AppText variant="body" color={colors.muted} align="center" style={styles.message}>
              {i18n.t("common.unexpectedError")}
            </AppText>
            {__DEV__ && this.state.error && (
              <View style={styles.debugBox}>
                <AppText variant="caption" color={colors.error}>
                  {this.state.error.message}
                </AppText>
              </View>
            )}
            <AppButton
              title={i18n.t("common.tryAgain")}
              variant="primary"
              onPress={this.handleRetry}
              style={styles.retryBtn}
            />
          </ScrollView>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.warningLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[5],
  },
  heading: {
    marginBottom: spacing[2],
  },
  message: {
    marginBottom: spacing[6],
    maxWidth: 280,
  },
  debugBox: {
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
    maxWidth: "100%" as any,
  },
  retryBtn: {
    minWidth: 160,
  },
});
