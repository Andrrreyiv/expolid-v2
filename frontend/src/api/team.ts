import { api } from "./client";

export interface TeamMember {
  id: number;
  email: string;
  name: string;
  role: "owner" | "manager" | "staff";
  is_active: boolean;
}

export interface InviteResult extends TeamMember {
  initial_password: string;
}

export async function listTeam(): Promise<TeamMember[]> {
  const { data } = await api.get("/api/team");
  return data;
}

export async function inviteMember(payload: {
  email: string;
  name: string;
  role: TeamMember["role"];
}): Promise<InviteResult> {
  const { data } = await api.post("/api/team/invite", payload);
  return data;
}

export async function setRole(id: number, role: TeamMember["role"]): Promise<TeamMember> {
  const { data } = await api.patch(`/api/team/${id}/role`, { role });
  return data;
}

export async function removeMember(id: number): Promise<void> {
  await api.delete(`/api/team/${id}`);
}
