import { getToken } from "@/api/auth-storage";

const ABS_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export type StreamHandler = (event: { type: string; data: unknown }) => void;

let source: EventSource | null = null;
let currentToken: string | null = null;
let backoff = 1000;

export function startStream(handler: StreamHandler) {
  stopStream();
  const token = getToken();
  if (!token) return;
  currentToken = token;
  const url = `${ABS_BASE_URL}/api/stream?token=${encodeURIComponent(token)}`;
  source = new EventSource(url);
  const dispatch = (type: string) => (e: MessageEvent) => {
    try {
      handler({ type, data: e.data ? JSON.parse(e.data) : null });
    } catch {
      handler({ type, data: e.data });
    }
  };
  for (const t of [
    "hello",
    "contact.created",
    "contact.updated",
    "contact.deleted",
    "task.created",
    "task.updated",
    "task.deleted",
    "followup.created",
    "followup.sent",
    "followup.deleted",
  ]) {
    source.addEventListener(t, dispatch(t));
  }
  source.onopen = () => {
    backoff = 1000;
  };
  source.onerror = () => {
    if (!source) return;
    source.close();
    source = null;
    // exponential reconnect, capped at 30s
    backoff = Math.min(backoff * 2, 30_000);
    setTimeout(() => {
      if (currentToken) startStream(handler);
    }, backoff);
  };
}

export function stopStream() {
  if (source) {
    source.close();
    source = null;
  }
  currentToken = null;
}
