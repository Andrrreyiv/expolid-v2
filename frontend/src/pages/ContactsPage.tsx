import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listContacts } from "@/api/contacts";
import PageHeader from "@/components/PageHeader";

const statusColors: Record<string, string> = {
  hot: "bg-rose-100 text-rose-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-sky-100 text-sky-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-slate-100 text-slate-500",
  new: "bg-slate-100 text-slate-700",
};

export default function ContactsPage() {
  const q = useQuery({ queryKey: ["contacts"], queryFn: () => listContacts() });

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Контакты" subtitle={`Всего: ${q.data?.length ?? 0}`} />

      <div className="px-4 space-y-2">
        {q.isLoading && <p className="text-slate-500 text-sm">Загрузка...</p>}
        {q.data?.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
            Контактов пока нет. Запишите первый с главной.
          </div>
        )}
        {q.data?.map((c) => (
          <Link
            key={c.id}
            to={`/contacts/${c.id}`}
            className="block bg-white border border-slate-200 rounded-xl p-3 active:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 truncate">
                  {c.name || "(Без имени)"}
                </p>
                <p className="text-sm text-slate-500 truncate">
                  {[c.position, c.company].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-1 rounded-full ${statusColors[c.status] ?? statusColors.new}`}
              >
                {c.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
