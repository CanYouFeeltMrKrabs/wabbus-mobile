/**
 * Returns whether the app is currently in the foreground.
 *
 * Used to pause preview videos when the user backgrounds the app.
 * Without this, native players continue downloading and burning battery
 * while the app is offscreen.
 *
 * AppState transitions are reliable on both platforms — iOS fires
 * `inactive` then `background`; Android fires `background` directly.
 * We treat anything other than `active` as paused.
 *
 * Mobile equivalent of the web's `document.visibilityState === "visible"`
 * check inside `ProductPreviewVideo`. See the cross-repo plan §0.3.
 */
import { useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

export function useAppActiveGate(): boolean {
  const [active, setActive] = useState<boolean>(
    () => AppState.currentState === "active",
  );

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      setActive(state === "active");
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);

  return active;
}
