import React, { useState, useCallback, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { customerFetch } from "@/lib/api";
import { API_BASE } from "@/lib/config";
import { invalidate } from "@/lib/queries";
import { ROUTES } from "@/lib/routes";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import { showToast } from "@/lib/toast";

const CATEGORIES = [
  { code: "TECHNICAL", labelKey: "support.ticket.catTechnical", icon: "build" },
  { code: "BILLING", labelKey: "support.ticket.catBilling", icon: "credit-card" },
  { code: "ACCOUNT", labelKey: "support.ticket.catAccount", icon: "account-circle" },
  { code: "OTHER", labelKey: "support.ticket.catOther", icon: "help-outline" },
];

const MAX_ATTACHMENTS = 5;
const MAX_ATTACH_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

type PendingAttachment = {
  id: string;
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
};

// ── Background upload helpers ────────────────────────────────────────

/**
 * Plain fetch for background uploads — avoids customerFetch's auth-logout
 * cascade which would kill remaining uploads if one 401s.
 */
async function bgFetch<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Fire-and-forget: for each attachment, presign → PUT to R2 → confirm →
 * send as a ticket message. Same 3-step flow the web uses.
 */
async function uploadAttachmentsInBackground(
  ticketPublicId: string,
  attachments: PendingAttachment[],
) {
  for (const att of attachments) {
    try {
      // 1. Presign
      const { uploadUrl, key } = await bgFetch<{ uploadUrl: string; key: string }>(
        "/uploads/customer-chat-attachment",
        {
          method: "POST",
          body: JSON.stringify({
            mimeType: att.mimeType,
            fileName: att.fileName,
            fileSize: att.size,
            context: "ticket",
            entityId: ticketPublicId,
          }),
        },
      );

      // 2. Upload blob to R2
      const blob = await fetch(att.uri).then((r) => r.blob());
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": att.mimeType },
        body: blob,
      });
      if (!putRes.ok) continue;

      // 3. Confirm + attach as message
      const confirmRes = await bgFetch<{ success: boolean; cleanKey?: string }>(
        "/uploads/chat-attachment/confirm",
        { method: "POST", body: JSON.stringify({ key }) },
      );

      await bgFetch(`/support/tickets/${ticketPublicId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          body: "(attachment)",
          attachment: {
            key: confirmRes.cleanKey || key,
            fileName: att.fileName,
            mimeType: att.mimeType,
            size: att.size,
          },
        }),
      });
    } catch {
      // Skip failed uploads — user can add attachments from the thread later
    }
  }
}

// ── Component ────────────────────────────────────────────────────────

export default function SubmitTicketScreen() {
  return (
    <RequireAuth>
      <TicketContent />
    </RequireAuth>
  );
}

function TicketContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [category, setCategory] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const pendingRef = useRef(pendingAttachments);
  pendingRef.current = pendingAttachments;

  const pickImages = useCallback(async () => {
    const remaining = MAX_ATTACHMENTS - pendingRef.current.length;
    if (remaining <= 0) {
      Alert.alert(
        t("support.ticket.attachLimitTitle"),
        t("support.ticket.attachLimitBody", { max: MAX_ATTACHMENTS }),
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
    });

    if (result.canceled) return;

    const newAttachments: PendingAttachment[] = [];
    const rejected: string[] = [];

    for (const asset of result.assets) {
      const fileName = asset.fileName || asset.uri.split("/").pop() || "photo.jpg";
      const mimeType = asset.mimeType || (fileName.endsWith(".png") ? "image/png" : "image/jpeg");
      const size = asset.fileSize || 0;

      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        rejected.push(`"${fileName}" — unsupported type`);
        continue;
      }
      if (size > MAX_ATTACH_SIZE) {
        rejected.push(`"${fileName}" — file too large`);
        continue;
      }

      newAttachments.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        uri: asset.uri,
        fileName,
        mimeType,
        size,
      });
    }

    if (rejected.length > 0) {
      showToast(rejected.join("; "), "error");
    }

    if (newAttachments.length > 0) {
      setPendingAttachments((prev) =>
        [...prev, ...newAttachments].slice(0, MAX_ATTACHMENTS),
      );
    }
  }, [t]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleSubmit = async () => {
    if (!category || !body.trim()) {
      setError(t("support.ticket.validationError"));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const result = await customerFetch<any>("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ body: body.trim(), category }),
      });

      const ticketPublicId = result?.ticket?.publicId ?? result?.publicId;
      const ticketNumber = result?.ticket?.ticketNumber ?? result?.ticketNumber
        ?? result?.publicId?.slice(0, 8).toUpperCase() ?? "";

      // Fire-and-forget background uploads
      if (ticketPublicId && pendingRef.current.length > 0) {
        const attachments = [...pendingRef.current];
        setPendingAttachments([]);
        void uploadAttachmentsInBackground(ticketPublicId, attachments);
      }

      void invalidate.messages.tickets.list();
      void invalidate.messages.unread();
      showToast(
        ticketNumber
          ? t("support.ticket.submitSuccessWithNumber", { ticketNumber })
          : t("support.ticket.submitSuccess"),
        "success",
      );
      router.replace(ROUTES.accountMessages);
    } catch (e: any) {
      setError(e.message || t("support.ticket.submitError"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("support.ticket.heading")}</AppText>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("support.ticket.whatsThisAbout")}
        </AppText>

        <View style={styles.categoryGrid}>
          {CATEGORIES.map((cat) => (
            <Pressable
              key={cat.code}
              onPress={() => setCategory(cat.code)}
              style={[
                styles.categoryCard,
                category === cat.code && styles.categoryCardSelected,
              ]}
            >
              <Icon
                name={cat.icon}
                size={24}
                color={category === cat.code ? colors.brandBlue : colors.muted}
              />
              <AppText
                variant="label"
                color={category === cat.code ? colors.brandBlue : colors.foreground}
                align="center"
                style={{ marginTop: spacing[1] }}
              >
                {t(cat.labelKey)}
              </AppText>
            </Pressable>
          ))}
        </View>

        <AppText variant="subtitle" style={styles.sectionTitle}>
          {t("support.ticket.describeIssue")}
        </AppText>
        <TextInput
          style={styles.textArea}
          value={body}
          onChangeText={setBody}
          placeholder={t("support.ticket.placeholder")}
          placeholderTextColor={colors.mutedLight}
          multiline
          maxLength={2000}
          textAlignVertical="top"
        />
        <AppText variant="caption" color={colors.muted} align="right">
          {body.length}/2000
        </AppText>

        {/* ── Attachments Section ── */}
        <View style={styles.attachSection}>
          {/* Thumbnail strip */}
          {pendingAttachments.length > 0 && (
            <View style={styles.thumbRow}>
              {pendingAttachments.map((att) => (
                <View key={att.id} style={styles.thumbWrap}>
                  <Image
                    source={{ uri: att.uri }}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => removeAttachment(att.id)}
                    style={styles.removeThumb}
                    hitSlop={6}
                  >
                    <Icon name="cancel" size={20} color={colors.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          )}

          {/* Attach button */}
          <Pressable
            onPress={pickImages}
            disabled={pendingAttachments.length >= MAX_ATTACHMENTS}
            style={({ pressed }) => [
              styles.attachBtn,
              pressed && styles.attachBtnPressed,
              pendingAttachments.length >= MAX_ATTACHMENTS && styles.attachBtnDisabled,
            ]}
          >
            <Icon
              name="attach-file"
              size={20}
              color={
                pendingAttachments.length >= MAX_ATTACHMENTS
                  ? colors.slate300
                  : colors.brandBlue
              }
            />
            <AppText
              variant="label"
              color={
                pendingAttachments.length >= MAX_ATTACHMENTS
                  ? colors.slate300
                  : colors.brandBlue
              }
            >
              {t("support.ticket.attachImages")}
            </AppText>
          </Pressable>
          <AppText variant="caption" color={colors.mutedLight} style={{ marginTop: spacing[1] }}>
            {t("support.ticket.attachHint", { count: MAX_ATTACHMENTS })}
          </AppText>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Icon name="error-outline" size={18} color={colors.error} />
            <AppText variant="caption" color={colors.error} style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        )}

        <AppButton
          title={submitting ? t("support.ticket.submitting") : t("support.ticket.submit")}
          variant="primary"
          fullWidth
          size="lg"
          loading={submitting}
          disabled={!category || !body.trim()}
          onPress={handleSubmit}
          style={{ marginTop: spacing[4] }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: spacing[6],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  content: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  sectionTitle: { marginTop: spacing[2], marginBottom: spacing[3] },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  categoryCard: {
    width: "47%",
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
    ...shadows.sm,
  },
  categoryCardSelected: {
    borderColor: colors.brandBlue,
    backgroundColor: colors.brandBlueLight,
  },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.white,
    minHeight: 150,
  },

  // ── Attachments ──
  attachSection: {
    marginTop: spacing[4],
  },
  thumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing[2],
    marginBottom: spacing[3],
  },
  thumbWrap: {
    position: "relative",
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
  },
  removeThumb: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: spacing[2.5],
    paddingHorizontal: spacing[4],
    borderWidth: 1,
    borderColor: colors.brandBlueBorder,
    borderRadius: borderRadius.xl,
    backgroundColor: "rgba(239, 246, 255, 0.5)",
    alignSelf: "flex-start",
  },
  attachBtnPressed: {
    backgroundColor: colors.brandBlueLight,
  },
  attachBtnDisabled: {
    opacity: 0.4,
  },

  // ── Error ──
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    backgroundColor: "#FEF2F2",
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    marginTop: spacing[3],
  },
});
