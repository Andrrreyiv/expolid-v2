import { api } from "./client";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "owner" | "manager" | "staff";
  organization_id: number;
  active_exhibition_id: number | null;
}

export async function register(payload: {
  name: string;
  email: string;
  password: string;
  organization_name?: string;
}): Promise<{ access_token: string }> {
  const { data } = await api.post("/api/auth/register", payload);
  return data;
}

export async function login(payload: { email: string; password: string }): Promise<{
  access_token: string;
}> {
  const { data } = await api.post("/api/auth/login", payload);
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await api.get("/api/auth/me");
  return data;
}
