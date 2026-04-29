import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listTasks, updateTask } from "@/api/tasks";
import { listContacts } from "@/api/contacts";
import PageHeader from "@/components/PageHeader";

const TABS = [
  { value: "open", label: "Открытые" },
  { value: "done", label: "Сделано" },
  { value: "all", label: "Все" },
] as const;

export default function TasksPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("open");

  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: () => listTasks() });
  const contactsQ = useQuery({ queryKey: ["contacts"], queryFn: () => listContacts() });

  const contactsById = useMemo(() => {
    const m = new Map<number, string>();
    contactsQ.data?.forEach((c) =>
      m.set(c.id, c.name || c.company || `Контакт #${c.id}`)
    );
    return m;
  }, [contactsQ.data]);

  const filtered = useMemo(() => {
    const list = tasksQ.data ?? [];
    if (tab === "all") return list;
    return list.filter((t) => t.status === tab);
  }, [tasksQ.data, tab]);

  const toggleMut = useMutation({
    mutationFn: (t: { id: number; status: string }) =>
      updateTask(t.id, { status: t.status === "done" ? "open" : "done" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Задачи" subtitle={`Всего: ${filtered.length}`} />
      <div className="px-4">
        <div className="flex gap-1 mb-3">
          {TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-1 h-9 rounded-lg text-sm ${
                tab === t.value ? "bg-brand text-white" : "bg-white text-slate-700 border border-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-500">Нет задач.</p>
          )}
          {filtered.map((t) => {
            const overdue =
              t.status !== "done" && t.due_date && new Date(t.due_date).getTime() < Date.now();
            return (
              <div
                key={t.id}
                className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-2"
              >
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  onChange={() => toggleMut.mutate(t)}
                  className="mt-0.5 w-4 h-4"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${
                      t.status === "done" ? "line-through text-slate-400" : "text-slate-900"
                    }`}
                  >
                    {t.title}
                  </p>
                  <Link
                    to={`/contacts/${t.contact_id}`}
                    className="text-xs text-brand hover:underline"
                  >
                    {contactsById.get(t.contact_id) ?? `Контакт #${t.contact_id}`}
                  </Link>
                  {t.due_date && (
                    <p
                      className={`text-xs ${
                        overdue ? "text-rose-600 font-medium" : "text-slate-500"
                      }`}
                    >
                      {new Date(t.due_date).toLocaleString("ru-RU", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {overdue ? " · просрочено" : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
