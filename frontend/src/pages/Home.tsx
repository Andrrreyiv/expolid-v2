import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mic, ChevronRight, Square, Loader2 } from "lucide-react";
import { api, type Company, type Contact, type DashboardStats, type Exhibition, type User } from "../api";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate } from "../lib/utils";
import { enqueueCapture, syncPending } from "../lib/offline";

export default function Home({ user, company }: { user: User; company: Company | null }) {
  const [exhibition, setExhibition] = useState<Exhibition | null>(null);
  const [recent, setRecent] = useState<Contact[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let aborted = false;
    Promise.all([
      api.get<Exhibition[]>("/api/exhibitions"),
      api.get<Contact[]>("/api/contacts"),
      api.get<DashboardStats>("/api/dashboard/stats"),
    ]).then(([ex, c, s]) => {
      if (aborted) return;
      setExhibition(ex.data.find((e) => e.is_active) ?? ex.data[0] ?? null);
      setRecent(c.data.slice(0, 5));
      setStats(s.data);
    });
    return () => {
      aborted = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold text-brand-700">ЭкспоЛид</h1>
        <p className="text-sm text-slate-500">
          Привет, {user.name}{company ? ` · ${company.name}` : ""}
        </p>
      </header>

      <div className="card p-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
          Текущая выставка
        </div>
        {exhibition ? (
          <>
            <div className="text-lg font-bold text-slate-800">{exhibition.name}</div>
            <div className="text-sm text-slate-500 flex items-center gap-2 mt-0.5">
              {exhibition.city && <span>📍 {exhibition.city}</span>}
              {exhibition.venue && <span>· {exhibition.venue}</span>}
            </div>
            {(exhibition.start_date || exhibition.end_date) && (
              <div className="text-sm text-slate-500 mt-0.5">
                📅 {formatDate(exhibition.start_date)} — {formatDate(exhibition.end_date)}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-500">
            Нет активной выставки. <Link className="text-brand-700 font-medium" to="/settings">Создать</Link>
          </div>
        )}
      </div>

      <Link to="/capture" className="btn-primary w-full text-base py-4 rounded-2xl">
        <Mic size={20} />
        Записать контакт
      </Link>
      <PushToTalk />


      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Контактов" value={stats.total_contacts} />
          <Stat label="Горячих" value={stats.hot_contacts} accent="text-rose-600" />
          <Stat label="Просрочено" value={stats.overdue_tasks} accent="text-amber-600" />
        </div>
      )}

      {stats?.avg_followup_hours != null && (
        <div className="card p-4 text-sm text-slate-700">
          <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
            Среднее время до follow-up
          </div>
          <div className="text-xl font-bold text-brand-700">
            {stats.avg_followup_hours} ч
          </div>
          <div className="text-xs text-slate-500">
            Чем меньше — тем выше конверсия. Цель — &lt;24ч.
          </div>
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-base font-semibold text-slate-700">Последние контакты</h2>
          <Link to="/contacts" className="text-sm text-brand-700">Все →</Link>
        </div>
        <div className="space-y-2">
          {recent.length === 0 && (
            <div className="text-sm text-slate-400 py-4 text-center">Пока пусто</div>
          )}
          {recent.map((c) => (
            <Link
              key={c.id}
              to={`/contacts/${c.id}`}
              className="card p-3 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center flex-shrink-0">
                  {c.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 truncate">{c.contact_company || "—"}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusBadge status={c.status} />
                <ChevronRight size={16} className="text-slate-400" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function PushToTalk() {
  const nav = useNavigate();
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<number | null>(null);

  const start = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 200) {
          setErr("Запись слишком короткая");
          return;
        }
        await submit(blob);
      };
      mr.start();
      mrRef.current = mr;
      setRecording(true);
      setSecs(0);
      intervalRef.current = window.setInterval(() => setSecs((s) => s + 1), 1000);
    } catch {
      setErr("Нет доступа к микрофону");
    }
  };

  const stop = () => {
    setRecording(false);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    mrRef.current?.stop();
  };

  const submit = async (blob: Blob) => {
    setBusy(true);
    const file = new File([blob], `quick-${Date.now()}.webm`, { type: "audio/webm" });
    const fd = new FormData();
    fd.append("voice", file);
    fd.append("contact_type", "client");
    fd.append("status", "warm");
    fd.append("talked_to_card_owner", "true");
    try {
      const r = await api.post<Contact>("/api/contacts/capture", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      });
      nav(`/contacts/${r.data.id}`);
    } catch (e: unknown) {
      const isNetwork =
        !(e as { response?: unknown }).response ||
        (e as { code?: string }).code === "ERR_NETWORK";
      if (isNetwork) {
        await enqueueCapture({
          talked_to_card_owner: true,
          contact_type: "client",
          status: "warm",
          voice: blob,
          voice_filename: file.name,
        });
        syncPending().catch(() => undefined);
        alert("Сохранено локально, отправится при появлении сети.");
      } else {
        setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Не удалось сохранить");
      }
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <button disabled className="btn-secondary w-full py-3 rounded-2xl">
        <Loader2 className="animate-spin" size={18} /> Обрабатываю…
      </button>
    );
  }
  return (
    <>
      {recording ? (
        <button onClick={stop} className="btn-danger w-full py-3 rounded-2xl">
          <Square size={18} fill="currentColor" /> Остановить ({secs}с)
        </button>
      ) : (
        <button onClick={start} className="btn-secondary w-full py-3 rounded-2xl text-sm">
          <Mic size={16} /> Быстрая голосовая заметка
        </button>
      )}
      {err && <div className="text-rose-600 text-xs mt-1">{err}</div>}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card p-3 text-center">
      <div className={`text-2xl font-bold ${accent ?? "text-slate-800"}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
