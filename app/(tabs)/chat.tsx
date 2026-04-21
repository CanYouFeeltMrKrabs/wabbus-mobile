import React, { useEffect, useRef, useState, useMemo, useCallback, Fragment } from "react";
import {
  View,
  FlatList,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AppText from "@/components/ui/AppText";
import Icon from "@/components/ui/Icon";
import AppButton from "@/components/ui/AppButton";
import { useTranslation } from "@/hooks/useT";
import { useLiveChat } from "@/lib/chat/useLiveChat";
import { getChatReasons, type ChatReasonValue } from "@/lib/chat/chat-reasons";
import type { UiMsg } from "@/lib/chat/types";
import { customerFetchBlob } from "@/lib/api";
import { CHAT } from "@/lib/constants";
import { colors, spacing, borderRadius, fontSize, shadows } from "@/lib/theme";

const RETRY_DELAYS = [2_000, 5_000, 10_000];

/**
 * Reads a Blob into a data URI string (data:<mime>;base64,...) using
 * FileReader, which React Native polyfills via the Hermes / JSC bridges.
 * Used to feed cookie-protected images into <Image> without relying on
 * the native HTTP layer's spotty cookie forwarding for image URIs.
 */
function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Unexpected FileReader result type."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Renders an attachment image loaded from the authenticated API endpoint.
 *
 * Why we don't pass the URL directly to <Image source={{ uri }}>:
 * React Native's native image loader does not reliably forward the
 * customer auth cookies to /employee-chat/attachments/by-public-id/:publicId across
 * iOS and Android. We instead fetch the image via customerFetchBlob —
 * which goes through the same cookie + 401-refresh + logout pipeline as
 * every other authenticated request — convert it to a base64 data URI,
 * and hand that to <Image>. The data URI is small enough for chat-sized
 * webp images (server caps at 20 MB; client at 10 MB) and benefits from
 * RN's built-in image cache keyed on URI.
 *
 * Retries with exponential-ish backoff (2s → 5s → 10s) on failure and
 * shows a manual retry button after exhausting attempts.
 */
function SecureAttachment({ attachmentId, side }: { attachmentId: string; side: "me" | "them" }) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [dataUri, setDataUri] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setState("loading");
    setDataUri(null);
    const ac = new AbortController();

    (async () => {
      try {
        const blob = await customerFetchBlob(
          `/employee-chat/attachments/by-public-id/${attachmentId}`,
          { signal: ac.signal },
        );
        if (cancelledRef.current) return;
        const uri = await blobToDataUri(blob);
        if (cancelledRef.current) return;
        setDataUri(uri);
        setState("loaded");
      } catch {
        if (cancelledRef.current || ac.signal.aborted) return;
        const next = attempt + 1;
        if (next <= RETRY_DELAYS.length) {
          retryTimerRef.current = setTimeout(() => {
            if (!cancelledRef.current) setAttempt(next);
          }, RETRY_DELAYS[next - 1]);
        } else {
          setState("error");
        }
      }
    })();

    return () => {
      cancelledRef.current = true;
      ac.abort();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [attachmentId, attempt]);

  const handleRetry = useCallback(() => {
    setState("loading");
    setAttempt(0);
  }, []);

  if (state === "error") {
    return (
      <View style={[
        styles.attachWrap,
        side === "me" ? styles.bubbleCustomer : styles.bubbleAgent,
        { borderBottomRightRadius: side === "me" ? borderRadius.sm : borderRadius["2xl"],
          borderBottomLeftRadius: side === "them" ? borderRadius.sm : borderRadius["2xl"] },
      ]}>
        <View style={styles.attachError}>
          <Icon name="broken-image" size={20} color={colors.slate400} />
          <Pressable onPress={handleRetry} hitSlop={8}>
            <AppText variant="caption" color={colors.brandBlue} weight="medium">Retry</AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[
      styles.attachWrap,
      side === "me"
        ? { backgroundColor: colors.brandBlue, borderBottomRightRadius: borderRadius.sm }
        : { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.gray100, borderBottomLeftRadius: borderRadius.sm },
    ]}>
      {state !== "loaded" && (
        <View style={styles.attachSkeleton}>
          <ActivityIndicator size="small" color={colors.slate300} />
        </View>
      )}
      {dataUri && (
        <Image
          source={{ uri: dataUri }}
          style={[styles.attachImage, state === "loaded" ? { opacity: 1 } : { opacity: 0, position: "absolute" }]}
          resizeMode="contain"
          onLoad={() => setState("loaded")}
          onError={() => setState("error")}
        />
      )}
    </View>
  );
}

// ── Time formatting helpers (matches web ChatPanel) ─────────

const SEPARATOR_GAP_MS = 5 * 60 * 1000;

function isValidTs(ts: number): boolean {
  return Number.isFinite(ts) && ts > 0;
}

function formatSeparatorTime(ts: number): string {
  if (!isValidTs(ts)) return "";
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (msgDay.getTime() === today.getTime()) return `Today, ${time}`;
  if (msgDay.getTime() === yesterday.getTime()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function formatMsgTime(ts: number): string {
  if (!isValidTs(ts)) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function shouldShowSeparator(current: UiMsg, prev: UiMsg | undefined): boolean {
  if (!isValidTs(current.ts)) return false;
  if (!prev) return true;
  if (!isValidTs(prev.ts)) return true;
  if (current.ts - prev.ts > SEPARATOR_GAP_MS) return true;
  const a = new Date(prev.ts);
  const b = new Date(current.ts);
  return a.getDate() !== b.getDate() || a.getMonth() !== b.getMonth() || a.getFullYear() !== b.getFullYear();
}

// ── Status label ────────────────────────────────────────────

function statusLabel(
  status: "idle" | "connecting" | "connected" | "reconnecting" | "error",
  convState: string,
  t: (key: string) => string,
): string {
  if (status === "error") return t("chat.statusError");
  if (status === "reconnecting") return t("chat.statusReconnecting");
  if (status === "connecting") return t("chat.statusConnecting");
  if (convState === "WAITING") return t("chat.statusWaiting");
  if (convState === "OPEN") return t("chat.statusActive");
  if (status === "connected") return t("chat.statusReady");
  return t("chat.statusReady");
}

function statusColor(status: string): string {
  if (status === "error") return colors.error;
  if (status === "reconnecting" || status === "connecting") return colors.warning;
  return colors.success;
}

// ── Rating labels ───────────────────────────────────────────

const RATING_LABELS = ["", "chat.ratingPoor", "chat.ratingFair", "chat.ratingGood", "chat.ratingVeryGood", "chat.ratingExcellent"];

// ────────────────────────────────────────────────────────────

export default function ChatTabScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList>(null);

  const composerRef = useRef<TextInput>(null);
  const chat = useLiveChat(t, composerRef);
  const isFocused = useIsFocused();

  const CHAT_REASONS = useMemo(() => getChatReasons(t), [t]);
  const [selectedReason, setSelectedReason] = useState<ChatReasonValue | null>(null);
  const [reasonDetail, setReasonDetail] = useState("");

  // Rating local UI state
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  // Reset rating UI when showRating changes
  const prevShowRating = useRef(chat.showRating);
  if (chat.showRating !== prevShowRating.current) {
    prevShowRating.current = chat.showRating;
    if (chat.showRating) {
      setRatingValue(0);
      setRatingComment("");
      setRatingSubmitting(false);
      setRatingSubmitted(false);
    }
  }

  // Reset reason picker on conversation state change
  const prevConvState = useRef(chat.conversationState);
  if (chat.conversationState !== prevConvState.current) {
    prevConvState.current = chat.conversationState;
    if (chat.conversationState === "OPEN" || chat.conversationState === "NONE") {
      setSelectedReason(null);
      setReasonDetail("");
    }
  }

  // Reset reason picker when tab loses focus (user navigates away)
  const prevFocused = useRef(isFocused);
  if (isFocused !== prevFocused.current) {
    prevFocused.current = isFocused;
    if (isFocused && (chat.conversationState === "NONE" || chat.conversationState === "CLOSED")) {
      setSelectedReason(null);
      setReasonDetail("");
    }
  }

  const sortedMsgs = useMemo(() => [...chat.msgs].sort((a, b) => a.ts - b.ts), [chat.msgs]);

  const showStartButton = chat.conversationState === "NONE" || chat.conversationState === "CLOSED";
  const canEndChat = chat.conversationState === "WAITING" || chat.conversationState === "OPEN";

  const scrollToEnd = useCallback(() => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, []);

  const handleStartChat = useCallback(() => {
    chat.onStartNewChat(selectedReason || undefined, reasonDetail.trim() || undefined);
    scrollToEnd();
  }, [chat, selectedReason, reasonDetail, scrollToEnd]);

  // ── Render items ──────────────────────────────────────────

  const renderItem = useCallback(({ item: m, index }: { item: UiMsg; index: number }) => {
    const prev = index > 0 ? sortedMsgs[index - 1] : undefined;
    const sep = shouldShowSeparator(m, prev);

    return (
      <Fragment>
        {sep && (
          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <AppText variant="bodySmall" color={colors.gray400} style={styles.separatorText}>
              {formatSeparatorTime(m.ts)}
            </AppText>
            <View style={styles.separatorLine} />
          </View>
        )}

        {m.side === "system" ? (
          <View style={styles.systemMsg}>
            <View style={styles.systemPill}>
              {m.eventType === "AGENT_JOINED" && !m.text ? (
                <View style={styles.systemRow}>
                  <View style={styles.greenDot} />
                  <AppText variant="bodySmall" color={colors.muted}>
                    <AppText variant="bodySmall" color={colors.foreground} weight="bold">
                      {m.agentName || t("chat.anAgentJoined")}
                    </AppText>
                    {"  "}{t("chat.agentJoined")}
                  </AppText>
                </View>
              ) : m.eventType === "RESOLVED" ? (
                <AppText variant="bodySmall" color={colors.muted} align="center">
                  {m.text || t("chat.conversationResolved")}
                </AppText>
              ) : m.eventType === "CLOSED" ? (
                <AppText variant="bodySmall" color={colors.muted} align="center">
                  {m.text || t("chat.conversationClosed")}
                </AppText>
              ) : m.text ? (
                <AppText variant="bodySmall" color={colors.muted} align="center">
                  {m.text}
                </AppText>
              ) : null}
            </View>
          </View>
        ) : m.uploadProgress ? (
          <View style={[styles.bubbleRow, styles.bubbleRight]}>
            <View style={[styles.bubble, m.uploadProgress === "error" ? styles.bubbleUploadError : styles.bubbleCustomer]}>
              {m.uploadProgress === "error" ? (
                <AppText variant="body" color={colors.error}>{t("chat.uploadFailed")}</AppText>
              ) : (
                <View style={styles.uploadRow}>
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
                  <AppText variant="body" color="rgba(255,255,255,0.9)">
                    {m.uploadProgress === "uploading" ? t("chat.uploading") : t("chat.processing")}
                  </AppText>
                </View>
              )}
            </View>
          </View>
        ) : m.attachmentId ? (
          <View style={[styles.bubbleRow, m.side === "me" ? styles.bubbleRight : styles.bubbleLeft]}>
            <SecureAttachment attachmentId={m.attachmentId} side={m.side === "me" ? "me" : "them"} />
            {m.text ? (
              <View style={[
                styles.bubble,
                m.side === "me" ? styles.bubbleCustomer : styles.bubbleAgent,
                { marginTop: -borderRadius["2xl"] + borderRadius.sm, borderTopLeftRadius: 0, borderTopRightRadius: 0 },
              ]}>
                <AppText variant="body" color={m.side === "me" ? colors.white : colors.foreground}>
                  {m.text}
                </AppText>
              </View>
            ) : null}
            <AppText variant="caption" color={colors.mutedLight} style={styles.time}>
              {formatMsgTime(m.ts)}
            </AppText>
          </View>
        ) : (
          <View style={[styles.bubbleRow, m.side === "me" ? styles.bubbleRight : styles.bubbleLeft]}>
            <View style={[
              styles.bubble,
              m.side === "me" ? styles.bubbleCustomer : styles.bubbleAgent,
              m.status ? { opacity: 0.6 } : undefined,
            ]}>
              <AppText variant="body" color={m.side === "me" ? colors.white : colors.foreground} style={styles.msgText}>
                {m.text}
              </AppText>
              <AppText variant="caption" color={m.side === "me" ? "rgba(255,255,255,0.55)" : colors.mutedLight} style={styles.time}>
                {formatMsgTime(m.ts)}
              </AppText>
            </View>
            {m.status === "failed" ? (
              <Pressable onPress={() => chat.onRetrySend(m.id)} hitSlop={8} style={styles.retryRow}>
                <Icon name="error-outline" size={14} color={colors.error} />
                <AppText variant="bodySmall" color={colors.error}>{t("chat.notSentRetry")}</AppText>
              </Pressable>
            ) : m.status === "queued" ? (
              <AppText variant="caption" color={colors.warning} style={styles.statusHint}>{t("chat.queued")}</AppText>
            ) : m.status === "overflow" ? (
              <AppText variant="caption" color={colors.warning} style={styles.statusHint}>{t("chat.pendingRetry")}</AppText>
            ) : null}
          </View>
        )}
      </Fragment>
    );
  }, [sortedMsgs, chat, t]);

  // ── Main render ───────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.screen}
      keyboardVerticalOffset={0}
    >
      <StatusBar style="light" />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing[3.5] }]}>
        <View style={styles.headerCenter}>
          <AppText variant="title" weight="bold" color={colors.white}>{t("chat.heading")}</AppText>
          <View style={styles.headerStatusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor(chat.status) }]} />
            <AppText variant="bodySmall" color="rgba(255,255,255,0.75)" weight="medium">
              {statusLabel(chat.status, chat.conversationState, t)}
            </AppText>
          </View>
        </View>
        {canEndChat && (
          <Pressable
            onPress={chat.onEndChat}
            disabled={chat.endingChat}
            style={({ pressed }) => [styles.endBtn, pressed && { opacity: 0.8 }, chat.endingChat && { opacity: 0.5 }]}
            hitSlop={8}
          >
            <Icon name="close" size={14} color={colors.white} />
            <AppText variant="bodySmall" color={colors.white} weight="bold">
              {chat.endingChat ? t("chat.ending") : t("chat.endChat")}
            </AppText>
          </Pressable>
        )}
      </View>

      {/* Body */}
      {chat.status === "connecting" && sortedMsgs.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brandBlue} />
          <AppText variant="body" color={colors.muted} style={{ marginTop: spacing[3] }}>
            {t("chat.statusConnecting")}
          </AppText>
        </View>
      ) : showStartButton && sortedMsgs.length === 0 ? (
        /* ── Reason picker (pre-chat) ── */
        <View style={styles.reasonContainer}>
          <View style={styles.reasonHero}>
            <View style={styles.reasonIconWrap}>
              <Icon name="chat" size={32} color={colors.brandBlue} />
            </View>
            <AppText variant="title" align="center">{t("chat.howCanWeHelp")}</AppText>
            <AppText variant="body" color={colors.muted} align="center">{t("chat.usuallyReply")}</AppText>
          </View>

          {selectedReason && (
            <Pressable
              onPress={() => { setSelectedReason(null); setReasonDetail(""); }}
              style={styles.reasonBackRow}
              hitSlop={8}
            >
              <Icon name="arrow-back" size={20} color={colors.brandBlue} />
              <AppText variant="subtitle" color={colors.brandBlue}>{t("common.back")}</AppText>
            </Pressable>
          )}

          {CHAT_REASONS.map((r) => {
            const active = selectedReason === r.value;
            if (selectedReason && !active) return null;
            return (
              <Pressable
                key={r.value}
                onPress={() => setSelectedReason(active ? null : r.value)}
                style={[styles.reasonCard, active && styles.reasonCardActive]}
              >
                <View style={[styles.reasonIcon, active && { backgroundColor: colors.brandBlueLight }]}>
                  <Icon name={r.icon} size={20} color={colors.brandBlue} />
                </View>
                <AppText variant="label" style={{ flex: 1 }}>{r.label}</AppText>
                {active && <Icon name="check" size={20} color={colors.brandBlue} />}
              </Pressable>
            );
          })}

          {selectedReason && (
            <View style={styles.reasonDetailWrap}>
              <TextInput
                value={reasonDetail}
                onChangeText={(v) => setReasonDetail(v.slice(0, 500))}
                placeholder={t("chat.optionalDetail")}
                placeholderTextColor={colors.mutedLight}
                multiline
                maxLength={500}
                style={styles.reasonDetailInput}
              />
              <AppButton
                title={chat.startCooldown ? t("chat.pleaseWait") : t("chat.startChat")}
                variant="accent"
                fullWidth
                size="lg"
                disabled={chat.startingChat || chat.startCooldown || chat.status !== "connected"}
                loading={chat.startingChat}
                onPress={handleStartChat}
                style={{ borderRadius: borderRadius.full, marginTop: spacing[3] }}
              />
            </View>
          )}
        </View>
      ) : (
        /* ── Message list ── */
        <View style={styles.body}>
          <FlatList
            ref={listRef}
            data={sortedMsgs}
            keyExtractor={(m) => m.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={scrollToEnd}
            ListHeaderComponent={
              chat.conversationState === "WAITING" ? (
                <View style={styles.waitingBanner}>
                  <ActivityIndicator size="small" color={colors.white} />
                  <AppText variant="bodySmall" color={colors.white} weight="semibold">
                    {t("chat.waitingForAgent")}
                  </AppText>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Icon name="chat-bubble-outline" size={36} color={colors.brandBlue} />
                </View>
                <AppText variant="subtitle" color={colors.foreground} align="center">
                  {t("chat.emptyPrompt")}
                </AppText>
              </View>
            }
          />

          {/* Typing indicator */}
          {chat.isAgentTyping && !chat.showRating && chat.conversationState !== "CLOSED" && (
            <View style={styles.typingRow}>
              <View style={styles.typingBubble}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={[styles.typingDot, { opacity: 0.4 + (i * 0.2) }]} />
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Footer */}
      {(chat.conversationState === "WAITING" ||
        chat.conversationState === "OPEN" ||
        chat.conversationState === "CLOSED") && !(showStartButton && sortedMsgs.length === 0) && (

        chat.conversationState === "CLOSED" ? (
          /* ── Closed: rating + new chat ── */
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
            {chat.showRating && !ratingSubmitted && (
              <View style={styles.ratingCard}>
                <View style={styles.ratingStarsRow}>
                  <View style={styles.ratingStars}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Pressable key={star} onPress={() => setRatingValue(star)} hitSlop={4}>
                        <Icon
                          name={star <= ratingValue ? "star" : "star-outline"}
                          size={28}
                          color={star <= ratingValue ? "#f59e0b" : colors.gray300}
                        />
                      </Pressable>
                    ))}
                  </View>
                  <Pressable onPress={chat.onDismissRating} hitSlop={8}>
                    <Icon name="close" size={18} color={colors.gray400} />
                  </Pressable>
                </View>
                <AppText variant="bodySmall" color={colors.muted} style={{ marginTop: spacing[1] }}>
                  {ratingValue > 0 ? t(RATING_LABELS[ratingValue]) : t("chat.howWasExperience")}
                </AppText>
                <TextInput
                  value={ratingComment}
                  onChangeText={setRatingComment}
                  placeholder={t("chat.tellUsMore")}
                  placeholderTextColor={colors.mutedLight}
                  maxLength={400}
                  multiline
                  style={styles.ratingInput}
                />
                <AppButton
                  title={ratingSubmitting ? t("chat.sendingRating") : t("chat.submit")}
                  variant="accent"
                  size="sm"
                  disabled={ratingValue === 0 || ratingSubmitting}
                  loading={ratingSubmitting}
                  onPress={async () => {
                    if (ratingValue === 0 || ratingSubmitting) return;
                    setRatingSubmitting(true);
                    try {
                      chat.onSubmitRating(ratingValue, ratingComment);
                      setRatingSubmitted(true);
                    } finally {
                      setRatingSubmitting(false);
                    }
                  }}
                  style={{ alignSelf: "flex-end", borderRadius: borderRadius.lg }}
                />
              </View>
            )}
            {ratingSubmitted && (
              <View style={styles.ratingThanks}>
                <Icon name="check-circle" size={20} color={colors.success} />
                <AppText variant="bodySmall" color={colors.success} weight="medium">
                  {t("chat.thanksFeedback")}
                </AppText>
              </View>
            )}
            <AppText variant="caption" color={colors.gray400} align="center" style={{ marginBottom: spacing[2] }}>
              {t("chat.thisConversationEnded")}
            </AppText>
            <AppButton
              title={t("chat.startNewChat")}
              variant="accent"
              fullWidth
              size="lg"
              disabled={chat.status !== "connected"}
              onPress={() => {
                setSelectedReason(null);
                setReasonDetail("");
                setRatingValue(0);
                setRatingComment("");
                setRatingSubmitted(false);
                chat.onResetChat();
              }}
              style={{ borderRadius: borderRadius.full }}
            />
          </View>
        ) : chat.conversationState === "WAITING" ? (
          /* ── Waiting: disabled composer ── */
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]}>
            <AppText variant="body" color={colors.gray500} align="center">
              {t("chat.waitingForAgentTyping")}
            </AppText>
            <AppText variant="bodySmall" color={colors.gray400} align="center" style={{ marginTop: spacing[1] }}>
              {t("chat.youllBeAble")}
            </AppText>
          </View>
        ) : (
          /* ── Open: active composer ── */
          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing[2]) }]}>
            {chat.queueFull && (
              <AppText variant="caption" color={colors.warning} align="center" style={{ marginBottom: spacing[1] }}>
                {t("chat.offlineQueued")}
              </AppText>
            )}
            {chat.isSpamBlocked && (
              <AppText variant="caption" color={colors.warning} align="center" style={{ marginBottom: spacing[1] }}>
                {t("chat.waitForReply")}
              </AppText>
            )}
            <View style={styles.composerRow}>
              {chat.canAttach && (
                <Pressable
                  onPress={chat.onAttach}
                  disabled={chat.uploading}
                  style={{ padding: spacing[1], opacity: chat.uploading ? 0.4 : 1 }}
                  hitSlop={8}
                >
                  {chat.uploading ? (
                    <ActivityIndicator size="small" color={colors.brandBlue} />
                  ) : (
                    <Icon name="attach-file" size={22} color={colors.muted} />
                  )}
                </Pressable>
              )}
              <TextInput
                ref={composerRef}
                style={styles.composerInput}
                value={chat.input}
                onChangeText={chat.onInputChange}
                onBlur={chat.onInputBlur}
                placeholder={chat.isSpamBlocked ? t("chat.waitForReplyPlaceholder") : t("chat.messagePlaceholder")}
                placeholderTextColor={colors.mutedLight}
                multiline
                maxLength={CHAT.MAX_MSG_LENGTH}
                editable={
                  chat.hasToken &&
                  !chat.isSpamBlocked &&
                  chat.status === "connected"
                }
              />
              <Pressable
                onPress={chat.onSend}
                disabled={!chat.canSend}
                style={[styles.sendBtn, !chat.canSend && { opacity: 0.4 }]}
                hitSlop={8}
              >
                <Icon name="send" size={20} color={colors.white} />
              </Pressable>
            </View>
          </View>
        )
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.slate50 },
  body: { flex: 1, overflow: "hidden" as const },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[6] },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3.5],
    backgroundColor: colors.brandBlue,
  },
  headerCenter: { flex: 1 },
  headerStatusRow: { flexDirection: "row", alignItems: "center", gap: spacing[1.5], marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  endBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1.5],
    paddingHorizontal: spacing[3.5],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    backgroundColor: "rgba(239,68,68,0.85)",
  },

  // Separator
  separator: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing[4],
    gap: spacing[3],
  },
  separatorLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.gray200 },
  separatorText: { fontSize: fontSize.sm },

  // System message
  systemMsg: { alignItems: "center", marginVertical: spacing[3], paddingHorizontal: spacing[4] },
  systemPill: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.lg,
    backgroundColor: colors.gray100,
  },
  systemRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  greenDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, flexShrink: 0 },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[8],
    gap: spacing[3],
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center",
    justifyContent: "center",
  },

  // Bubbles
  bubbleRow: { marginBottom: spacing[2], maxWidth: "82%" },
  bubbleRight: { alignSelf: "flex-end" },
  bubbleLeft: { alignSelf: "flex-start" },
  bubble: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: borderRadius["2xl"],
  },
  bubbleCustomer: {
    backgroundColor: colors.brandBlue,
    borderBottomRightRadius: borderRadius.sm,
    ...shadows.sm,
  },
  bubbleAgent: {
    backgroundColor: colors.white,
    borderBottomLeftRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.gray100,
    ...shadows.sm,
  },
  bubbleUploadError: {
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.error,
    borderBottomRightRadius: borderRadius.sm,
  },
  uploadRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  msgText: { lineHeight: 20 },

  // Attachment image
  attachWrap: {
    borderRadius: borderRadius["2xl"],
    overflow: "hidden",
    minHeight: 60,
    minWidth: 120,
    maxWidth: "100%",
  },
  attachImage: {
    width: "100%",
    height: undefined,
    aspectRatio: 4 / 3,
    maxHeight: 280,
    borderRadius: borderRadius["2xl"],
  },
  attachSkeleton: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.slate100,
    borderRadius: borderRadius["2xl"],
  },
  attachError: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    backgroundColor: colors.slate50,
  },
  time: { marginTop: spacing[1], textAlign: "right" as const },
  retryRow: { flexDirection: "row", alignItems: "center", gap: spacing[1.5], marginTop: spacing[1] },
  statusHint: { marginTop: spacing[1] },

  // List
  listContent: { paddingVertical: spacing[4], paddingHorizontal: spacing[4], flexGrow: 1 },

  // Waiting banner
  waitingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2.5],
    paddingVertical: spacing[3.5],
    paddingHorizontal: spacing[5],
    marginBottom: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.brandOrange,
    ...shadows.md,
  },

  // Typing
  typingRow: { paddingHorizontal: spacing[4], paddingBottom: spacing[2] },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray100,
    borderRadius: borderRadius["2xl"],
    borderBottomLeftRadius: borderRadius.sm,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    ...shadows.sm,
  },
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.gray400 },

  // Reason picker
  reasonContainer: { flex: 1, paddingHorizontal: spacing[4], paddingTop: spacing[4] },
  reasonHero: { alignItems: "center", marginBottom: spacing[4] },
  reasonIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.brandBlueLight,
    alignItems: "center", justifyContent: "center", marginBottom: spacing[3],
  },
  reasonBackRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1.5],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[1],
    marginBottom: spacing[2],
  },
  reasonCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[2],
    borderWidth: 1,
    borderColor: colors.gray100,
    ...shadows.sm,
  },
  reasonCardActive: { borderColor: colors.brandBlue, backgroundColor: colors.brandBlueLight },
  reasonIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.gray100,
    alignItems: "center", justifyContent: "center", marginRight: spacing[3],
  },
  reasonDetailWrap: { marginTop: spacing[2] },
  reasonDetailInput: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: fontSize.base,
    color: colors.foreground,
    minHeight: 60,
    maxHeight: 100,
    textAlignVertical: "top",
    backgroundColor: colors.white,
  },

  // Footer
  footer: {
    padding: spacing[4],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.white,
  },

  // Rating
  ratingCard: {
    backgroundColor: colors.gray50,
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
  },
  ratingStarsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ratingStars: { flexDirection: "row", gap: spacing[1] },
  ratingInput: {
    borderWidth: 1,
    borderColor: colors.gray200,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    fontSize: fontSize.sm,
    color: colors.foreground,
    marginTop: spacing[2],
    minHeight: 48,
    maxHeight: 80,
    textAlignVertical: "top",
    backgroundColor: colors.white,
  },
  ratingThanks: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: borderRadius.xl,
    backgroundColor: colors.successLight,
    marginBottom: spacing[3],
  },

  // Composer
  composer: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2.5],
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
    backgroundColor: colors.white,
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing[2.5] },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: borderRadius["2xl"],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2.5],
    fontSize: fontSize.base,
    lineHeight: 20,
    color: colors.foreground,
    maxHeight: 110,
    backgroundColor: colors.slate50,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandBlue,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
    ...shadows.md,
  },
});
