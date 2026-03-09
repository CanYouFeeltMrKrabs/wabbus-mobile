import React, { useEffect, useRef } from "react";
import { View, Pressable, StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { colors, borderRadius, shadows } from "@/lib/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  widthPercent?: number;
};

const OPEN_TIMING = { duration: 280, easing: Easing.out(Easing.cubic) };
const CLOSE_TIMING = { duration: 220, easing: Easing.in(Easing.cubic) };

export default function SlideDrawer({
  visible,
  onClose,
  children,
  widthPercent = 92,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const drawerWidth = (screenWidth * widthPercent) / 100;
  const offset = useSharedValue(screenWidth);

  const cachedChildren = useRef<React.ReactNode>(null);
  if (visible) cachedChildren.current = children;

  useEffect(() => {
    offset.value = withTiming(
      visible ? 0 : screenWidth,
      visible ? OPEN_TIMING : CLOSE_TIMING,
    );
  }, [visible, screenWidth]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, screenWidth], [0.45, 0]),
  }));

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const pan = Gesture.Pan()
    .activeOffsetX(25)
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      if (e.translationX > 0) {
        offset.value = e.translationX;
      }
    })
    .onEnd((e) => {
      if (e.translationX > drawerWidth * 0.3 || e.velocityX > 500) {
        offset.value = withTiming(screenWidth, CLOSE_TIMING);
        runOnJS(onClose)();
      } else {
        offset.value = withTiming(0, { duration: 200 });
      }
    });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.drawer, { width: drawerWidth }, drawerStyle]}>
          {cachedChildren.current ?? children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.black,
  },
  drawer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius["2xl"],
    borderBottomLeftRadius: borderRadius["2xl"],
    ...shadows.lg,
    overflow: "hidden",
  },
});
