import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy } from "lucide-react";
import {
  inviteMember,
  listTeam,
  removeMember,
  setRole,
  type InviteResult,
  type TeamMember,
} from "@/api/team";
import { useAuth } from "@/store/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const ROLES: { value: TeamMember["role"]; label: string }[] = [
  { value: "owner", label: "Владелец" },
  { value: "manager", label: "Менеджер" },
  { value: "staff", label: "Сотрудник" },
];

export default function TeamSection() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const teamQ = useQuery({ queryKey: ["team"], queryFn: listTeam });
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRoleNew] = useState<TeamMember["role"]>("staff");
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);

  const inviteMut = useMutation({
    mutationFn: () => inviteMember({ email, name, role }),
    onSuccess: (data) => {
      setLastInvite(data);
      setEmail("");
      setName("");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });

  const roleMut = useMutation({
    mutationFn: ({ id, role }: { id: number; role: TeamMember["role"] }) => setRole(id, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });

  const delMut = useMutation({
    mutationFn: (id: number) => removeMember(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team"] }),
  });

  const isOwner = me?.role === "owner";
  const canInvite = me?.role === "owner" || me?.role === "manager";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !name.trim()) return;
    inviteMut.mutate();
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-900">Команда</p>
        {canInvite && (
          <Button size="sm" variant="ghost" onClick={() => setShowForm((s) => !s)}>
            <Plus size={16} /> Пригласить
          </Button>
        )}
      </div>

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-2">
          <Input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            placeholder="имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <select
            className="w-full p-2 rounded-lg border border-slate-300 text-sm"
            value={role}
            onChange={(e) => setRoleNew(e.target.value as TeamMember["role"])}
          >
            {ROLES.filter((r) => isOwner || r.value !== "owner").map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <Button type="submit" fullWidth size="sm" disabled={inviteMut.isPending}>
            {inviteMut.isPending ? "..." : "Создать"}
          </Button>
          {inviteMut.error && (
            <p className="text-rose-600 text-xs">
              {(inviteMut.error as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail ?? "Ошибка"}
            </p>
          )}
        </form>
      )}

      {lastInvite && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-xs text-emerald-800">
          <p className="font-medium mb-1">Учётка создана для {lastInvite.email}</p>
          <div className="flex items-center gap-2">
            <code className="bg-white px-2 py-1 rounded border border-emerald-200 text-slate-900">
              {lastInvite.initial_password}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(lastInvite.initial_password)}
              className="p-1 hover:text-emerald-900"
              aria-label="Копировать"
            >
              <Copy size={14} />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-emerald-700">
            Передайте пользователю — пусть сменит при первом входе.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {teamQ.data?.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">
                {m.name}
                {m.id === me?.id && <span className="text-xs text-slate-400 ml-1">— это вы</span>}
              </p>
              <p className="text-xs text-slate-500 truncate">{m.email}</p>
            </div>
            {isOwner && m.id !== me?.id ? (
              <select
                className="text-xs h-8 px-1 rounded border border-slate-200 bg-white"
                value={m.role}
                onChange={(e) =>
                  roleMut.mutate({
                    id: m.id,
                    role: e.target.value as TeamMember["role"],
                  })
                }
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-slate-500">
                {ROLES.find((r) => r.value === m.role)?.label ?? m.role}
              </span>
            )}
            {!m.is_active && <span className="text-xs text-rose-600">отключён</span>}
            {isOwner && m.id !== me?.id && m.is_active && (
              <button
                onClick={() => {
                  if (confirm(`Отключить ${m.name}?`)) delMut.mutate(m.id);
                }}
                className="p-1 text-slate-400 hover:text-rose-600"
                aria-label="Удалить"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
