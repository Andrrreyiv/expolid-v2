import { api } from "@/api/client";

export async function getServerPublicKey(): Promise<string> {
  const { data } = await api.get("/api/push/public-key");
  return data.public_key;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

export async function isPushSupported(): Promise<boolean> {
  return (
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!(await isPushSupported())) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!(await isPushSupported())) {
    return { ok: false, reason: "Push не поддерживается этим браузером" };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Разрешение не выдано" };
  }
  const reg = await navigator.serviceWorker.ready;
  const publicKey = await getServerPublicKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
    });
  }
  const json = sub.toJSON();
  await api.post("/api/push/subscribe", {
    endpoint: json.endpoint,
    keys: json.keys,
  });
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  const sub = await getCurrentPushSubscription();
  if (sub) {
    const json = sub.toJSON();
    try {
      await api.post("/api/push/unsubscribe", { endpoint: json.endpoint, keys: json.keys });
    } catch {
      // ignore — we still want to unsubscribe locally
    }
    await sub.unsubscribe();
  }
}
