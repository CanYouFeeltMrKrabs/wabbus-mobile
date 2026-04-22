/**
 * usePreviewEnvironmentGate — hook wrapper around the async
 * `isPreviewEnvironmentPermitted()` check.
 *
 * Components need a synchronous boolean to feed into preview-video
 * `enabled` calculations, but the underlying check is async (it queries
 * AccessibilityInfo + NetInfo). This hook resolves once on mount, caches
 * the result globally inside `previewEnvironment`, and re-renders when
 * the answer is known.
 *
 *   - Initial render: `null` (treat as "don't autoplay yet")
 *   - After resolve: `true` (autoplay permitted) or `false` (suppress)
 *
 * Strict consumers compare with `=== true` so the indeterminate window
 * stays safe (no flicker of an autoplaying card before the gate decides).
 */
import { useEffect, useState } from "react";
import { isPreviewEnvironmentPermitted } from "@/lib/previewEnvironment";

export function usePreviewEnvironmentGate(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isPreviewEnvironmentPermitted()
      .then((ok) => {
        if (!cancelled) setAllowed(ok);
      })
      .catch(() => {
        // Permissive fail — same posture as the underlying check itself.
        if (!cancelled) setAllowed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return allowed;
}
