import { api } from "./client";
import type { FollowUpKind } from "./templates";

export interface FollowUp {
  id: number;
  contact_id: number;
  kind: FollowUpKind;
  subject: string | null;
  body: string;
  personalization: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface RenderResult {
  subject: string | null;
  body: string;
  used_vars: string[];
  missing_vars: string[];
}

export async function listFollowups(contactId?: number): Promise<FollowUp[]> {
  const { data } = await api.get("/api/followups", {
    params: contactId !== undefined ? { contact_id: contactId } : undefined,
  });
  return data;
}

export async function createFollowup(payload: {
  contact_id: number;
  kind: FollowUpKind;
  subject?: string | null;
  body: string;
  personalization?: string | null;
}): Promise<FollowUp> {
  const { data } = await api.post("/api/followups", payload);
  return data;
}

export async function renderTemplate(payload: {
  contact_id: number;
  subject?: string | null;
  body: string;
  extras: Record<string, string>;
}): Promise<RenderResult> {
  const { data } = await api.post("/api/followups/render", payload);
  return data;
}

export async function markSent(id: number): Promise<FollowUp> {
  const { data } = await api.post(`/api/followups/${id}/sent`);
  return data;
}

export async function deleteFollowup(id: number): Promise<void> {
  await api.delete(`/api/followups/${id}`);
}
