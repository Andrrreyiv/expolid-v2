import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  updateTemplate,
  type FollowUpKind,
  type Template,
} from "@/api/templates";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const KINDS: { value: FollowUpKind; label: string }[] = [
  { value: "email", label: "Письмо" },
  { value: "proposal", label: "КП" },
  { value: "invitation", label: "Приглашение" },
  { value: "call_script", label: "Скрипт звонка" },
];

const KIND_LABEL: Record<FollowUpKind, string> = {
  email: "Письмо",
  proposal: "КП",
  invitation: "Приглашение",
  call_script: "Скрипт звонка",
};

export default function TemplatesSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["templates"], queryFn: listTemplates });

  const [editing, setEditing] = useState<Template | null>(null);
  const [adding, setAdding] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["templates"] });
  }

  const updMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<Template> }) =>
      updateTemplate(id, payload),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });
  const createMut = useMutation({
    mutationFn: (payload: Omit<Template, "id">) => createTemplate(payload),
    onSuccess: () => {
      setAdding(false);
      invalidate();
    },
  });
  const delMut = useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: invalidate,
  });

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-900">Шаблоны follow-up</p>
          <p className="text-xs text-slate-500">
            Используйте {`{{переменные}}`}, например {`{{name}}`}, {`{{company}}`},{" "}
            {`{{discount}}`}, {`{{showroom}}`}, {`{{meeting_date}}`}.
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setAdding((s) => !s)}>
          <Plus size={16} /> Новый
        </Button>
      </div>

      {adding && <TemplateForm onSubmit={(p) => createMut.mutate(p)} onCancel={() => setAdding(false)} />}

      <div className="space-y-2">
        {q.data?.length === 0 && !adding && (
          <p className="text-sm text-slate-500">Шаблоны появятся при первом открытии follow-up.</p>
        )}
        {q.data?.map((t) =>
          editing?.id === t.id ? (
            <TemplateForm
              key={t.id}
              initial={t}
              onSubmit={(p) => updMut.mutate({ id: t.id, payload: p })}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div key={t.id} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {t.name}{" "}
                    <span className="text-xs text-slate-500">({KIND_LABEL[t.kind]})</span>
                    {t.is_default && (
                      <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                        default
                      </span>
                    )}
                  </p>
                  {t.subject && (
                    <p className="text-xs text-slate-500 truncate">{t.subject}</p>
                  )}
                </div>
                <button
                  className="p-1 text-slate-400 hover:text-slate-700"
                  onClick={() => setEditing(t)}
                  aria-label="Редактировать"
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="p-1 text-slate-400 hover:text-rose-600"
                  onClick={() => {
                    if (confirm(`Удалить шаблон "${t.name}"?`)) delMut.mutate(t.id);
                  }}
                  aria-label="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function TemplateForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Template;
  onSubmit: (payload: Omit<Template, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<FollowUpKind>(initial?.kind ?? "email");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !body.trim()) return;
    onSubmit({
      name: name.trim(),
      kind,
      subject: subject.trim() || null,
      body: body.trim(),
      is_default: isDefault,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={kind}
          onChange={(e) => setKind(e.target.value as FollowUpKind)}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <Input
        placeholder="Тема (для письма)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />
      <textarea
        rows={6}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
        placeholder={"Текст шаблона. Используйте {{name}}, {{company}}, {{discount}} и т.п."}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        Использовать по умолчанию для типа «{KIND_LABEL[kind]}»
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          <Check size={14} /> Сохранить
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          <X size={14} /> Отмена
        </Button>
      </div>
    </form>
  );
}
