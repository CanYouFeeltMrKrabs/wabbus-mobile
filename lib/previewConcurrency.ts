/**
 * App-level concurrency cap for preview videos.
 *
 * Hard cap = 1 on mobile. Only one preview video plays at any time
 * across the entire app. Carousels pass `enablePreview` to only ONE
 * card — this module is a backstop for the case where multiple
 * carousels are all visible simultaneously.
 *
 * When acquire() pushes count over the cap, the OLDEST acquired slot
 * is evicted: its onEvict callback pauses the video and sets
 * playing=false so the VideoView unmounts.
 *
 * Ported from web's previewConcurrency.ts (MAX=3 on web, MAX=1 on
 * mobile because mobile viewports can't meaningfully show multiple
 * playing preview videos simultaneously).
 */

const MAX_CONCURRENT_PREVIEWS = 3;

type Slot = { id: string; onEvict: () => void };

const slots: Slot[] = [];

/**
 * Acquire (or refresh) a preview slot for `id`.
 *
 * If `id` is already held, the slot is moved to the MRU position and
 * `onEvict` is updated — no eviction fires. Otherwise the slot is
 * appended; if that puts the active count over the cap, the oldest
 * slot's `onEvict` is invoked and its slot removed.
 */
export function acquirePreviewSlot(id: string, onEvict: () => void): void {
  const existing = slots.findIndex((s) => s.id === id);
  if (existing !== -1) {
    slots.splice(existing, 1);
    slots.push({ id, onEvict });
    return;
  }

  slots.push({ id, onEvict });

  while (slots.length > MAX_CONCURRENT_PREVIEWS) {
    const evicted = slots.shift();
    if (!evicted) break;
    try {
      evicted.onEvict();
    } catch {
      // An evicted callback throwing must never break the acquire path
    }
  }
}

/**
 * Release the slot for `id` without firing its `onEvict` callback.
 */
export function releasePreviewSlot(id: string): void {
  const idx = slots.findIndex((s) => s.id === id);
  if (idx !== -1) slots.splice(idx, 1);
}

/** Test-only helper. */
export function _resetPreviewSlotsForTests(): void {
  slots.length = 0;
}
