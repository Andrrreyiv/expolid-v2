import axios from "axios";

const baseURL =
  (import.meta as { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL ||
  "http://localhost:8765";

export const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      if (window.location.pathname !== "/signin" && window.location.pathname !== "/signup") {
        window.location.href = "/signin";
      }
    }
    return Promise.reject(err);
  },
);

export const apiBaseURL = baseURL;

// ----- Types -----
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id: string;
}

export interface Company {
  id: string;
  name: string;
  email_signature?: string | null;
}

export interface Exhibition {
  id: string;
  name: string;
  city?: string | null;
  venue?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
}

export interface ContactMedia {
  id: string;
  kind: string;
  file_path: string;
  mime_type?: string | null;
  transcript?: string | null;
}

export interface Contact {
  id: string;
  exhibition_id?: string | null;
  owner_user_id: string;
  assigned_user_id?: string | null;
  name: string;
  contact_company?: string | null;
  role_title?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  telegram?: string | null;
  whatsapp?: string | null;
  linkedin?: string | null;
  contact_type: string;
  status: string;
  summary?: string | null;
  agreements?: string | null;
  next_step?: string | null;
  reminder_at?: string | null;
  voice_transcript?: string | null;
  notes_raw?: string | null;
  ai_score?: number | null;
  ai_score_reason?: string | null;
  talked_to_card_owner: boolean;
  talked_to_name?: string | null;
  talked_to_role?: string | null;
  linked_contact_id?: string | null;
  pavilion?: string | null;
  stand?: string | null;
  qualification_template_id?: string | null;
  qualification_answers?: Record<string, unknown> | null;
  consent_given_at?: string | null;
  consent_text_version?: string | null;
  consent_source?: string | null;
  erased_at?: string | null;
  capture_source?: string | null;
  badge_id?: string | null;
  enrichment_data?: Record<string, unknown> | null;
  enriched_at?: string | null;
  created_at: string;
  updated_at: string;
  media: ContactMedia[];
}

export interface QualificationOption {
  value: string;
  label: string;
  score?: number;
}

export interface QualificationQuestion {
  id: string;
  type: "single" | "multi" | "rating" | "text" | "number" | "bool";
  text: string;
  required?: boolean;
  options?: QualificationOption[];
  branch?: { if_value?: string; goto?: string };
  score_weight?: number;
}

export interface QualificationTemplate {
  id: string;
  name: string;
  questions: QualificationQuestion[];
  is_default: boolean;
  created_at: string;
}

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  conditions: Record<string, unknown>;
  action_type: "assign" | "round_robin" | "tag";
  action_data: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface DuplicateCandidate {
  id: string;
  name: string;
  contact_company?: string | null;
  email?: string | null;
  phone?: string | null;
  match_reasons: string[];
  score: number;
  created_at: string;
}

export interface BadgeParseResponse {
  name?: string | null;
  contact_company?: string | null;
  role_title?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  telegram?: string | null;
  badge_id?: string | null;
  capture_source: string;
  raw_payload: string;
}

export interface Task {
  id: string;
  contact_id?: string | null;
  assignee_user_id?: string | null;
  title: string;
  due_date?: string | null;
  is_done: boolean;
  done_at?: string | null;
  created_at: string;
}

export interface FollowUp {
  id: string;
  contact_id: string;
  kind: string;
  personalization?: string | null;
  subject?: string | null;
  body?: string | null;
  status: string;
  sent_at?: string | null;
  created_at: string;
}

export interface ProposalTemplate {
  id: string;
  kind: string;
  name: string;
  body: string;
  is_default: boolean;
}

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
}

export interface DashboardStats {
  total_contacts: number;
  hot_contacts: number;
  warm_contacts: number;
  cold_contacts: number;
  total_tasks: number;
  overdue_tasks: number;
  avg_followup_hours?: number | null;
  contacts_today: number;
  contacts_by_user: { name: string; count: number }[];
  by_status: { hot: number; warm: number; cold: number };
}
