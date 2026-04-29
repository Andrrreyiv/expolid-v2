import { api } from "./client";

export interface Contact {
  id: number;
  name: string | null;
  company: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  telegram: string | null;
  whatsapp: string | null;
  linkedin: string | null;
  card_belongs_to_other: boolean;
  card_owner_name: string | null;
  card_owner_position: string | null;
  card_owner_email: string | null;
  card_owner_phone: string | null;
  contact_type: string | null;
  status: string;
  pavilion: string | null;
  stand: string | null;
  note: string | null;
  card_image_url: string | null;
  person_image_url: string | null;
  voice_url: string | null;
  voice_transcript: string | null;
  ai_summary: string | null;
  ai_agreements: string | null;
  ai_next_step: string | null;
  ai_score: number | null;
  ai_score_reason: string | null;
  exhibition_id: number | null;
  organization_id: number;
  captured_by_id: number | null;
  assignee_id: number | null;
  created_at: string;
  updated_at: string;
}

export async function listContacts(exhibitionId?: number): Promise<Contact[]> {
  const { data } = await api.get("/api/contacts", {
    params: exhibitionId !== undefined ? { exhibition_id: exhibitionId } : undefined,
  });
  return data;
}

export async function createContact(payload: Partial<Contact>): Promise<Contact> {
  const { data } = await api.post("/api/contacts", payload);
  return data;
}

export async function getContact(id: number): Promise<Contact> {
  const { data } = await api.get(`/api/contacts/${id}`);
  return data;
}

export async function updateContact(id: number, payload: Partial<Contact>): Promise<Contact> {
  const { data } = await api.patch(`/api/contacts/${id}`, payload);
  return data;
}

export async function deleteContact(id: number): Promise<void> {
  await api.delete(`/api/contacts/${id}`);
}
