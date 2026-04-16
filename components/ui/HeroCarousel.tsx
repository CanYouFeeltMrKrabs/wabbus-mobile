import React from "react";
import { View, Pressable, StyleSheet, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import AppText from "./AppText";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { colors, spacing, borderRadius } from "@/lib/theme";
import { ROUTES } from "@/lib/routes";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function HeroCarousel({ children }: { children?: React.ReactNode }) {
  const router = useRouter();

  // Native gradient simulation to mimic Web's `bg-gradient-to-t from-[#EAEDED] to-transparent`
  // Creates 20 absolute slices stacking up with decreasing opacity.
  const gradientSlices = Array.from({ length: 20 });

  return (
    <View style={styles.heroBlock}>
      {/* Absolute Bottom Backdrop Waves (Render behind everything) */}
      <View style={styles.wavesLayer}>
        {/* Purple wave (left side heavy) */}
        <View style={styles.purpleWave} />
        {/* Yellow wave (right side heavy) */}
        <View style={styles.yellowWave} />
      </View>

      {/* Decorative Floating Elements */}
      <MaterialCommunityIcons name="star-four-points" size={24} color="#FFEA00" style={[styles.animIcon, { top: 40, left: 24 }]} />
      <MaterialCommunityIcons name="star-four-points" size={16} color="#FFEA00" style={[styles.animIcon, { top: 130, left: 8 }]} />
      
      <Ionicons name="flash" size={24} color="#FFEA00" style={[styles.animIcon, { top: 40, right: 40, transform: [{ rotate: "12deg" }] }]} />
      <Ionicons name="flash-outline" size={28} color="#FFEA00" style={[styles.animIcon, { top: 160, right: 8, transform: [{ rotate: "-12deg" }] }]} />

      {/* Hero Header Content */}
      <View style={styles.textContent}>
        <View style={styles.badge}>
          <AppText variant="caption" weight="bold" style={styles.badgeText}>
            BIG SUMMER SALE
          </AppText>
        </View>

        <AppText weight="black" style={styles.headline}>
          SHOP OUR{"\n"}LATEST <AppText weight="black" style={[styles.headline, { color: "#FFEA00" }]}>TRENDS</AppText>
        </AppText>

        <Pressable
          style={styles.ctaButton}
          onPress={() => router.push(ROUTES.searchWithSort("bestselling") as any)}
        >
          <AppText weight="black" color={colors.black} style={{ fontSize: 16, letterSpacing: 0.5 }}>
            SHOP NOW
          </AppText>
          <Ionicons name="arrow-forward" size={24} color={colors.black} style={{ marginLeft: 8 }} />
        </Pressable>
      </View>

      {/* The overlapping White Card (Hovering over the lower waves) */}
      {children && (
        <View style={styles.carouselCardLayer}>
          <View style={styles.carouselCard}>
            {children}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroBlock: {
    width: "100%",
    backgroundColor: "#1a44c2", // Solid blue base
    position: "relative",
    overflow: "hidden", // Ensures nothing escapes this block
  },
  wavesLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  purpleWave: {
    position: "absolute",
    bottom: -650, 
    left: -200,
    width: SCREEN_WIDTH + 400,
    height: 1000,
    borderRadius: 500,
    backgroundColor: "#9d00ff",
    transform: [{ scaleX: 1.5 }, { rotate: "-10deg" }],
  },
  yellowWave: {
    position: "absolute",
    bottom: -720,
    left: -100,
    width: SCREEN_WIDTH + 200,
    height: 1000,
    borderRadius: 500,
    backgroundColor: "#FFEA00",
    transform: [{ scaleX: 1.5 }, { rotate: "8deg" }],
  },
  animIcon: {
    position: "absolute",
    zIndex: 10,
    shadowColor: "rgba(255, 234, 0, 0.4)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  textContent: {
    position: "relative",
    zIndex: 20,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[8],
    alignItems: "center",
  },
  badge: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    marginBottom: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  badgeText: {
    color: colors.white,
    letterSpacing: 2,
    fontSize: 10,
  },
  headline: {
    fontSize: 52, // BUMPED MASSIVELY TO MATCH WEB TIGHT-TRACKING STYLE
    fontWeight: "900",
    color: colors.white,
    lineHeight: 52,
    letterSpacing: -2.5, // EXTREME TIGHT GROUPING
    marginBottom: spacing[8],
    textAlign: "center",
    textShadowColor: "rgba(0, 0, 0, 0.25)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFEA00",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: borderRadius.full,
    // Aggressive intense glow mimicking Web's massive drop-shadow scale
    shadowColor: "rgba(255, 234, 0, 0.9)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 15,
  },
  carouselCardLayer: {
    position: "relative",
    zIndex: 30,
    width: "100%",
    paddingHorizontal: spacing[4],
    marginTop: spacing[8],
    marginBottom: spacing[8], 
  },
  carouselCard: {
    width: "100%",
    backgroundColor: colors.white,
    borderRadius: 20,
    paddingVertical: spacing[4],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 15,
    overflow: "hidden", 
  }
});
