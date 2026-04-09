import React from "react";
import { View, ScrollView, Image, Pressable, StyleSheet, Dimensions } from "react-native";
import Icon from "@/components/ui/Icon";
import { productImageUrl } from "@/lib/image";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

const { width: SCREEN_W } = Dimensions.get("window");

interface ProductImageGalleryProps {
  images: string[];
  inWishlist: boolean;
  onToggleWishlist: () => void;
}

export default function ProductImageGallery({ images, inWishlist, onToggleWishlist }: ProductImageGalleryProps) {
  return (
    <View style={styles.imageCard}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.gallery}>
        {images.filter((u): u is string => typeof u === "string" && u.length > 0).map((uri, i) => (
          <Image key={i} source={{ uri: productImageUrl(uri, "full") }} style={styles.galleryImage} resizeMode="contain" />
        ))}
      </ScrollView>

      {/* Floating Heart Button inside Image Card */}
      <Pressable
         style={styles.floatingWishlistBtn}
         hitSlop={8}
         onPress={onToggleWishlist}
       >
         <Icon name={inWishlist ? "favorite" : "favorite-border"} size={22} color={inWishlist ? colors.brandBlueDark : colors.slate400} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  imageCard: {
    backgroundColor: colors.white,
    marginHorizontal: spacing[4],
    marginTop: 52,
    borderRadius: borderRadius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.slate200,
    ...shadows.sm,
  },
  gallery: { width: "100%", aspectRatio: 1 },
  galleryImage: { width: SCREEN_W - 32, height: SCREEN_W - 32, backgroundColor: colors.slate100 },
  floatingWishlistBtn: {
    position: "absolute",
    top: spacing[3],
    right: spacing[3],
    backgroundColor: colors.slate100, // Soft gray background for the heart
    borderRadius: borderRadius.full,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
