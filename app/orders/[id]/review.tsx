import React, { useMemo, useState } from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { FALLBACK_IMAGE } from "@/lib/config";
import { invalidate, useOrderDetail, useMyProductReviews } from "@/lib/queries";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import type { OrderItem, ReviewImageUpload } from "@/lib/types";

const MAX_IMAGES = 5;
const MAX_COMMENT = 400;

type ReviewableItem = OrderItem & { productId?: string };

export default function ReviewScreen() {
  return (
    <RequireAuth>
      <ReviewContent />
    </RequireAuth>
  );
}

function ReviewContent() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Sealed-layer migration (plan §3.2 — orders.detail caller).
  // Hand-rolled useQuery + envelope unwrap replaced with the canonical hook.
  // The reviews-mine query below stays on legacy until that domain migrates.
  const { data: order, isLoading: loading } = useOrderDetail(id);

  const productIds = useMemo(
    () =>
      (order?.items || [])
        .map((i: any) => i.productId || i.publicProductId)
        .filter(Boolean)
        .join(","),
    [order],
  );

  const { data: reviewsFromServer } = useMyProductReviews(productIds);

  const [localReviewed, setLocalReviewed] = useState<Set<string>>(new Set());

  const alreadyReviewed = useMemo(() => {
    const fromServer = new Set(
      (reviewsFromServer || []).map((r: any) => r.productId || r.publicProductId),
    );
    for (const pid of localReviewed) fromServer.add(pid);
    return fromServer;
  }, [reviewsFromServer, localReviewed]);

  const [selectedItem, setSelectedItem] = useState<ReviewableItem | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const reviewableItems = (order?.items || []).filter(
    (item: any) => {
      const pid = item.productId || item.publicProductId;
      return pid && !alreadyReviewed.has(pid);
    },
  );

  const pickImages = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert(t("accountOrders.review.limitReachedTitle"), t("accountOrders.review.limitReachedBody", { max: MAX_IMAGES }));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.8,
    });

    if (!result.canceled) {
      setImages((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES));
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      const filename = uri.split("/").pop() || "photo.jpg";
      const mimeType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

      const presign = await customerFetch<ReviewImageUpload>("/uploads/review-image", {
        method: "POST",
        body: JSON.stringify({ mimeType, fileSize: 0, originalFilename: filename }),
      });

      const blob = await fetch(uri).then((r) => r.blob());
      await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: blob,
      });

      await customerFetch("/uploads/review-image/confirm", {
        method: "POST",
        body: JSON.stringify({ reviewImageId: presign.reviewImageId }),
      });

      for (let attempt = 0; attempt < 10; attempt++) {
        const status = await customerFetch<{ status: string }>(
          `/uploads/review-image/status?id=${presign.reviewImageId}`,
        );
        if (status.status === "APPROVED") return presign.reviewImageId;
        if (status.status === "REJECTED") return null;
        await new Promise((r) => setTimeout(r, 1500));
      }

      return presign.reviewImageId;
    } catch {
      return null;
    }
  };

  const handleSubmit = async () => {
    if (!selectedItem || rating === 0) return;

    const productId = (selectedItem as any).productId || (selectedItem as any).publicProductId;
    if (!productId) return;

    setSubmitting(true);
    try {
      const reviewImageIds: string[] = [];
      for (const uri of images) {
        const imgId = await uploadImage(uri);
        if (imgId) reviewImageIds.push(imgId);
      }

      await customerFetch(`/reviews/by-product-id/${productId}`, {
        method: "POST",
        body: JSON.stringify({
          rating,
          comment: comment.trim() || undefined,
          reviewImageIds: reviewImageIds.length > 0 ? reviewImageIds : undefined,
        }),
      });

      void invalidate.orders.detail(id!);
      void invalidate.products.detail(productId);
      setDone(true);
      setLocalReviewed((prev) => new Set([...prev, productId]));
    } catch (e: any) {
      if (e.status === 409) {
        Alert.alert(t("accountOrders.review.alreadyReviewedTitle"), t("accountOrders.review.alreadyReviewedBody"));
        setLocalReviewed((prev) => new Set([...prev, productId]));
        setSelectedItem(null);
      } else {
        Alert.alert(t("common.error"), e.message || t("accountOrders.review.errorSubmit"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.brandBlue} />
      </View>
    );
  }

  if (done) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Icon name="stars" size={48} color={colors.starGold} />
        <AppText variant="heading" style={{ marginTop: spacing[4] }}>
          {t("accountOrders.review.successHeading")}
        </AppText>
        <AppText variant="body" color={colors.muted} align="center" style={{ marginTop: spacing[2], maxWidth: 280 }}>
          {t("accountOrders.review.successBody")}
        </AppText>
        {reviewableItems.length > 1 ? (
          <AppButton
            title={t("accountOrders.review.reviewAnother")}
            variant="primary"
            onPress={() => {
              setDone(false);
              setSelectedItem(null);
              setRating(0);
              setComment("");
              setImages([]);
            }}
            style={{ marginTop: spacing[6] }}
          />
        ) : (
          <AppButton title={t("accountOrders.review.backToOrder")} variant="primary" onPress={() => router.back()} style={{ marginTop: spacing[6] }} />
        )}
      </View>
    );
  }

  if (!selectedItem) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <BackButton />
          <AppText variant="title">{t("accountOrders.review.heading")}</AppText>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <AppText variant="body" color={colors.muted} style={styles.desc}>
            {t("accountOrders.review.selectPrompt")}
          </AppText>

          {reviewableItems.length === 0 ? (
            <View style={styles.emptyState}>
              <Icon name="stars" size={48} color={colors.gray300} />
              <AppText variant="subtitle" color={colors.muted} style={{ marginTop: spacing[3] }}>
                {t("accountOrders.review.allReviewed")}
              </AppText>
            </View>
          ) : (
            reviewableItems.map((item) => (
              <Pressable key={item.publicId} onPress={() => setSelectedItem(item)} style={styles.itemCard}>
                <Image source={{ uri: item.image || FALLBACK_IMAGE }} style={styles.itemImg} resizeMode="cover" />
                <View style={styles.itemInfo}>
                  <AppText variant="label" numberOfLines={2}>{item.title}</AppText>
                  <AppText variant="caption" color={colors.brandBlue}>{t("accountOrders.review.tapToReview")}</AppText>
                </View>
                <Icon name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton onPress={() => setSelectedItem(null)} />
          <AppText variant="title">{t("accountOrders.review.reviewHeading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.productHeader}>
          <Image source={{ uri: selectedItem.image || FALLBACK_IMAGE }} style={styles.productImg} resizeMode="cover" />
          <AppText variant="subtitle" numberOfLines={2} style={{ flex: 1 }}>
            {selectedItem.title}
          </AppText>
        </View>

        <AppText variant="subtitle" style={styles.sectionTitle}>{t("accountOrders.review.ratingLabel")}</AppText>
        <View style={styles.starRow}>
          {[1, 2, 3, 4, 5].map((s) => (
            <Pressable key={s} onPress={() => setRating(s)} hitSlop={8}>
              <Icon name={s <= rating ? "star" : "star-outline"} size={36} color={s <= rating ? colors.starGold : colors.gray300} />
            </Pressable>
          ))}
        </View>

        <AppText variant="subtitle" style={styles.sectionTitle}>{t("accountOrders.review.commentLabel")}</AppText>
        <TextInput
          style={styles.commentInput}
          value={comment}
          onChangeText={setComment}
          placeholder={t("accountOrders.review.commentPlaceholder")}
          placeholderTextColor={colors.mutedLight}
          multiline
          maxLength={MAX_COMMENT}
        />
        <AppText variant="caption" color={colors.muted} align="right">
          {comment.length}/{MAX_COMMENT}
        </AppText>

        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("accountOrders.review.photosLabel", { max: MAX_IMAGES })}
        </AppText>
        <View style={styles.imageRow}>
          {images.map((uri, i) => (
            <View key={i} style={styles.thumbWrap}>
              <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
              <Pressable onPress={() => removeImage(i)} style={styles.removeThumb} hitSlop={6}>
                <Icon name="cancel" size={20} color={colors.error} />
              </Pressable>
            </View>
          ))}
          {images.length < MAX_IMAGES && (
            <Pressable onPress={pickImages} style={styles.addThumb}>
              <Icon name="add-a-photo" size={24} color={colors.muted} />
            </Pressable>
          )}
        </View>

        <AppButton
          title={submitting ? t("accountOrders.review.submitting") : t("accountOrders.review.submitReview")}
          variant="primary"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={rating === 0}
          onPress={handleSubmit}
          style={{ marginTop: spacing[6] }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background, padding: spacing[6] },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[2], paddingVertical: spacing[2] },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  desc: { marginBottom: spacing[4] },
  emptyState: { alignItems: "center", marginTop: spacing[10] },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    marginBottom: spacing[2],
    gap: spacing[3],
    ...shadows.sm,
  },
  itemImg: { width: 56, height: 56, borderRadius: borderRadius.lg },
  itemInfo: { flex: 1, gap: spacing[0.5] },
  productHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[4],
    marginBottom: spacing[4],
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    ...shadows.sm,
  },
  productImg: { width: 64, height: 64, borderRadius: borderRadius.lg },
  sectionTitle: { marginTop: spacing[4], marginBottom: spacing[3] },
  starRow: {
    flexDirection: "row",
    gap: spacing[2],
    justifyContent: "center",
    paddingVertical: spacing[2],
  },
  commentInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.white,
    minHeight: 100,
    textAlignVertical: "top",
  },
  imageRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
  },
  thumbWrap: { position: "relative" },
  thumb: { width: 72, height: 72, borderRadius: borderRadius.lg },
  removeThumb: { position: "absolute", top: -6, right: -6 },
  addThumb: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
});
