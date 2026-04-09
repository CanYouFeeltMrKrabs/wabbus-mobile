/**
 * Handles automatic session lifecycle and page view tracking.
 * Mount once near the app root (_layout.tsx).
 *
 *  - customer.session.started  → on first mount
 *  - customer.session.ended    → when app goes to background
 *  - customer.page.viewed      → on every route change
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { usePathname } from "expo-router";
import {
  initCustomerTracker,
  trackCustomerEvent,
  flushCustomerEvents,
} from "@/lib/customerTracker";

export default function CustomerTrackingProvider() {
  const sessionStartRef = useRef<number>(0);
  const pageViewCountRef = useRef(0);
  const lastPathRef = useRef<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    initCustomerTracker();

    sessionStartRef.current = Date.now();

    trackCustomerEvent("customer.session.started", {
      entryPage: pathname ?? "/",
    });

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        trackCustomerEvent("customer.session.ended", {
          exitPage: lastPathRef.current ?? "/",
          pageViewCount: pageViewCountRef.current,
          durationMs: Date.now() - sessionStartRef.current,
        });
        flushCustomerEvents();
      }
      if (state === "active") {
        sessionStartRef.current = Date.now();
        pageViewCountRef.current = 0;
        trackCustomerEvent("customer.session.started", {
          entryPage: lastPathRef.current ?? "/",
        });
      }
    });

    return () => {
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!pathname || pathname === lastPathRef.current) return;
    lastPathRef.current = pathname;

    pageViewCountRef.current++;

    trackCustomerEvent("customer.page.viewed", {
      path: pathname,
    });
  }, [pathname]);

  return null;
}
