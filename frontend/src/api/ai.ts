import { api } from "@/api/client";

export interface SummarizeResult {
  summary: string;
  phrases: string[];
}

export async function summarize(text: string): Promise<SummarizeResult> {
  const { data } = await api.post<SummarizeResult>("/api/ai/summarize", { text });
  return data;
}
