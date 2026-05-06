import { api } from "../api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function getPushStatus(): Promise<"unsupported" | "default" | "denied" | "granted" | "subscribed"> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) return "subscribed";
  return Notification.permission === "granted" ? "granted" : "default";
}

export async function subscribePush(): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return false;
  const { data } = await api.get<{ public_key: string }>("/api/push/key");
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) await existing.unsubscribe();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.public_key).buffer as ArrayBuffer,
  });
  await api.post("/api/push/subscribe", sub.toJSON());
  return true;
}

export async function unsubscribePush(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  await api.post("/api/push/unsubscribe", sub.toJSON()).catch(() => undefined);
  await sub.unsubscribe();
  return true;
}

export async function sendTestPush(): Promise<number> {
  const r = await api.post<{ sent: number }>("/api/push/test");
  return r.data.sent;
}

export async function checkOverdueNow(): Promise<{ sent: number; overdue: number }> {
  const r = await api.post<{ sent: number; overdue: number }>("/api/push/check-overdue");
  return r.data;
}
