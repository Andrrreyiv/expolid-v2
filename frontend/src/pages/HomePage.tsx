import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Mic,
  Users,
  ListChecks,
  AlertTriangle,
  Send,
  CheckCheck,
} from "lucide-react";
import { listExhibitions } from "@/api/exhibitions";
import { fetchStats } from "@/api/dashboard";
import { useAuth } from "@/store/auth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";

const STATUS_LABEL: Record<string, string> = {
  hot: "Горячих",
  warm: "Тёплых",
  cold: "Холодных",
  won: "Выигрыш",
  lost: "Потеряно",
  new: "Новых",
};
const STATUS_COLOR: Record<string, string> = {
  hot: "bg-rose-500",
  warm: "bg-amber-500",
  cold: "bg-sky-500",
  won: "bg-emerald-500",
  lost: "bg-slate-400",
  new: "bg-slate-300",
};

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const exhibitionsQ = useQuery({ queryKey: ["exhibitions"], queryFn: listExhibitions });
  const statsQ = useQuery({ queryKey: ["stats"], queryFn: fetchStats });

  const activeExhibition = exhibitionsQ.data?.find((e) => e.id === user?.active_exhibition_id);
  const stats = statsQ.data;

  const maxStatus = Math.max(1, ...(stats?.contacts_by_status.map((s) => s.count) ?? [0]));

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="ЭкспоЛид" subtitle="Захват контактов на выставках" />

      <div className="px-4 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          {activeExhibition ? (
            <div>
              <p className="text-xs text-slate-500">Активная выставка</p>
              <p className="font-semibold text-slate-900 truncate">{activeExhibition.name}</p>
              {activeExhibition.location && (
                <p className="text-xs text-slate-500 mt-0.5">{activeExhibition.location}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Нет активной выставки</p>
              <Button variant="secondary" size="sm" onClick={() => navigate("/settings")}>
                Выбрать
              </Button>
            </div>
          )}
        </div>

        <Button fullWidth size="lg" onClick={() => navigate("/capture")} className="!h-16">
          <Mic size={22} /> Записать контакт
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            icon={<Users size={18} className="text-amber-600" />}
            label="Контактов"
            value={stats?.contacts_total ?? 0}
            sub={
              stats?.contacts_today !== undefined
                ? `+${stats.contacts_today} сегодня`
                : undefined
            }
            onClick={() => navigate("/contacts")}
          />
          <KpiCard
            icon={<ListChecks size={18} className="text-amber-600" />}
            label="Задач открыто"
            value={stats?.tasks_open ?? 0}
            sub={
              stats && stats.tasks_overdue > 0 ? `${stats.tasks_overdue} просрочено` : undefined
            }
            onClick={() => navigate("/tasks")}
          />
          <KpiCard
            icon={<Send size={18} className="text-emerald-600" />}
            label="Follow-up"
            value={stats?.followups_total ?? 0}
            sub={
              stats?.followups_sent !== undefined
                ? `${stats.followups_sent} отправлено`
                : undefined
            }
          />
          <KpiCard
            icon={<AlertTriangle size={18} className="text-rose-600" />}
            label="На активной выст."
            value={stats?.contacts_active_exhibition ?? 0}
          />
          <KpiCard
            icon={<Send size={18} className="text-indigo-600" />}
            label="Среднее до follow-up"
            value={
              stats?.avg_followup_hours != null
                ? formatHours(stats.avg_followup_hours)
                : "—"
            }
            sub={
              stats?.avg_followup_hours != null && stats.followups_sent > 0
                ? `по ${stats.followups_sent} отправл.`
                : undefined
            }
          />
        </div>

        {stats && stats.contacts_by_status.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-900">По статусам</p>
            {stats.contacts_by_status.map((row) => (
              <div key={row.key}>
                <div className="flex justify-between text-xs text-slate-600 mb-1">
                  <span>{STATUS_LABEL[row.key] ?? row.key}</span>
                  <span>{row.count}</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${STATUS_COLOR[row.key] ?? "bg-slate-400"}`}
                    style={{ width: `${(row.count / maxStatus) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {stats && stats.top_users.length > 1 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-900">Топ команды</p>
            {stats.top_users.map((u, i) => (
              <div key={u.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">
                  {i + 1}. {u.name}
                </span>
                <span className="font-semibold text-slate-900 inline-flex items-center gap-1">
                  <CheckCheck size={14} className="text-emerald-600" /> {u.count}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pt-4">Made by Devin · v0.3.0</p>
      </div>
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} мин`;
  if (h < 48) return `${h.toFixed(1)} ч`;
  return `${(h / 24).toFixed(1)} д`;
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="bg-white border border-slate-200 rounded-xl p-4 text-left active:bg-slate-50 disabled:cursor-default"
    >
      {icon}
      <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </button>
  );
}
