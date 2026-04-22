/**
 * ProductVideoPlayer — full-screen modal mirroring web's `VideoPopover`.
 *
 *   - Top tabs: Videos / Images
 *   - Videos tab: large player + sidebar of all videos for this product
 *   - Images tab: large image + thumbnail grid
 *   - Tapping a sidebar entry switches the active video (full
 *     unmount/remount of the player via `key` prop, same pattern as web)
 *
 * Player has native controls enabled and is NOT muted — this is the
 * canonical "watch the video with sound" experience, distinct from the
 * silent card preview surface.
 *
 * IMPORTANT — visibility/mount discipline:
 *
 *   React Native's <Modal> does NOT unmount its children when
 *   `visible=false`; it only hides the native modal view. If we always
 *   rendered the player tree inside the Modal, every PDP open for a
 *   product with videos would silently start buffering and playing the
 *   first video in an offscreen modal, draining bandwidth/battery until
 *   the user navigated away.
 *
 *   To keep the offscreen-bandwidth contract, the entire player content
 *   tree (tabs, VideosTab → ActiveVideoPlayer with `useVideoPlayer`,
 *   ImagesTab) is gated behind `visible`. The Modal wrapper stays
 *   reactive to `visible` so its enter animation still plays cleanly.
 *   When the user taps close, `visible` flips to false and the inner
 *   content unmounts immediately — the brief fade-out plays over an
 *   empty black background, which is the correct teardown order
 *   (player released BEFORE the modal frame finishes hiding).
 */
import React, { useState } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  Image,
  Dimensions,
  StatusBar,
} from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { useTranslation } from "@/hooks/useT";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { productImageUrl } from "@/lib/image";

export type VideoEntry = {
  mp4Url: string;
  thumbnailUrl?: string;
  duration?: number;
  width?: number;
  height?: number;
};

type Tab = "videos" | "images";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

function formatDuration(seconds?: number): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  videos: VideoEntry[];
  imageUrls: string[];
  initialVideoIndex?: number;
  initialImageIndex?: number;
  initialTab?: Tab;
  productTitle: string;
  vendorName?: string | null;
  visible: boolean;
  onClose: () => void;
};

export default function ProductVideoPlayer({
  videos,
  imageUrls,
  initialVideoIndex = 0,
  initialImageIndex = 0,
  initialTab = "videos",
  productTitle,
  vendorName,
  visible,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [activeVideoIdx, setActiveVideoIdx] = useState(initialVideoIndex);
  const [activeImageIdx, setActiveImageIdx] = useState(initialImageIndex);

  const activeVideo = videos[activeVideoIdx] ?? videos[0];

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Hard gate: never mount the player tree (or any heavyweight
          children) while the modal is hidden. RN <Modal> keeps its
          children mounted across `visible` toggles, so omitting this
          gate would have the player buffering/playing in an invisible
          modal as soon as the PDP loaded. See the file-level note. */}
      {visible ? (
        <>
          <StatusBar barStyle="dark-content" />
          <View style={styles.root}>
            <View style={styles.header}>
              <View style={styles.tabs}>
                <Pressable
                  onPress={() => setActiveTab("videos")}
                  style={styles.tabBtn}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeTab === "videos" }}
                >
                  <AppText
                    weight="bold"
                    style={[
                      styles.tabLabel,
                      activeTab === "videos" && styles.tabLabelActive,
                    ]}
                  >
                    {t("product.gallery.videosTab")}
                  </AppText>
                  {activeTab === "videos" && (
                    <View style={styles.tabUnderline} />
                  )}
                </Pressable>
                <Pressable
                  onPress={() => setActiveTab("images")}
                  style={styles.tabBtn}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activeTab === "images" }}
                >
                  <AppText
                    weight="bold"
                    style={[
                      styles.tabLabel,
                      activeTab === "images" && styles.tabLabelActive,
                    ]}
                  >
                    {t("product.gallery.imagesTab")}
                  </AppText>
                  {activeTab === "images" && (
                    <View style={styles.tabUnderline} />
                  )}
                </Pressable>
              </View>
              <Pressable
                onPress={onClose}
                style={styles.closeBtn}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("product.gallery.closeVideo")}
              >
                <Icon name="close" size={26} color={colors.slate500} />
              </Pressable>
            </View>

            {activeTab === "videos" && activeVideo ? (
              <VideosTab
                videos={videos}
                activeVideoIdx={activeVideoIdx}
                activeVideo={activeVideo}
                productTitle={productTitle}
                vendorName={vendorName}
                onSwitchVideo={setActiveVideoIdx}
              />
            ) : (
              <ImagesTab
                imageUrls={imageUrls}
                activeImageIdx={activeImageIdx}
                onSelectImage={setActiveImageIdx}
                productTitle={productTitle}
              />
            )}
          </View>
        </>
      ) : null}
    </Modal>
  );
}

/* ── Videos Tab ─────────────────────────────────────────────── */

function VideosTab({
  videos,
  activeVideoIdx,
  activeVideo,
  productTitle,
  vendorName,
  onSwitchVideo,
}: {
  videos: VideoEntry[];
  activeVideoIdx: number;
  activeVideo: VideoEntry;
  productTitle: string;
  vendorName?: string | null;
  onSwitchVideo: (idx: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.body}>
      {/* key={activeVideo.mp4Url} forces a full unmount/remount of the
          player when the user switches videos in the sidebar. Reusing
          the same player instance with a swapped source is unreliable
          for autoplay on Android — this is the same pattern web uses. */}
      <ActiveVideoPlayer key={activeVideo.mp4Url} mp4Url={activeVideo.mp4Url} />
      <ScrollView style={styles.sidebar}>
        <AppText variant="caption" weight="bold" style={styles.sidebarHeader}>
          {t("product.gallery.videosForProduct")}
        </AppText>
        {videos.map((vid, i) => {
          const dur = formatDuration(vid.duration);
          return (
            <Pressable
              key={vid.mp4Url}
              onPress={() => onSwitchVideo(i)}
              style={[
                styles.sidebarEntry,
                i === activeVideoIdx && styles.sidebarEntryActive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("product.gallery.playVideo")}
            >
              <View style={styles.sidebarThumb}>
                {vid.thumbnailUrl ? (
                  <Image
                    source={{ uri: vid.thumbnailUrl }}
                    style={styles.sidebarThumbImg}
                  />
                ) : (
                  <View style={styles.sidebarThumbPlaceholder} />
                )}
                <View style={styles.sidebarPlayBadge}>
                  <Icon name="play-arrow" size={20} color={colors.white} />
                </View>
                {dur && (
                  <View style={styles.sidebarDuration}>
                    <AppText style={styles.sidebarDurationText}>{dur}</AppText>
                  </View>
                )}
              </View>
              <View style={styles.sidebarLabel}>
                <AppText variant="label" numberOfLines={2} color={colors.slate900}>
                  {productTitle}
                </AppText>
                {vendorName && (
                  <AppText
                    variant="caption"
                    numberOfLines={1}
                    style={styles.sidebarSublabel}
                  >
                    {vendorName}
                  </AppText>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ── Active Video Player ───────────────────────────────────── */

function ActiveVideoPlayer({ mp4Url }: { mp4Url: string }) {
  const player = useVideoPlayer(mp4Url, (p) => {
    p.muted = false;
    p.loop = false;
    p.play();
  });
  return (
    <View style={styles.playerFrame}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls
      />
    </View>
  );
}

/* ── Images Tab ─────────────────────────────────────────────── */

function ImagesTab({
  imageUrls,
  activeImageIdx,
  onSelectImage,
  productTitle,
}: {
  imageUrls: string[];
  activeImageIdx: number;
  onSelectImage: (idx: number) => void;
  productTitle: string;
}) {
  const { t } = useTranslation();
  const activeUrl = imageUrls[activeImageIdx] ?? imageUrls[0];

  if (!activeUrl) {
    return (
      <View style={styles.body}>
        <AppText style={styles.noImagesLabel}>
          {t("product.gallery.noImages")}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <View style={styles.imageFrame}>
        <Image
          source={{ uri: productImageUrl(activeUrl, "full") }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          accessibilityLabel={productTitle}
        />
      </View>
      {imageUrls.length > 1 && (
        <ScrollView style={styles.sidebar}>
          <View style={styles.imageGrid}>
            {imageUrls.map((url, i) => (
              <Pressable
                key={`${url}-${i}`}
                onPress={() => onSelectImage(i)}
                style={[
                  styles.imageGridCell,
                  i === activeImageIdx && styles.imageGridCellActive,
                ]}
                accessibilityRole="button"
              >
                <Image
                  source={{ uri: productImageUrl(url, "thumb") }}
                  style={styles.imageGridImg}
                  resizeMode="contain"
                />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 50,
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[2],
  },
  tabs: { flexDirection: "row", gap: spacing[4] },
  tabBtn: { paddingVertical: spacing[2] },
  tabLabel: {
    color: colors.slate500,
    textTransform: "uppercase",
    fontSize: 13,
    letterSpacing: 1,
  },
  tabLabelActive: { color: colors.brandBlue },
  tabUnderline: {
    height: 2,
    backgroundColor: colors.brandBlue,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate100,
  },
  body: { flex: 1 },
  playerFrame: {
    width: SCREEN_W,
    height: Math.min((SCREEN_W * 16) / 9, SCREEN_H * 0.55),
    backgroundColor: "#000",
  },
  imageFrame: {
    width: SCREEN_W,
    height: SCREEN_W,
    backgroundColor: colors.slate50,
  },
  sidebar: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing[3],
    paddingTop: spacing[3],
  },
  sidebarHeader: {
    color: colors.slate900,
    marginBottom: spacing[2],
    textTransform: "uppercase",
  },
  sidebarEntry: {
    flexDirection: "row",
    gap: spacing[2],
    padding: spacing[1.5],
    borderRadius: borderRadius.lg,
    marginBottom: spacing[1.5],
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: colors.white,
  },
  sidebarEntryActive: {
    backgroundColor: "#eff6ff",
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  sidebarThumb: {
    width: 110,
    aspectRatio: 16 / 9,
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    position: "relative",
  },
  sidebarThumbImg: { width: "100%", height: "100%" },
  sidebarThumbPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.slate100,
  },
  sidebarPlayBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  sidebarDuration: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sidebarDurationText: { color: colors.white, fontSize: 10 },
  sidebarLabel: { flex: 1, paddingVertical: 2 },
  sidebarSublabel: { color: colors.slate500, marginTop: 2 },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    paddingBottom: spacing[6],
  },
  imageGridCell: {
    width: (SCREEN_W - spacing[3] * 2 - spacing[2] * 2) / 3,
    aspectRatio: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "transparent",
  },
  imageGridCellActive: { borderColor: colors.brandBlue },
  imageGridImg: { width: "100%", height: "100%" },
  noImagesLabel: {
    color: colors.slate500,
    textAlign: "center",
    marginTop: 100,
  },
});
