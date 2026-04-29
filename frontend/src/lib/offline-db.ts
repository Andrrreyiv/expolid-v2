import Dexie, { Table } from "dexie";

export interface PendingUpload {
  id?: number;
  filename: string;
  contentType: string;
  blob: Blob;
  serverUrl?: string;
  createdAt: number;
}

export interface PendingContact {
  id?: number;
  payload: Record<string, unknown>;
  /** Maps a contact field (card_image_url / person_image_url / voice_url) to a pending upload id. */
  uploadRefs: { field: string; uploadId: number }[];
  createdAt: number;
  attempts: number;
  lastError?: string;
}

class ExpolidDB extends Dexie {
  uploads!: Table<PendingUpload, number>;
  contacts!: Table<PendingContact, number>;

  constructor() {
    super("expolid");
    this.version(1).stores({
      uploads: "++id, createdAt",
      contacts: "++id, createdAt",
    });
  }
}

export const db = new ExpolidDB();

export async function queueUpload(blob: Blob, filename: string, contentType: string) {
  return db.uploads.add({
    blob,
    filename,
    contentType,
    createdAt: Date.now(),
  });
}

export async function queueContact(
  payload: Record<string, unknown>,
  uploadRefs: { field: string; uploadId: number }[]
) {
  return db.contacts.add({
    payload,
    uploadRefs,
    createdAt: Date.now(),
    attempts: 0,
  });
}

export async function pendingCounts() {
  const [uploads, contacts] = await Promise.all([db.uploads.count(), db.contacts.count()]);
  return { uploads, contacts };
}
