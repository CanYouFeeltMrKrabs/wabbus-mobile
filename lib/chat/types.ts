/**
 * Chat types used by the live-chat hook and UI components.
 * Mirrors the web's components/chat/types.ts.
 */

export type UiMsg = {
  id: string;
  text: string;
  ts: number;
  side: "me" | "them" | "system";
  eventType?: "AGENT_JOINED" | "RESOLVED" | "CLOSED";
  /** Only set on customer-sent messages that failed, are queued, or overflowed the queue cap. */
  status?: "failed" | "queued" | "overflow";
  /** Attachment publicId — used to load image via /employee-chat/attachments/:publicId */
  attachmentId?: string;
  /** Transient: tracks upload progress for attachments being uploaded */
  uploadProgress?: "uploading" | "processing" | "error";
  /** Agent display name for AGENT_JOINED events */
  agentName?: string;
};

export type ConversationState = "NONE" | "WAITING" | "OPEN" | "CLOSED";
