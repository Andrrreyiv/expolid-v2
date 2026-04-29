import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Download, Search } from "lucide-react";
import { listContacts } from "@/api/contacts";
import { downloadContactsXlsx, triggerDownload } from "@/api/exports";
import { useAuth } from "@/store/auth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";

const statusColors: Record<string, string> = {
  hot: "bg-rose-100 text-rose-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-sky-100 text-sky-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-slate-100 text-slate-500",
  new: "bg-slate-100 text-slate-700",
};

export default function ContactsPage() {
  const me = useAuth((s) => s.user);
  const q = useQuery({ queryKey: ["contacts"], queryFn: () => listContacts() });
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter((c) =>
      [
        c.name,
        c.company,
        c.position,
        c.email,
        c.phone,
        c.note,
        c.card_owner_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(s)
    );
  }, [q.data, search]);

  async function exportAll() {
    setExporting(true);
    try {
      const blob = await downloadContactsXlsx();
      triggerDownload(blob, `expolid_contacts.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  async function exportActive() {
    if (!me?.active_exhibition_id) return;
    setExporting(true);
    try {
      const blob = await downloadContactsXlsx(me.active_exhibition_id);
      triggerDownload(blob, `expolid_active_exhibition.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Контакты" subtitle={`Всего: ${q.data?.length ?? 0}`} />

      <div className="px-4 space-y-2">
        <div className="relative">
          <Search size={16} className="absolute left-2.5 top-3 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени, компании, телефону..."
            className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" size="sm" onClick={exportAll} disabled={exporting}>
            <Download size={16} /> Все в Excel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={exportActive}
            disabled={exporting || !me?.active_exhibition_id}
          >
            <Download size={16} /> Активная выст.
          </Button>
        </div>

        {q.isLoading && <p className="text-slate-500 text-sm">Загрузка...</p>}
        {filtered.length === 0 && !q.isLoading && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
            {search ? "Ничего не найдено." : "Контактов пока нет. Запишите первый с главной."}
          </div>
        )}
        {filtered.map((c) => (
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
                className={`text-xs px-2 py-1 rounded-full ${
                  statusColors[c.status] ?? statusColors.new
                }`}
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
