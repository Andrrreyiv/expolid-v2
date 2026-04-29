import { api } from "./client";

export async function downloadContactsXlsx(exhibitionId?: number | null): Promise<Blob> {
  const { data } = await api.get("/api/exports/contacts.xlsx", {
    params: exhibitionId ? { exhibition_id: exhibitionId } : undefined,
    responseType: "blob",
  });
  return data;
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
