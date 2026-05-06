import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUS_LABEL: Record<string, string> = {
  hot: "Горячий",
  warm: "Тёплый",
  cold: "Холодный",
};

export const TYPE_LABEL: Record<string, string> = {
  client: "Клиент",
  partner: "Партнёр",
  supplier: "Поставщик",
  investor: "Инвестор",
  other: "Другое",
};

export const FOLLOWUP_KIND_LABEL: Record<string, string> = {
  intro: "Вводное письмо",
  proposal: "КП / презентация",
  invite: "Приглашение в шоу-рум / на демо",
  call: "План звонка",
};

export function formatDate(s?: string | null): string {
  if (!s) return "";
  try {
    return new Date(s).toLocaleDateString("ru-RU");
  } catch {
    return s;
  }
}
