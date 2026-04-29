import { api } from "./client";

export type FollowUpKind = "email" | "proposal" | "invitation" | "call_script";

export interface Template {
  id: number;
  name: string;
  kind: FollowUpKind;
  subject: string | null;
  body: string;
  is_default: boolean;
}

export async function listTemplates(): Promise<Template[]> {
  const { data } = await api.get("/api/templates");
  return data;
}

export async function createTemplate(payload: Omit<Template, "id">): Promise<Template> {
  const { data } = await api.post("/api/templates", payload);
  return data;
}

export async function updateTemplate(id: number, payload: Partial<Template>): Promise<Template> {
  const { data } = await api.patch(`/api/templates/${id}`, payload);
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await api.delete(`/api/templates/${id}`);
}
