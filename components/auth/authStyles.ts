/**
 * Auth screen tokens — parity with web `globals.css` `.auth-*` rules.
 */
import { StyleSheet } from "react-native";
import { colors, spacing, borderRadius } from "@/lib/theme";

/** Wider card on phone — scaled up from web 440px reference */
export const AUTH_CARD_MAX = 520;

export const authStyles = StyleSheet.create({
  flex: { flex: 1 },

  headerGroup: {
    alignItems: "center",
    marginBottom: spacing[8],
  },
  authTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: colors.foreground,
    letterSpacing: -0.6,
    lineHeight: 40,
    textAlign: "center",
  },
  authSubtitle: {
    marginTop: spacing[1],
    fontSize: 17,
    fontWeight: "500",
    color: colors.slate500,
    lineHeight: 26,
    textAlign: "center",
  },

  card: {
    width: "100%",
    maxWidth: AUTH_CARD_MAX,
    alignSelf: "center",
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingVertical: spacing[8],
    paddingHorizontal: spacing[12],
    borderWidth: 1,
    borderColor: colors.slate200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 5,
  },
  cardCompactPad: {
    paddingVertical: spacing[9],
    paddingHorizontal: spacing[7],
  },

  fieldBlock: {
    marginBottom: spacing[6],
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.brandBlue,
    marginBottom: spacing[2.5],
  },

  inputWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
  },
  inputIcon: {
    position: "absolute",
    left: spacing[5],
    top: 0,
    bottom: 0,
    justifyContent: "center",
    zIndex: 1,
    pointerEvents: "none",
  },
  input: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.brandBlue,
    borderRadius: borderRadius.xl,
    paddingVertical: 17,
    paddingLeft: 56,
    paddingRight: spacing[5],
    fontSize: 17,
    color: colors.foreground,
    backgroundColor: colors.card,
  },
  inputWithToggle: {
    paddingRight: 52,
  },
  togglePassword: {
    position: "absolute",
    right: spacing[3],
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: spacing[2],
    minWidth: 44,
    alignItems: "center",
  },

  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    marginBottom: spacing[5],
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[5],
    borderRadius: borderRadius["2xl"],
    backgroundColor: "rgba(255, 241, 242, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(254, 202, 202, 0.65)",
  },
  errorText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: "#be123c",
    fontWeight: "500",
  },

  forgotLink: {
    alignSelf: "flex-end",
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  forgotText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.brandOrange,
  },

  submitBtn: {
    marginTop: spacing[3],
    minHeight: 54,
  },

  altRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: spacing[6],
    gap: spacing[1],
  },
  altMuted: {
    fontSize: 16,
    color: colors.gray600,
  },
  altLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
  },
  altLinkText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.brandOrange,
  },

  copyright: {
    marginTop: spacing[10],
    fontSize: 13,
    color: colors.slate500,
    textAlign: "center",
  },
});
