// Offline-first capture queue with IndexedDB (Dexie).
import Dexie, { type EntityTable } from "dexie";
import { api } from "../api";

export interface PendingCapture {
  id?: number;
  exhibition_id?: string;
  notes_text?: string;
  talked_to_card_owner: boolean;
  talked_to_name?: string;
  talked_to_role?: string;
  pavilion?: string;
  stand?: string;
  contact_type: string;
  status: string;
  card_image?: Blob;
  card_filename?: string;
  person_image?: Blob;
  person_filename?: string;
  voice?: Blob;
  voice_filename?: string;
  prefill_name?: string;
  prefill_phone?: string;
  prefill_email?: string;
  prefill_company?: string;
  prefill_role?: string;
  prefill_website?: string;
  prefill_telegram?: string;
  created_at: number;
  state: "pending" | "sending" | "error";
  error?: string;
  attempts: number;
}

class ExpolidDB extends Dexie {
  captures!: EntityTable<PendingCapture, "id">;
  constructor() {
    super("expolid");
    this.version(1).stores({
      captures: "++id, state, created_at",
    });
  }
}

export const db = new ExpolidDB();

export async function enqueueCapture(c: Omit<PendingCapture, "id" | "created_at" | "state" | "attempts">) {
  await db.captures.add({
    ...c,
    created_at: Date.now(),
    state: "pending",
    attempts: 0,
  });
}

export async function pendingCount(): Promise<number> {
  return db.captures.where("state").anyOf(["pending", "error"]).count();
}

let syncing = false;

export async function syncPending(onProgress?: (left: number) => void): Promise<{ sent: number; failed: number }> {
  if (syncing) return { sent: 0, failed: 0 };
  if (!navigator.onLine) return { sent: 0, failed: 0 };
  syncing = true;
  let sent = 0;
  let failed = 0;
  try {
    while (true) {
      const next = await db.captures
        .where("state")
        .anyOf(["pending", "error"])
        .first();
      if (!next) break;
      await db.captures.update(next.id!, { state: "sending" });
      try {
        const fd = new FormData();
        if (next.exhibition_id) fd.append("exhibition_id", next.exhibition_id);
        if (next.notes_text) fd.append("notes_text", next.notes_text);
        fd.append("talked_to_card_owner", String(next.talked_to_card_owner));
        if (!next.talked_to_card_owner) {
          if (next.talked_to_name) fd.append("talked_to_name", next.talked_to_name);
          if (next.talked_to_role) fd.append("talked_to_role", next.talked_to_role);
        }
        if (next.pavilion) fd.append("pavilion", next.pavilion);
        if (next.stand) fd.append("stand", next.stand);
        fd.append("contact_type", next.contact_type);
        fd.append("status", next.status);
        if (next.prefill_name) fd.append("prefill_name", next.prefill_name);
        if (next.prefill_phone) fd.append("prefill_phone", next.prefill_phone);
        if (next.prefill_email) fd.append("prefill_email", next.prefill_email);
        if (next.prefill_company) fd.append("prefill_company", next.prefill_company);
        if (next.prefill_role) fd.append("prefill_role", next.prefill_role);
        if (next.prefill_website) fd.append("prefill_website", next.prefill_website);
        if (next.prefill_telegram) fd.append("prefill_telegram", next.prefill_telegram);
        if (next.card_image) fd.append("card_image", next.card_image, next.card_filename || "card.jpg");
        if (next.person_image) fd.append("person_image", next.person_image, next.person_filename || "person.jpg");
        if (next.voice) fd.append("voice", next.voice, next.voice_filename || "voice.webm");

        await api.post("/api/contacts/capture", fd, { headers: { "Content-Type": "multipart/form-data" } });
        await db.captures.delete(next.id!);
        sent += 1;
      } catch (e: unknown) {
        const msg = (e as { message?: string }).message || String(e);
        await db.captures.update(next.id!, {
          state: "error",
          error: msg,
          attempts: (next.attempts || 0) + 1,
        });
        failed += 1;
        // Bail out to avoid hot-loop on persistent error
        if ((next.attempts || 0) >= 2) break;
      }
      onProgress?.(await pendingCount());
    }
  } finally {
    syncing = false;
  }
  return { sent, failed };
}
