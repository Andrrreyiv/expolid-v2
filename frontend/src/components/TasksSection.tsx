import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { createTask, deleteTask, listTasks, updateTask, type Task } from "@/api/tasks";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function TasksSection({ contactId }: { contactId: number }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const tasksQ = useQuery({
    queryKey: ["tasks", contactId],
    queryFn: () => listTasks({ contact_id: contactId }),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["tasks"] });
  }

  const createMut = useMutation({
    mutationFn: () =>
      createTask({
        title: title.trim(),
        contact_id: contactId,
        due_date: due ? new Date(due).toISOString() : null,
      }),
    onSuccess: () => {
      setTitle("");
      setDue("");
      setShowForm(false);
      invalidate();
    },
  });

  const toggleMut = useMutation({
    mutationFn: (t: Task) =>
      updateTask(t.id, { status: t.status === "done" ? "open" : "done" }),
    onSuccess: invalidate,
  });

  const delMut = useMutation({
    mutationFn: (id: number) => deleteTask(id),
    onSuccess: invalidate,
  });

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-900">Задачи</p>
        <Button size="sm" variant="ghost" onClick={() => setShowForm((s) => !s)}>
          <Plus size={16} /> Добавить
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!title.trim()) return;
            createMut.mutate();
          }}
          className="space-y-2"
        >
          <Input
            placeholder="Что сделать (например: отправить КП)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            required
          />
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          <Button type="submit" size="sm" fullWidth disabled={createMut.isPending}>
            {createMut.isPending ? "..." : "Сохранить"}
          </Button>
        </form>
      )}

      <div className="space-y-1.5">
        {tasksQ.data?.length === 0 && (
          <p className="text-sm text-slate-500">Нет задач для контакта.</p>
        )}
        {tasksQ.data?.map((t) => {
          const overdue =
            t.status !== "done" && t.due_date && new Date(t.due_date).getTime() < Date.now();
          return (
            <div
              key={t.id}
              className="flex items-start gap-2 px-2 py-1.5 rounded-lg border border-slate-200"
            >
              <input
                type="checkbox"
                checked={t.status === "done"}
                onChange={() => toggleMut.mutate(t)}
                className="mt-0.5 w-4 h-4"
              />
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm truncate ${
                    t.status === "done" ? "line-through text-slate-400" : "text-slate-900"
                  }`}
                >
                  {t.title}
                </p>
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
              <button
                onClick={() => delMut.mutate(t.id)}
                className="p-1 text-slate-400 hover:text-rose-600"
                aria-label="Удалить"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
