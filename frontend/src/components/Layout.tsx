import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Home, Users, Clock, Settings as SettingsIcon, FileSpreadsheet, WifiOff, CloudUpload, Check, Sparkles } from "lucide-react";
import { pendingCount, syncPending } from "../lib/offline";

interface LiveEvent {
  id: number;
  message: string;
}

function apiBase(): string {
  const env = (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env;
  return env?.VITE_API_BASE_URL ?? "";
}

const items = [
  { to: "/", label: "Главная", icon: Home, end: true },
  { to: "/contacts", label: "Контакты", icon: Users },
  { to: "/tasks", label: "Задачи", icon: Clock },
  { to: "/export", label: "Экспорт", icon: FileSpreadsheet },
  { to: "/settings", label: "Настройки", icon: SettingsIcon },
];

export default function Layout() {
  const [online, setOnline] = useState<boolean>(navigator.onLine);
  const [pending, setPending] = useState<number>(0);
  const [syncing, setSyncing] = useState(false);
  const [justSent, setJustSent] = useState<number>(0);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  const refreshPending = async () => setPending(await pendingCount());

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const url = `${apiBase()}/api/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    es.addEventListener("contact.created", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { name?: string; company?: string; by_user_name?: string };
        const message = `${d.by_user_name || "Коллега"}: добавил(а) ${d.name || "контакт"}${d.company ? " — " + d.company : ""}`;
        const id = Date.now() + Math.random();
        setLiveEvents((arr) => [...arr, { id, message }]);
        window.setTimeout(() => setLiveEvents((arr) => arr.filter((x) => x.id !== id)), 6000);
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      // Silent — EventSource auto-reconnects
    };
    return () => es.close();
  }, []);

  useEffect(() => {
    refreshPending();
    const tryFlush = async () => {
      setSyncing(true);
      const { sent } = await syncPending(refreshPending);
      if (sent > 0) {
        setJustSent(sent);
        window.setTimeout(() => setJustSent(0), 4000);
      }
      await refreshPending();
      setSyncing(false);
    };
    const handleOnline = () => {
      setOnline(true);
      tryFlush();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if (navigator.onLine) tryFlush();
    const interval = window.setInterval(refreshPending, 5000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-full pb-24">
      <main className="max-w-2xl mx-auto px-4 py-6">
        {!online && (
          <div className="mb-3 bg-amber-100 text-amber-800 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
            <WifiOff size={16} /> Нет соединения. Контакты сохраняются локально.
          </div>
        )}
        {online && pending > 0 && (
          <div className="mb-3 bg-blue-50 text-blue-700 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
            <CloudUpload size={16} className={syncing ? "animate-pulse" : ""} />
            В очереди: {pending}{syncing ? " (отправляются…)" : ""}
          </div>
        )}
        {justSent > 0 && (
          <div className="mb-3 bg-emerald-50 text-emerald-700 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
            <Check size={16} /> Отправлено из очереди: {justSent}
          </div>
        )}
        {liveEvents.length > 0 && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 space-y-2 w-[90%] max-w-md pointer-events-none">
            {liveEvents.map((ev) => (
              <div
                key={ev.id}
                className="bg-brand-700 text-white rounded-lg px-3 py-2 text-sm flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top"
              >
                <Sparkles size={16} className="flex-shrink-0" />
                <span className="truncate">{ev.message}</span>
              </div>
            ))}
          </div>
        )}
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 shadow-lg z-30">
        <div className="max-w-2xl mx-auto grid grid-cols-5">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2.5 text-xs gap-1 transition-colors ${
                  isActive ? "text-brand-700 font-semibold" : "text-slate-500 hover:text-slate-700"
                }`
              }
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
