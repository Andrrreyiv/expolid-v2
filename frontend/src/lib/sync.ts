import { api } from "@/api/client";
import { db, type PendingContact, type PendingUpload } from "./offline-db";

let syncing = false;
const listeners = new Set<() => void>();

export function onSyncChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify() {
  listeners.forEach((cb) => cb());
}

async function uploadOne(rec: PendingUpload): Promise<string> {
  const fd = new FormData();
  fd.append("file", rec.blob, rec.filename);
  const { data } = await api.post("/api/uploads", fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url as string;
}

async function syncContact(rec: PendingContact, urlByUploadId: Map<number, string>) {
  const payload = { ...rec.payload };
  for (const ref of rec.uploadRefs) {
    const url = urlByUploadId.get(ref.uploadId);
    if (!url) {
      throw new Error(`Upload ${ref.uploadId} not yet synced`);
    }
    payload[ref.field] = url;
  }
  await api.post("/api/contacts", payload);
}

export async function syncNow(): Promise<{ uploadsSynced: number; contactsSynced: number; error?: string }> {
  if (syncing) return { uploadsSynced: 0, contactsSynced: 0, error: "already syncing" };
  syncing = true;
  notify();
  let uploadsSynced = 0;
  let contactsSynced = 0;
  try {
    // 1. drain pending uploads
    const uploads = await db.uploads.toArray();
    const urlByUploadId = new Map<number, string>();
    for (const u of uploads) {
      if (u.serverUrl) {
        urlByUploadId.set(u.id!, u.serverUrl);
        continue;
      }
      try {
        const url = await uploadOne(u);
        urlByUploadId.set(u.id!, url);
        // mark synced (keep for matching, but we'll clean below)
        u.serverUrl = url;
        await db.uploads.put(u);
        uploadsSynced++;
      } catch (e) {
        // bail on first failure (likely offline)
        throw e;
      }
    }

    // 2. drain pending contacts whose uploads are all done
    const contacts = await db.contacts.toArray();
    for (const c of contacts) {
      const allReady = c.uploadRefs.every((r) => urlByUploadId.has(r.uploadId));
      if (!allReady) continue;
      try {
        await syncContact(c, urlByUploadId);
        await db.contacts.delete(c.id!);
        contactsSynced++;
      } catch (e) {
        c.attempts = (c.attempts ?? 0) + 1;
        c.lastError = (e as Error).message;
        await db.contacts.put(c);
        // continue with next contact
      }
    }

    // 3. clean uploads no longer referenced by any pending contact
    const remainingContacts = await db.contacts.toArray();
    const refsLeft = new Set<number>();
    for (const c of remainingContacts) {
      for (const r of c.uploadRefs) refsLeft.add(r.uploadId);
    }
    const uploadIds = Array.from(urlByUploadId.keys());
    for (const id of uploadIds) {
      if (!refsLeft.has(id)) {
        await db.uploads.delete(id);
      }
    }
  } catch (e) {
    return { uploadsSynced, contactsSynced, error: (e as Error).message };
  } finally {
    syncing = false;
    notify();
  }
  return { uploadsSynced, contactsSynced };
}

export function isSyncing() {
  return syncing;
}

let initialized = false;
export function initAutoSync() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("online", () => {
    void syncNow();
  });
  // initial attempt
  if (navigator.onLine) {
    void syncNow();
  }
}
