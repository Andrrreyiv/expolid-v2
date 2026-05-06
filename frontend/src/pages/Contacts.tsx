import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronRight, Mic } from "lucide-react";
import { api, type Contact } from "../api";
import { StatusBadge, TypeBadge } from "../components/StatusBadge";

export default function Contacts() {
  const [items, setItems] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  useEffect(() => {
    const params: Record<string, string> = {};
    if (q) params.q = q;
    if (statusFilter) params.status = statusFilter;
    if (typeFilter) params.contact_type = typeFilter;
    api.get<Contact[]>("/api/contacts", { params }).then((r) => setItems(r.data));
  }, [q, statusFilter, typeFilter]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Контакты</h1>
        <Link to="/capture" className="btn-primary !py-2 !px-3">
          <Mic size={16} /> Новый
        </Link>
      </header>

      <div className="card p-3 flex items-center gap-2">
        <Search size={16} className="text-slate-400 ml-1" />
        <input
          className="flex-1 outline-none bg-transparent text-sm"
          placeholder="Поиск по имени, компании, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["", "Все"],
          ["hot", "🔥 Горячие"],
          ["warm", "🟡 Тёплые"],
          ["cold", "⚪ Холодные"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatusFilter(v)}
            className={`px-3 py-1 rounded-full text-xs ${
              statusFilter === v ? "bg-brand-700 text-white" : "bg-white border border-slate-200"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["", "Все типы"],
          ["client", "Клиент"],
          ["partner", "Партнёр"],
          ["supplier", "Поставщик"],
          ["investor", "Инвестор"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTypeFilter(v)}
            className={`px-3 py-1 rounded-full text-xs ${
              typeFilter === v ? "bg-brand-700 text-white" : "bg-white border border-slate-200"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {items.length === 0 && (
          <div className="text-sm text-slate-400 py-12 text-center">
            Контактов пока нет
          </div>
        )}
        {items.map((c) => (
          <Link
            to={`/contacts/${c.id}`}
            key={c.id}
            className="card p-3 flex items-center justify-between hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center flex-shrink-0">
                {c.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-medium text-slate-800 truncate">{c.name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {c.contact_company || "—"}
                  {c.role_title ? ` · ${c.role_title}` : ""}
                </div>
                <div className="flex gap-1 mt-1">
                  <StatusBadge status={c.status} />
                  <TypeBadge type={c.contact_type} />
                  {c.ai_score != null && (
                    <span className="badge bg-violet-100 text-violet-700">AI {c.ai_score}</span>
                  )}
                </div>
              </div>
            </div>
            <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
