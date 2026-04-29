import { api } from "./client";

export interface Exhibition {
  id: number;
  name: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_archived: boolean;
  created_at: string;
}

export async function listExhibitions(): Promise<Exhibition[]> {
  const { data } = await api.get("/api/exhibitions");
  return data;
}

export async function createExhibition(payload: {
  name: string;
  location?: string | null;
}): Promise<Exhibition> {
  const { data } = await api.post("/api/exhibitions", payload);
  return data;
}

export async function activateExhibition(id: number): Promise<void> {
  await api.post(`/api/exhibitions/${id}/activate`);
}

export async function deactivateExhibition(): Promise<void> {
  await api.post(`/api/exhibitions/deactivate`);
}

export async function deleteExhibition(id: number): Promise<void> {
  await api.delete(`/api/exhibitions/${id}`);
}
