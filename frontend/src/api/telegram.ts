import { api } from "@/api/client";

export interface TelegramStatus {
  enabled: boolean;
  bot_username: string | null;
  paired: boolean;
  chat_id: number | null;
  code: string | null;
}

export async function getStatus(): Promise<TelegramStatus> {
  const { data } = await api.get<TelegramStatus>("/api/telegram/status");
  return data;
}

export async function requestPairCode(): Promise<TelegramStatus> {
  const { data } = await api.post<TelegramStatus>("/api/telegram/pair");
  return data;
}

export async function unpair(): Promise<void> {
  await api.delete("/api/telegram/pair");
}

export async function configureBot(token: string, botUsername?: string): Promise<void> {
  await api.post("/api/telegram/configure", { token, bot_username: botUsername });
}
