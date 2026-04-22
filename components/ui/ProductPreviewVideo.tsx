/**
 * ProductPreviewVideo — silent autoplay overlay for product cards.
 *
 * The parent (carousel/grid) controls which card gets `enabled=true`.
 * This component acquires a global concurrency slot, starts playback,
 * and only renders the VideoView once the video is actually playing.
 * When paused/evicted, the VideoView unmounts and the product image
 * shows through — unlike web where a paused <video> is transparent,
 * expo-video's VideoView shows the frozen frame which covers the image.
 *
 * expo-video's useVideoPlayer fires statusChange events on the player
 * object independent of whether VideoView is mounted, so we can safely
 * gate VideoView rendering on playing state without missing events.
 */
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import {
  acquirePreviewSlot,
  releasePreviewSlot,
} from "@/lib/previewConcurrency";

type Props = {
  mp4Url: string;
  enabled: boolean;
};

export default function ProductPreviewVideo({ mp4Url, enabled }: Props) {
  const slotId = useId();
  const [errored, setErrored] = useState(false);
  const [playing, setPlaying] = useState(false);
  const holdingSlotRef = useRef(false);

  // Reset errored when the URL itself changes (rare card recycle case).
  const [prevUrl, setPrevUrl] = useState(mp4Url);
  if (prevUrl !== mp4Url) {
    setPrevUrl(mp4Url);
    setErrored(false);
    setPlaying(false);
  }

  const player = useVideoPlayer(
    enabled && !errored ? mp4Url : null,
    (p) => {
      p.muted = true;
      p.loop = true;
      p.staysActiveInBackground = false;
    },
  );

  const handleError = useCallback(() => {
    setErrored(true);
    setPlaying(false);
    holdingSlotRef.current = false;
    releasePreviewSlot(slotId);
    if (__DEV__) {
      console.warn(
        `[ProductPreviewVideo] playback failed for ${mp4Url} — falling back to static image`,
      );
    }
  }, [slotId, mp4Url]);

  useEffect(() => {
    if (!enabled || errored) {
      // Disabled or errored — ensure we're fully torn down
      holdingSlotRef.current = false;
      setPlaying(false);
      try { player.pause(); } catch { /* no-op */ }
      releasePreviewSlot(slotId);
      return;
    }

    holdingSlotRef.current = true;

    const evict = () => {
      holdingSlotRef.current = false;
      setPlaying(false);
      try { player.pause(); } catch { /* no-op */ }
    };

    acquirePreviewSlot(slotId, evict);

    // Cache hit — player may already be ready
    if (holdingSlotRef.current && player.status === "readyToPlay") {
      try {
        player.play();
        setPlaying(true);
      } catch {
        handleError();
      }
    }

    const sub = player.addListener("statusChange", ({ status, error }) => {
      if (status === "error" || error) {
        handleError();
        return;
      }
      if (status === "readyToPlay" && holdingSlotRef.current) {
        try {
          player.play();
          setPlaying(true);
        } catch {
          handleError();
        }
      }
    });

    return () => {
      holdingSlotRef.current = false;
      setPlaying(false);
      try { sub.remove(); } catch { /* no-op */ }
      try { player.pause(); } catch { /* no-op */ }
      releasePreviewSlot(slotId);
    };
  }, [enabled, errored, slotId, player, handleError]);

  // Gate: only render VideoView when actively playing.
  // expo-video shows frozen frames when paused (unlike web <video>),
  // so we must unmount VideoView to let the product image show through.
  if (!enabled || errored || !playing) return null;

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      fullscreenOptions={{ enable: false }}
      allowsPictureInPicture={false}
      pointerEvents="none"
    />
  );
}
