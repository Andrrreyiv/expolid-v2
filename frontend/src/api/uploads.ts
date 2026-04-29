import { api } from "./client";

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
