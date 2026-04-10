import * as Sentry from "@sentry/react-native";
import { SENTRY_DSN } from "./config";

const ENABLED = !!SENTRY_DSN && !__DEV__;

export function initSentry() {
  if (!ENABLED) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
    attachScreenshot: true,
    enableNativeFramesTracking: true,
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  if (!ENABLED) return;
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export function setUser(id: string | null, email?: string) {
  if (!ENABLED) return;
  if (id) {
    Sentry.setUser({ id, email });
  } else {
    Sentry.setUser(null);
  }
}
