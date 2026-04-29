import { api } from "./client";
import { queueUpload } from "@/lib/offline-db";

export interface UploadResult {
  url: string;
  filename: string;
  content_type: string;
  size: string;
}

const ABS_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

/** Convert a relative `/uploads/...` URL into an absolute URL pointing at the API base. */
export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return ABS_BASE_URL ? `${ABS_BASE_URL}${url}` : url;
}

export async function uploadBlob(blob: Blob, filename: string): Promise<UploadResult> {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const { data } = await api.post("/api/uploads", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadDataUrl(dataUrl: string, filename: string): Promise<UploadResult> {
  const blob = await (await fetch(dataUrl)).blob();
  return uploadBlob(blob, filename);
}

/**
 * Upload result that may either be the live server URL (online path) or a
 * local pending upload record (offline path). Capture flow uses this so we can
 * keep the wizard usable without a network.
 */
export interface UploadOrQueueResult {
  /** server-side relative URL like /uploads/abc.jpg, present only when uploaded */
  url?: string;
  /** local Dexie upload id, present only when queued for later sync */
  pendingUploadId?: number;
  /** preview URL the UI can render immediately (object URL when offline) */
  previewUrl: string;
}

export async function uploadBlobOrQueue(
  blob: Blob,
  filename: string
): Promise<UploadOrQueueResult> {
  if (navigator.onLine) {
    try {
      const r = await uploadBlob(blob, filename);
      return { url: r.url, previewUrl: absoluteUrl(r.url) || URL.createObjectURL(blob) };
    } catch (e) {
      // fall through to queue
      // eslint-disable-next-line no-console
      console.warn("upload failed, queueing", e);
    }
  }
  const id = await queueUpload(blob, filename, blob.type || "application/octet-stream");
  return {
    pendingUploadId: id as number,
    previewUrl: URL.createObjectURL(blob),
  };
}

export async function uploadDataUrlOrQueue(
  dataUrl: string,
  filename: string
): Promise<UploadOrQueueResult> {
  const blob = await (await fetch(dataUrl)).blob();
  return uploadBlobOrQueue(blob, filename);
}
