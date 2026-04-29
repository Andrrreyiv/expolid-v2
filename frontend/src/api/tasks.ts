import { api } from "./client";

export interface Task {
  id: number;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "open" | "done" | "cancelled";
  contact_id: number;
  assignee_id: number | null;
  created_at: string;
  completed_at: string | null;
}

export async function listTasks(filters?: {
  status?: string;
  contact_id?: number;
  assignee_id?: number;
}): Promise<Task[]> {
  const { data } = await api.get("/api/tasks", { params: filters });
  return data;
}

export async function createTask(payload: {
  title: string;
  description?: string | null;
  due_date?: string | null;
  contact_id: number;
  assignee_id?: number | null;
}): Promise<Task> {
  const { data } = await api.post("/api/tasks", payload);
  return data;
}

export async function updateTask(id: number, payload: Partial<Task>): Promise<Task> {
  const { data } = await api.patch(`/api/tasks/${id}`, payload);
  return data;
}

export async function deleteTask(id: number): Promise<void> {
  await api.delete(`/api/tasks/${id}`);
}
