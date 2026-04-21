import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet, Pressable } from "react-native";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import { colors, spacing, borderRadius, shadows } from "@/lib/theme";
import { publicFetch } from "@/lib/api";
import { formatDate } from "@/lib/orderHelpers";

type ReviewUser = { name: string | null };
type ReviewImage = { id: string; key: string };
type PublicReview = {
  id: number;
  rating: number;
  comment: string | null;
  createdAt: string;
  vendorResponse?: string | null;
  vendorRespondedAt?: string | null;
  vendorResponseUpdatedAt?: string | null;
  images?: ReviewImage[];
  customer?: ReviewUser;
};

type ReviewSummary = {
  ratingAvg: number;
  reviewCount: number;
  distribution?: Record<number, number>;
};

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  const r = Math.max(0, Math.min(5, Number(rating || 0)));
  const full = Math.floor(r);
  const half = r - full >= 0.5;

  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((i) => {
        let name: "star" | "star-half" | "star-border" = "star-border";
        let color: string = colors.slate300;
        
        if (i <= full) {
          name = "star";
          color = colors.warning; // amber-400
        } else if (i === full + 1 && half) {
          name = "star-half";
          color = colors.warning;
        }

        return <Icon key={i} name={name} size={size} color={color} />;
      })}
    </View>
  );
}

import { PAGE_SIZE as PAGE_SIZES } from "@/lib/constants";

const PAGE_SIZE = PAGE_SIZES.REVIEWS;

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      publicFetch(`/reviews/by-product-id/${encodeURIComponent(productId)}?limit=${PAGE_SIZE}`),
      publicFetch(`/reviews/by-product-id/${encodeURIComponent(productId)}/summary`),
    ])
      .then(([reviewsData, summaryData]) => {
        setReviews((reviewsData as any).data ?? []);
        setNextCursor((reviewsData as any).nextCursor ?? null);
        setSummary(summaryData as ReviewSummary);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await publicFetch(`/reviews/by-product-id/${encodeURIComponent(productId)}?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`);
      setReviews((prev) => {
        const incoming: PublicReview[] = (res as any).data ?? [];
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...incoming.filter((r) => !seen.has(r.id))];
      });
      setNextCursor((res as any).nextCursor ?? null);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, productId]);

  if (loading) return null;

  const ratingAvg = summary?.ratingAvg ?? 0;
  const reviewCount = summary?.reviewCount ?? reviews.length;
  const distribution = summary?.distribution;

  const dist = [0, 0, 0, 0, 0]; // index 0 = 5-star, index 4 = 1-star
  if (distribution) {
    for (let star = 5; star >= 1; star--) {
      dist[5 - star] = distribution[star] ?? 0;
    }
  } else {
    for (const rv of reviews) {
      const bucket = Math.max(1, Math.min(5, Math.round(rv.rating)));
      dist[5 - bucket]++;
    }
  }

  return (
    <View style={styles.container}>
      <AppText variant="subtitle" weight="bold" style={styles.heading}>
        Customer reviews
      </AppText>

      {reviewCount > 0 ? (
        <View style={styles.summaryBlock}>
          {/* Left: average + stars */}
          <View style={styles.avgBox}>
            <AppText style={styles.avgText}>{ratingAvg.toFixed(1)}</AppText>
            <View style={styles.avgStars}>
              <Stars rating={ratingAvg} size={16} />
              <AppText variant="caption" color={colors.slate500} style={styles.reviewCountText}>
                {reviewCount.toLocaleString()} {reviewCount === 1 ? "review" : "reviews"}
              </AppText>
            </View>
          </View>

          {/* Right: star breakdown bars */}
          <View style={styles.barsContainer}>
            {[5, 4, 3, 2, 1].map((star, i) => {
              const count = dist[i];
              const pct = reviewCount > 0 ? (count / reviewCount) * 100 : 0;
              return (
                <View key={star} style={styles.barRow}>
                  <AppText variant="caption" weight="medium" color={colors.slate600} style={styles.barLabelText}>
                    {star}
                  </AppText>
                  <View style={styles.barStarIcon}>
                    <Icon name="star" size={12} color={colors.warning} />
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${pct}%` }]} />
                  </View>
                  <AppText variant="caption" color={colors.slate400} style={styles.barCountText} align="right">
                    {count}
                  </AppText>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <AppText variant="body" color={colors.slate500} style={styles.emptyText}>
          No reviews to show yet.
        </AppText>
      )}

      {/* Reviews List */}
      {reviews.length > 0 && (
        <View style={styles.listContainer}>
          {reviews.map((rv, idx) => (
            <View key={rv.id != null ? String(rv.id) : `rv-${idx}`} style={styles.reviewCard}>
              <View style={styles.reviewHeader}>
                <View style={styles.reviewMeta}>
                  <View style={styles.reviewStarsRow}>
                    <Stars rating={rv.rating} size={14} />
                    <AppText variant="caption" weight="bold" style={styles.reviewRatingText}>
                      {rv.rating.toFixed(0)} / 5
                    </AppText>
                  </View>
                  <View style={styles.reviewAuthorRow}>
                    <AppText variant="caption" weight="medium" style={styles.reviewAuthorText}>
                      {rv.customer?.name?.trim() ? rv.customer.name.trim() : "Verified buyer"}
                    </AppText>
                    <AppText variant="caption" color={colors.slate300} style={styles.reviewDotText}>
                      •
                    </AppText>
                    <AppText variant="caption" color={colors.slate600}>
                      {formatDate(rv.createdAt)}
                    </AppText>
                  </View>
                </View>

                {/* Top Right Rating Box */}
                <View style={styles.ratingBadge}>
                  <Icon name="star" size={10} color={colors.brandOrange} />
                  <AppText variant="caption" weight="bold" style={styles.ratingBadgeText}>
                    {rv.rating.toFixed(1)}
                  </AppText>
                </View>
              </View>

              {rv.comment?.trim() ? (
                <View style={styles.commentBlock}>
                  <AppText variant="body" color={colors.slate400} style={styles.quoteMark}>
                    “
                  </AppText>
                  <AppText variant="body" color={colors.slate700} style={styles.commentText}>
                    {rv.comment.trim()}
                  </AppText>
                  <AppText variant="body" color={colors.slate400} style={styles.quoteMarkRight}>
                    ”
                  </AppText>
                </View>
              ) : (
                <AppText variant="body" color={colors.slate500} style={styles.emptyCommentText}>
                  No written comment provided.
                </AppText>
              )}

              {/* Vendor Response */}
              {rv.vendorResponse?.trim() ? (
                <View style={styles.vendorResponseBlock}>
                  <View style={styles.vendorResponseHeader}>
                    <AppText variant="caption" weight="bold" color={colors.slate600} style={styles.vendorResponseTitle}>
                      SELLER RESPONSE
                    </AppText>
                    <AppText variant="caption" color={colors.slate500} style={styles.vendorResponseDate}>
                      {rv.vendorResponseUpdatedAt
                        ? `Updated ${formatDate(rv.vendorResponseUpdatedAt)}`
                        : rv.vendorRespondedAt
                        ? `Posted ${formatDate(rv.vendorRespondedAt)}`
                        : ""}
                    </AppText>
                  </View>
                  <AppText variant="body" color={colors.slate700} style={styles.vendorResponseText}>
                    {rv.vendorResponse.trim()}
                  </AppText>
                </View>
              ) : null}
            </View>
          ))}

          {nextCursor && (
            <Pressable onPress={loadMore} disabled={loadingMore} style={styles.loadMoreBtn}>
              <AppText variant="label" weight="bold" color={colors.brandBlue}>
                {loadingMore ? "Loading..." : "Show more reviews"}
              </AppText>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing[6],
  },
  heading: {
    fontSize: 20,
    color: colors.foreground,
    marginBottom: spacing[4],
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  summaryBlock: {
    flexDirection: "column",
    gap: spacing[4],
    marginBottom: spacing[2],
  },
  avgBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  avgText: {
    fontSize: 36,
    fontWeight: "900",
    color: colors.foreground,
  },
  avgStars: {
    flexDirection: "column",
    gap: 2,
  },
  reviewCountText: {
    marginTop: 2,
  },
  barsContainer: {
    flex: 1,
    flexDirection: "column",
    gap: spacing[1],
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  barLabelText: {
    width: 12,
  },
  barStarIcon: {
    marginRight: 2,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.slate100,
    borderRadius: borderRadius.full,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: colors.warning,
    borderRadius: borderRadius.full,
  },
  barCountText: {
    width: 24,
  },
  emptyText: {
    marginTop: spacing[2],
  },
  listContainer: {
    marginTop: spacing[5],
    flexDirection: "column",
    gap: spacing[3],
  },
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius["2xl"],
    padding: spacing[4],
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.12)",
    ...shadows.md,
  },
  reviewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing[4],
  },
  reviewMeta: {
    flex: 1,
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  reviewRatingText: {
    color: colors.foreground,
  },
  reviewAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing[1],
  },
  reviewAuthorText: {
    color: colors.foreground,
  },
  reviewDotText: {
    marginHorizontal: spacing[2],
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[2.5],
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: "rgba(12,78,176,0.18)",
    backgroundColor: colors.white,
  },
  ratingBadgeText: {
    color: colors.foreground,
  },
  commentBlock: {
    marginTop: spacing[3],
    flexDirection: "row",
  },
  quoteMark: {
    marginRight: spacing[1],
  },
  quoteMarkRight: {
    marginLeft: spacing[1],
  },
  commentText: {
    flex: 1,
    lineHeight: 22,
  },
  emptyCommentText: {
    marginTop: spacing[3],
    fontStyle: "italic",
  },
  vendorResponseBlock: {
    marginTop: spacing[4],
    backgroundColor: colors.slate50,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.10)",
  },
  vendorResponseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing[2],
  },
  vendorResponseTitle: {
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  vendorResponseDate: {
    fontSize: 11,
  },
  vendorResponseText: {
    lineHeight: 20,
  },
  loadMoreBtn: {
    marginTop: spacing[2],
    alignSelf: "flex-start",
  },
});
