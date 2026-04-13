import React, { useState, useRef, useCallback } from "react";
import { View, FlatList, Image, Pressable, Modal, Text, StyleSheet, Dimensions, StatusBar, ViewToken, TouchableOpacity, Animated } from "react-native";
import Icon from "@/components/ui/Icon";
import { productImageUrl } from "@/lib/image";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const ITEM_W = SCREEN_W - 32; // Exact layout size because of 16px margins on each side

interface ProductImageGalleryProps {
  images: string[];
  inWishlist: boolean;
  onToggleWishlist: () => void;
}

export default function ProductImageGallery({ images, inWishlist, onToggleWishlist }: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const lightboxIndexRef = useRef(0);
  const heartScale = useRef(new Animated.Value(1)).current;

  const flatListRef = useRef<FlatList>(null);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveIndex(viewableItems[0].index);
    }
  }).current;

  const onLightboxViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      lightboxIndexRef.current = viewableItems[0].index;
      setLightboxIndex(viewableItems[0].index);
    }
  }).current;

  const openLightbox = useCallback((index: number) => {
    lightboxIndexRef.current = index;
    setLightboxIndex(index);
    setLightboxVisible(true);
  }, []);

  const closeLightbox = useCallback(() => {
    // Sync the main gallery to show the image the user was viewing
    const idx = lightboxIndexRef.current;
    flatListRef.current?.scrollToIndex({ index: idx, animated: false });
    setActiveIndex(idx);
    setLightboxVisible(false);
  }, []);

  const handleWishlistToggle = useCallback(() => {
    // Spring pop on add
    if (!inWishlist) {
      Animated.sequence([
        Animated.spring(heartScale, { toValue: 1.3, useNativeDriver: true, speed: 50, bounciness: 12 }),
        Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start();
    } else {
      // Quick shrink on remove
      Animated.sequence([
        Animated.timing(heartScale, { toValue: 0.8, duration: 100, useNativeDriver: true }),
        Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }),
      ]).start();
    }
    onToggleWishlist();
  }, [inWishlist, onToggleWishlist, heartScale]);

  const handlePressIn = useCallback(() => {
    Animated.spring(heartScale, { toValue: 0.85, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  }, [heartScale]);

  const handlePressOut = useCallback(() => {
    Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 8 }).start();
  }, [heartScale]);

  const validImages = images.filter((u): u is string => typeof u === "string" && u.length > 0);

  return (
    <View style={styles.wrapper}>
      {/* Image area */}
      <View style={styles.imageCard}>
        <FlatList
          ref={flatListRef}
          data={validImages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, index) => ({ length: ITEM_W, offset: ITEM_W * index, index })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item: uri, index: i }) => (
            <Pressable onPress={() => openLightbox(i)} style={{ width: ITEM_W }}>
              <Image 
                source={{ uri: productImageUrl(uri, "full") }} 
                style={[styles.galleryImage, { width: ITEM_W, height: ITEM_W }]} 
                resizeMode="contain" 
              />
            </Pressable>
          )}
        />

        {/* Floating Heart Button — matches web: blue bg + white heart when active */}
        <Animated.View
          style={[
            styles.floatingWishlistBtn,
            inWishlist && styles.floatingWishlistBtnActive,
            { transform: [{ scale: heartScale }] },
          ]}
        >
          <Pressable
            style={styles.heartPressable}
            hitSlop={8}
            onPress={handleWishlistToggle}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
          >
            <Icon
              name={inWishlist ? "favorite" : "favorite-border"}
              size={22}
              color={inWishlist ? colors.white : colors.slate400}
            />
          </Pressable>
        </Animated.View>
      </View>

      {/* Pagination Dots — floating below image */}
      {validImages.length > 1 && (
        <View style={styles.dotsRow}>
          {validImages.map((_, i) => (
            <View key={i} style={[styles.dot, i === activeIndex && styles.dotActive]} />
          ))}
        </View>
      )}

      {/* ─── Fullscreen Lightbox Modal ─── */}
      {lightboxVisible && (
        <Modal
          visible
          transparent={false}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={closeLightbox}
        >
          <StatusBar barStyle="light-content" />
          <View style={styles.lightboxRoot}>
            {/* Close button — rendered OUTSIDE FlatList, in its own layer */}
            <TouchableOpacity
              style={styles.lightboxClose}
              activeOpacity={0.6}
              onPress={closeLightbox}
            >
              <Icon name="close" size={26} color={colors.white} />
            </TouchableOpacity>

            {/* Swipeable images — each slide has a tap-to-close Pressable */}
            <FlatList
              data={validImages}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => `lb-${i}`}
              initialScrollIndex={lightboxIndexRef.current}
              getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
              onViewableItemsChanged={onLightboxViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              renderItem={({ item: uri }) => (
                <Pressable style={styles.lightboxSlide} onPress={closeLightbox}>
                  <Image
                    source={{ uri: productImageUrl(uri, "full") }}
                    style={styles.lightboxImage}
                    resizeMode="contain"
                  />
                </Pressable>
              )}
            />

            {/* Dots — pointerEvents none so they don't block swipes */}
            {validImages.length > 1 && (
              <View style={styles.lightboxDots} pointerEvents="none">
                {validImages.map((_, i) => (
                  <View key={i} style={[styles.lightboxDot, i === lightboxIndex && styles.lightboxDotActive]} />
                ))}
              </View>
            )}
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing[4],
    marginTop: 52,
  },
  imageCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
  },
  galleryImage: { backgroundColor: colors.slate50 },
  floatingWishlistBtn: {
    position: "absolute",
    top: spacing[3],
    right: spacing[3],
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: borderRadius.full,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.slate200,
    ...shadows.md,
  },
  floatingWishlistBtnActive: {
    backgroundColor: colors.brandBlueDark,
    borderColor: colors.brandBlueDark,
  },
  heartPressable: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: spacing[1.5],
    marginBottom: spacing[1],
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.slate200,
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.brandBlue,
    borderRadius: 4,
  },

  /* ─── Lightbox styles ─── */
  lightboxRoot: {
    flex: 1,
    backgroundColor: "#000",
  },
  lightboxClose: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 100,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: borderRadius.full,
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxSlide: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: "center",
    alignItems: "center",
  },
  lightboxImage: {
    width: SCREEN_W,
    height: SCREEN_W,
  },
  lightboxDots: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  lightboxDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  lightboxDotActive: {
    width: 24,
    backgroundColor: colors.white,
  },
});
