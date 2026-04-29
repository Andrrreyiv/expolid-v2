import { api } from "./client";

export interface DashboardStats {
  contacts_total: number;
  contacts_today: number;
  contacts_active_exhibition: number;
  contacts_by_status: { key: string; count: number }[];
  tasks_open: number;
  tasks_overdue: number;
  followups_total: number;
  followups_sent: number;
  avg_followup_hours: number | null;
  top_users: { id: number; name: string; count: number }[];
}

export async function fetchStats(): Promise<DashboardStats> {
  const { data } = await api.get("/api/dashboard/stats");
  return data;
}
