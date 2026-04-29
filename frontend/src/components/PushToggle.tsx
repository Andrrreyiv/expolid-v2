import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  disablePush,
  enablePush,
  getCurrentPushSubscription,
  isPushSupported,
} from "@/lib/push";

export default function PushToggle() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const ok = await isPushSupported();
      setSupported(ok);
      if (ok) {
        const sub = await getCurrentPushSubscription();
        setSubscribed(!!sub);
      }
    })();
  }, []);

  if (supported === false) {
    return (
      <p className="text-xs text-slate-500 mt-1">Push не поддерживается этим браузером.</p>
    );
  }
  if (supported === null) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (subscribed) {
        await disablePush();
        setSubscribed(false);
      } else {
        const r = await enablePush();
        if (!r.ok) {
          setError(r.reason ?? "Ошибка");
        } else {
          setSubscribed(true);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button
        variant={subscribed ? "secondary" : "primary"}
        fullWidth
        onClick={toggle}
        disabled={busy}
      >
        {subscribed ? <BellOff size={16} /> : <Bell size={16} />}{" "}
        {subscribed ? "Отключить уведомления" : "Включить уведомления"}
      </Button>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {!subscribed && !error && (
        <p className="text-xs text-slate-500">
          Будем уведомлять о новых контактах коллег и задачах, назначенных на вас.
        </p>
      )}
    </div>
  );
}
