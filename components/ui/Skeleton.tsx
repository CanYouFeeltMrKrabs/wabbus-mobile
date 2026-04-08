/**
 * Skeleton — shimmer placeholder primitives for loading states.
 *
 * Usage:
 *   <Skeleton width={120} height={16} />
 *   <Skeleton width="100%" height={200} borderRadius={12} />
 *   <SkeletonCard />
 *   <SkeletonGrid count={6} />
 *   <SkeletonSlider count={4} />
 *   <SkeletonOrderCard />
 *   <SkeletonProductDetail />
 */
import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, Dimensions } from "react-native";
import { colors, spacing, borderRadius as br } from "@/lib/theme";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type SkeletonProps = {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
};

export default function Skeleton({
  width,
  height,
  borderRadius = br.md,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.gray200, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonCard() {
  return (
    <View style={cardStyles.card}>
      <Skeleton width="100%" height={120} borderRadius={0} />
      <View style={cardStyles.info}>
        <Skeleton width="100%" height={12} />
        <Skeleton width="70%" height={12} style={{ marginTop: spacing[1.5] }} />
        <Skeleton width={60} height={10} style={{ marginTop: spacing[2] }} />
        <View style={cardStyles.priceRow}>
          <Skeleton width={50} height={14} />
          <Skeleton width={32} height={32} borderRadius={br.lg} />
        </View>
      </View>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: br.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.gray100,
  },
  info: {
    padding: spacing[2],
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: spacing[2],
  },
});

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  const rows = Math.ceil(count / 2);
  return (
    <View style={gridStyles.grid}>
      {Array.from({ length: rows }).map((_, ri) => (
        <View key={ri} style={gridStyles.row}>
          <View style={gridStyles.cell}>
            <SkeletonCard />
          </View>
          {ri * 2 + 1 < count ? (
            <View style={gridStyles.cell}>
              <SkeletonCard />
            </View>
          ) : (
            <View style={gridStyles.cell} />
          )}
        </View>
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  grid: { gap: spacing[3] },
  row: { flexDirection: "row", gap: spacing[3] },
  cell: { flex: 1 },
});

export function SkeletonSlider({ count = 4 }: { count?: number }) {
  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.header}>
        <Skeleton width={4} height={20} borderRadius={br.full} />
        <Skeleton width={140} height={16} />
      </View>
      <View style={sliderStyles.row}>
        {Array.from({ length: count }).map((_, i) => (
          <View key={i} style={sliderStyles.card}>
            <SkeletonCard />
          </View>
        ))}
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: { marginVertical: spacing[4] },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[4],
    paddingHorizontal: spacing[4],
  },
  row: {
    flexDirection: "row",
    paddingHorizontal: spacing[4],
    gap: spacing[3],
  },
  card: { width: 160 },
});

export function SkeletonOrderCard() {
  return (
    <View style={orderStyles.card}>
      <View style={orderStyles.header}>
        <Skeleton width={80} height={12} />
        <Skeleton width={60} height={20} borderRadius={br.full} />
      </View>
      <View style={orderStyles.row}>
        <Skeleton width={56} height={56} borderRadius={br.md} />
        <View style={{ flex: 1, marginLeft: spacing[3] }}>
          <Skeleton width="80%" height={12} />
          <Skeleton width="50%" height={12} style={{ marginTop: spacing[1.5] }} />
          <Skeleton width={60} height={14} style={{ marginTop: spacing[1.5] }} />
        </View>
      </View>
    </View>
  );
}

const orderStyles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: br.xl,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: colors.gray100,
    marginBottom: spacing[3],
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
});

export function SkeletonProductDetail() {
  return (
    <View style={pdpStyles.container}>
      <Skeleton width="100%" height={SCREEN_WIDTH} borderRadius={0} />
      <View style={pdpStyles.body}>
        <Skeleton width="90%" height={20} />
        <Skeleton width="40%" height={14} style={{ marginTop: spacing[2] }} />
        <Skeleton width={100} height={12} style={{ marginTop: spacing[3] }} />
        <View style={pdpStyles.priceRow}>
          <Skeleton width={80} height={28} />
          <Skeleton width={60} height={12} />
        </View>
        <View style={pdpStyles.divider} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="100%" height={14} style={{ marginTop: spacing[1.5] }} />
        <Skeleton width="70%" height={14} style={{ marginTop: spacing[1.5] }} />
        <View style={pdpStyles.divider} />
        <Skeleton width="60%" height={16} />
        <Skeleton width="100%" height={48} borderRadius={br.xl} style={{ marginTop: spacing[3] }} />
      </View>
    </View>
  );
}

const pdpStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    padding: spacing[4],
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[3],
    marginTop: spacing[4],
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray100,
    marginVertical: spacing[4],
  },
});
