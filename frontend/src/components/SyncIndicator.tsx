import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, RefreshCw, Cloud } from "lucide-react";
import { pendingCounts } from "@/lib/offline-db";
import { onSyncChange, syncNow } from "@/lib/sync";

export default function SyncIndicator() {
  const qc = useQueryClient();
  const [pending, setPending] = useState({ uploads: 0, contacts: 0 });
  const [online, setOnline] = useState(navigator.onLine);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setPending(await pendingCounts());
  }

  useEffect(() => {
    refresh();
    const off1 = onSyncChange(() => {
      refresh();
      qc.invalidateQueries();
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const interval = window.setInterval(refresh, 5000);
    return () => {
      off1();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(interval);
    };
  }, [qc]);

  const total = pending.contacts + pending.uploads;

  async function trigger() {
    setBusy(true);
    try {
      await syncNow();
      await refresh();
      qc.invalidateQueries();
    } finally {
      setBusy(false);
    }
  }

  if (online && total === 0) {
    return null;
  }

  return (
    <button
      onClick={trigger}
      disabled={busy || !online}
      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
        !online
          ? "bg-amber-100 text-amber-800"
          : total > 0
            ? "bg-sky-100 text-sky-800"
            : "bg-emerald-100 text-emerald-800"
      } disabled:opacity-60`}
    >
      {!online ? (
        <CloudOff size={14} />
      ) : busy ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : (
        <Cloud size={14} />
      )}
      {!online
        ? `Офлайн${total > 0 ? ` · в очереди: ${total}` : ""}`
        : total > 0
          ? `Синхр: ${total}`
          : "Онлайн"}
    </button>
  );
}
