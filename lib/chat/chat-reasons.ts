export const ChatReason = {
  ORDER_SUPPORT: "ORDER_SUPPORT",
  TECHNICAL: "TECHNICAL",
  BILLING: "BILLING",
  ACCOUNT: "ACCOUNT",
  OTHER: "OTHER",
} as const;

export type ChatReasonValue = (typeof ChatReason)[keyof typeof ChatReason];

export type ChatReasonItem = {
  value: ChatReasonValue;
  label: string;
  icon: string;
};

export function getChatReasons(t: (key: string) => string): readonly ChatReasonItem[] {
  return [
    { value: ChatReason.ORDER_SUPPORT, label: t("chat.reasons.orderIssue"), icon: "local-shipping" },
    { value: ChatReason.TECHNICAL, label: t("chat.reasons.technicalProblem"), icon: "build" },
    { value: ChatReason.BILLING, label: t("chat.reasons.billingPayments"), icon: "credit-card" },
    { value: ChatReason.ACCOUNT, label: t("chat.reasons.accountHelp"), icon: "person" },
    { value: ChatReason.OTHER, label: t("chat.reasons.somethingElse"), icon: "chat" },
  ];
}
