/**
 * Shared presign → upload → confirm utility for file attachments.
 * Used by seller conversations and case follow-ups.
 * Live chat has its own upload path in useLiveChat (with abort support).
 */

import * as DocumentPicker from "expo-document-picker";
import { customerFetch } from "./api";

export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
};

export async function pickDocument(opts?: {
  type?: string | string[];
}): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: opts?.type ?? "*/*",
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
  const presignData = await customerFetch<{
    uploadUrl: string;
    rawKey?: string;
    key?: string;
  }>(opts.presignUrl, {
    method: "POST",
    body: JSON.stringify({
      mimeType: opts.file.mimeType,
      fileSize: opts.file.size,
      fileName: opts.file.name,
      ...opts.extraPresignBody,
    }),
  });

  const presignKey = presignData.rawKey ?? presignData.key;
  if (!presignKey) throw new Error("Presign did not return a storage key.");

  const blob = await fetch(opts.file.uri).then((r) => r.blob());
  const uploadRes = await fetch(presignData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": opts.file.mimeType },
    body: blob,
  });

  if (!uploadRes.ok) throw new Error("Upload to storage failed.");

  const confirmData = await customerFetch<{
    messagePublicId?: string;
    key?: string;
    rawKey?: string;
    cleanKey?: string;
  }>(opts.confirmUrl, {
    method: "POST",
    body: JSON.stringify({
      key: presignKey,
      ...opts.extraConfirmBody,
    }),
  });

  return {
    key:
      confirmData.cleanKey ??
      confirmData.key ??
      confirmData.rawKey ??
      presignKey,
    messagePublicId: confirmData.messagePublicId,
  };
}
