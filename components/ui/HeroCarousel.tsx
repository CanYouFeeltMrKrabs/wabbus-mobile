import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { useRouter } from "expo-router";
import AppText from "./AppText";
import Icon from "./Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CAROUSEL_WIDTH = SCREEN_WIDTH - spacing[4] * 2;
const AUTO_PLAY_MS = 5000;

interface Slide {
  key: string;
  bg: string;
  decorColor: string;
  badge: string;
  badgeBg: string;
  headlineParts: Array<{ text: string; highlight?: boolean }>;
  sub: string;
  ctaLabel: string;
  ctaRoute: string;
  ctaBg: string;
  icon: string;
}

const slides: Slide[] = [
  {
    key: "blue",
    bg: colors.heroBlue,
    decorColor: colors.heroBlueDecor,
    badge: "BIG SUMMER SALE",
    badgeBg: colors.brandOrange,
    headlineParts: [
      { text: "UP TO " },
      { text: "70% OFF", highlight: true },
      { text: "\nEVERYTHING." },
    ],
    sub: "Transform your living space with our premium household collection at unbeatable prices.",
    ctaLabel: "SHOP NOW",
    ctaRoute: "/category/everyday-household",
    ctaBg: colors.brandOrange,
    icon: "home",
  },
  {
    key: "purple",
    bg: colors.heroPurple,
    decorColor: colors.heroPurpleDecor,
    badge: "NEW ARRIVALS",
    badgeBg: colors.heroPink,
    headlineParts: [
      { text: "FRESH " },
      { text: "STYLES", highlight: true },
      { text: "\nJUST DROPPED." },
    ],
    sub: "Be the first to explore our latest additions — handpicked for your home.",
    ctaLabel: "EXPLORE NOW",
    ctaRoute: "/category/everyday-household",
    ctaBg: colors.heroPink,
    icon: "local-fire-department",
  },
  {
    key: "yellow",
    bg: colors.heroYellow,
    decorColor: colors.heroYellowDecor,
    badge: "FLASH DEALS",
    badgeBg: colors.heroSlate,
    headlineParts: [
      { text: "DEALS " },
      { text: "END SOON", highlight: true },
      { text: "\nACT FAST!" },
    ],
    sub: "Limited-time offers on your favourite houseware. Don't miss out!",
    ctaLabel: "GRAB DEALS",
    ctaRoute: "/category/everyday-household",
    ctaBg: colors.heroSlate,
    icon: "bolt",
  },
];

export default function HeroCarousel() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const animateTo = useCallback(
    (next: number) => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setCurrent(next);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    },
    [fadeAnim],
  );

  const goNext = useCallback(() => {
    animateTo((current + 1) % slides.length);
  }, [current, animateTo]);

  const goPrev = useCallback(() => {
    animateTo((current - 1 + slides.length) % slides.length);
  }, [current, animateTo]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCurrent((prev) => {
        const next = (prev + 1) % slides.length;
        Animated.sequence([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
        return next;
      });
    }, AUTO_PLAY_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fadeAnim]);

  const slide = slides[current];

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.container,
          { backgroundColor: slide.bg, opacity: fadeAnim },
        ]}
      >
        {/* Decorative circle */}
        <View
          style={[styles.decorCircle, { backgroundColor: slide.decorColor }]}
        />

        {/* Decorative icon */}
        <View style={styles.decorIcon}>
          <Icon name={slide.icon as any} size={120} color={colors.overlayWhite12} />
        </View>

        {/* Badge */}
        <View style={[styles.badge, { backgroundColor: slide.badgeBg }]}>
          <AppText variant="caption" color={colors.white} weight="bold">
            {slide.badge}
          </AppText>
        </View>

        {/* Headline */}
        <AppText style={styles.headline}>
          {slide.headlineParts.map((part, i) => (
            <AppText
              key={i}
              style={[
                styles.headlineText,
                part.highlight && { color: slide.badgeBg === colors.brandOrange ? colors.brandOrange : slide.badgeBg },
              ]}
            >
              {part.text}
            </AppText>
          ))}
        </AppText>

        {/* Sub */}
        <AppText
          variant="bodySmall"
          color={colors.overlayWhite90}
          style={styles.sub}
        >
          {slide.sub}
        </AppText>

        {/* CTA */}
        <Pressable
          style={[styles.cta, { backgroundColor: slide.ctaBg }]}
          onPress={() => router.push(slide.ctaRoute as any)}
        >
          <AppText variant="button" color={colors.white}>
            {slide.ctaLabel}
          </AppText>
          <Icon name="arrow-forward" size={16} color={colors.white} />
        </Pressable>

        {/* Prev / Next arrows */}
        <View style={styles.arrowRow}>
          <Pressable style={styles.arrow} onPress={goPrev} hitSlop={12}>
            <Icon name="chevron-left" size={18} color={colors.white} />
          </Pressable>
          <Pressable style={styles.arrow} onPress={goNext} hitSlop={12}>
            <Icon name="chevron-right" size={18} color={colors.white} />
          </Pressable>
        </View>

        {/* Dot indicators */}
        <View style={styles.dotsRow}>
          {slides.map((s, i) => (
            <Pressable
              key={s.key}
              onPress={() => animateTo(i)}
              hitSlop={6}
            >
              <View
                style={[
                  styles.dot,
                  i === current ? styles.dotActive : styles.dotInactive,
                ]}
              />
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
  },
  container: {
    borderRadius: borderRadius["3xl"],
    padding: spacing[5],
    paddingTop: spacing[6],
    overflow: "hidden",
    height: 195,
  },
  decorCircle: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
  },
  decorIcon: {
    position: "absolute",
    right: 10,
    bottom: 30,
    opacity: 1,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: borderRadius.full,
    marginBottom: spacing[3],
  },
  headline: {
    marginBottom: spacing[2],
  },
  headlineText: {
    fontSize: 28,
    fontWeight: "800",
    fontStyle: "italic",
    color: colors.white,
    textTransform: "uppercase",
    lineHeight: 32,
  },
  sub: {
    maxWidth: 220,
    marginBottom: spacing[5],
    lineHeight: 18,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: borderRadius.xl,
    alignSelf: "flex-start",
    ...shadows.lg,
  },
  arrowRow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing[2],
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.overlayBlack20,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing[4],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: colors.white,
    transform: [{ scale: 1.25 }],
  },
  dotInactive: {
    backgroundColor: colors.overlayWhite40,
  },
});
