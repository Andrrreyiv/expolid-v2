import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, LogOut, CheckCircle2, Trash2 } from "lucide-react";
import {
  activateExhibition,
  createExhibition,
  deactivateExhibition,
  deleteExhibition,
  listExhibitions,
} from "@/api/exhibitions";
import { useAuth } from "@/store/auth";
import PageHeader from "@/components/PageHeader";
import PushToggle from "@/components/PushToggle";
import TeamSection from "@/components/TeamSection";
import TelegramSection from "@/components/TelegramSection";
import TemplatesSection from "@/components/TemplatesSection";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function SettingsPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const refreshMe = useAuth((s) => s.refreshMe);
  const logout = useAuth((s) => s.logout);

  const exQ = useQuery({ queryKey: ["exhibitions"], queryFn: listExhibitions });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const createMut = useMutation({
    mutationFn: () => createExhibition({ name, location: location || null }),
    onSuccess: async () => {
      setName("");
      setLocation("");
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ["exhibitions"] });
      await refreshMe();
    },
  });

  const activateMut = useMutation({
    mutationFn: (id: number) => activateExhibition(id),
    onSuccess: async () => {
      await refreshMe();
    },
  });

  const deactivateMut = useMutation({
    mutationFn: () => deactivateExhibition(),
    onSuccess: async () => {
      await refreshMe();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteExhibition(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["exhibitions"] });
      await refreshMe();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createMut.mutate();
  }

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Настройки" />

      <div className="px-4 space-y-4">
        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">Выставки</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowForm((s) => !s)}
              aria-label="Добавить выставку"
            >
              <Plus size={18} /> Добавить
            </Button>
          </div>

          {showForm && (
            <form onSubmit={onSubmit} className="mt-3 space-y-2">
              <Input
                placeholder="Название (например, Иннопром 2026)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                placeholder="Город / площадка (необязательно)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <Button type="submit" fullWidth size="md" disabled={createMut.isPending}>
                {createMut.isPending ? "Создание..." : "Создать"}
              </Button>
            </form>
          )}

          <div className="mt-3 space-y-2">
            {exQ.data?.length === 0 && (
              <p className="text-sm text-slate-500">Нет выставок. Добавьте первую.</p>
            )}
            {exQ.data?.map((ex) => {
              const isActive = ex.id === user?.active_exhibition_id;
              return (
                <div
                  key={ex.id}
                  className={`rounded-lg border p-3 flex items-center justify-between gap-2 ${
                    isActive ? "border-brand bg-brand/5" : "border-slate-200"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{ex.name}</p>
                    {ex.location && (
                      <p className="text-xs text-slate-500 truncate">{ex.location}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isActive ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => deactivateMut.mutate()}
                      >
                        <CheckCircle2 size={16} /> Активна
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => activateMut.mutate(ex.id)}
                      >
                        Сделать активной
                      </Button>
                    )}
                    <button
                      className="p-2 text-slate-400 hover:text-rose-600"
                      onClick={() => {
                        if (confirm(`Удалить «${ex.name}»? Контакты останутся, но без привязки.`))
                          deleteMut.mutate(ex.id);
                      }}
                      aria-label="Удалить"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <TeamSection />

        <TemplatesSection />

        <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-slate-900">Уведомления</p>
          <PushToggle />
        </section>

        <TelegramSection />

        <section className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="font-semibold text-slate-900">Аккаунт</p>
          <p className="text-sm text-slate-500 mt-1">{user?.email}</p>
          <p className="text-xs text-slate-400 mt-0.5">Роль: {user?.role}</p>
          <Button variant="danger" fullWidth className="mt-3" onClick={logout}>
            <LogOut size={18} /> Выйти
          </Button>
        </section>
      </div>
    </div>
  );
}
