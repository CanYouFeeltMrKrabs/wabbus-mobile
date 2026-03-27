/**
 * Shared presign → upload → confirm utility for file attachments.
 * Used by live chat, seller conversations, and case follow-ups.
 */

import * as DocumentPicker from "expo-document-picker";
import { customerFetch } from "./api";
import { API_BASE } from "./config";

export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

export async function pickDocument(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name ?? "file",
    mimeType: asset.mimeType ?? "application/octet-stream",
    size: asset.size ?? 0,
  };
}

export type UploadResult = {
  key: string;
  messagePublicId?: string;
};

/**
 * Authenticated upload flow using customerFetch for presign + confirm.
 */
export async function uploadFileAuth(opts: {
  presignUrl: string;
  confirmUrl: string;
  file: PickedFile;
  extraPresignBody?: Record<string, unknown>;
  extraConfirmBody?: Record<string, unknown>;
}): Promise<UploadResult> {
  const presignData = await customerFetch<{ uploadUrl: string; rawKey: string }>(
    opts.presignUrl,
    {
      method: "POST",
      body: JSON.stringify({
        mimeType: opts.file.mimeType,
        fileSize: opts.file.size,
        fileName: opts.file.name,
        ...opts.extraPresignBody,
      }),
    },
  );

  const blob = await fetch(opts.file.uri).then((r) => r.blob());
  const uploadRes = await fetch(presignData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": opts.file.mimeType },
    body: blob,
  });

  if (!uploadRes.ok) throw new Error("Upload to storage failed.");

  const confirmData = await customerFetch<{ messagePublicId?: string; key?: string; rawKey?: string }>(
    opts.confirmUrl,
    {
      method: "POST",
      body: JSON.stringify({
        rawKey: presignData.rawKey,
        ...opts.extraConfirmBody,
      }),
    },
  );

  return {
    key: confirmData.key ?? confirmData.rawKey ?? presignData.rawKey,
    messagePublicId: confirmData.messagePublicId,
  };
}

/**
 * Guest upload flow using raw fetch with credentials for presign + confirm.
 */
export async function uploadFileGuest(opts: {
  presignUrl: string;
  confirmUrl: string;
  file: PickedFile;
  extraPresignBody?: Record<string, unknown>;
  extraConfirmBody?: Record<string, unknown>;
}): Promise<UploadResult> {
  const presignRes = await fetch(`${API_BASE}${opts.presignUrl}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      mimeType: opts.file.mimeType,
      fileSize: opts.file.size,
      fileName: opts.file.name,
      ...opts.extraPresignBody,
    }),
  });

  if (!presignRes.ok) throw new Error("Presign failed.");
  const presignData: { uploadUrl: string; rawKey: string } = await presignRes.json();

  const blob = await fetch(opts.file.uri).then((r) => r.blob());
  const uploadRes = await fetch(presignData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": opts.file.mimeType },
    body: blob,
  });

  if (!uploadRes.ok) throw new Error("Upload to storage failed.");

  const confirmRes = await fetch(`${API_BASE}${opts.confirmUrl}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      rawKey: presignData.rawKey,
      ...opts.extraConfirmBody,
    }),
  });

  if (!confirmRes.ok) throw new Error("Confirm failed.");
  const confirmData = await confirmRes.json();

  return {
    key: confirmData.key ?? confirmData.rawKey ?? presignData.rawKey,
    messagePublicId: confirmData.messagePublicId,
  };
}
