import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Clock } from "lucide-react";
import { api, type Contact, type Task } from "../api";
import { formatDate } from "../lib/utils";

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contactMap, setContactMap] = useState<Record<string, Contact>>({});

  const reload = () => {
    api.get<Task[]>("/api/tasks").then((r) => setTasks(r.data));
    api.get<Contact[]>("/api/contacts").then((r) => {
      const m: Record<string, Contact> = {};
      for (const c of r.data) m[c.id] = c;
      setContactMap(m);
    });
  };

  useEffect(() => { reload(); }, []);

  const toggle = async (t: Task) => {
    await api.patch(`/api/tasks/${t.id}`, { is_done: !t.is_done });
    reload();
  };

  const overdue = (t: Task) =>
    t.due_date && !t.is_done && new Date(t.due_date) < new Date();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Задачи</h1>
      {tasks.length === 0 && (
        <div className="text-sm text-slate-400 py-12 text-center">Задач пока нет</div>
      )}
      <div className="space-y-2">
        {tasks.map((t) => {
          const c = t.contact_id ? contactMap[t.contact_id] : null;
          return (
            <div key={t.id} className="card p-3 flex items-start gap-3">
              <button
                onClick={() => toggle(t)}
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  t.is_done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300"
                }`}
              >
                {t.is_done && <Check size={14} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${t.is_done ? "line-through text-slate-400" : "text-slate-800"}`}>
                  {t.title}
                </div>
                {c && (
                  <Link to={`/contacts/${c.id}`} className="text-xs text-brand-700">
                    {c.name}{c.contact_company ? ` · ${c.contact_company}` : ""}
                  </Link>
                )}
                {t.due_date && (
                  <div className={`text-xs mt-0.5 flex items-center gap-1 ${overdue(t) ? "text-rose-600 font-semibold" : "text-slate-500"}`}>
                    <Clock size={11} /> {formatDate(t.due_date)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
