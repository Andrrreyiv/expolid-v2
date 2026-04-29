import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Mail, Save, Send, X } from "lucide-react";
import {
  createFollowup,
  renderTemplate,
  type RenderResult,
} from "@/api/followups";
import { listTemplates, type FollowUpKind, type Template } from "@/api/templates";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Contact } from "@/api/contacts";

interface Props {
  contact: Contact;
  onClose: () => void;
}

const KINDS: { value: FollowUpKind; label: string; subtitle: string }[] = [
  { value: "email", label: "Письмо", subtitle: "Email" },
  { value: "proposal", label: "КП", subtitle: "Коммерческое предложение" },
  { value: "invitation", label: "Приглашение", subtitle: "В офис, на демо" },
  { value: "call_script", label: "Скрипт звонка", subtitle: "Подсказка для звонка" },
];

const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function extractVars(text: string): string[] {
  const set = new Set<string>();
  let m;
  while ((m = VAR_RE.exec(text)) !== null) set.add(m[1]);
  return Array.from(set);
}

const RU_LABELS: Record<string, string> = {
  name: "Имя контакта",
  company: "Компания",
  position: "Должность",
  email: "Email",
  phone: "Телефон",
  my_name: "Ваше имя",
  my_email: "Ваш email",
  event: "Название выставки/события",
  topic: "Тема",
  case: "Кейс",
  discount: "Скидка %",
  price: "Стоимость",
  scope: "Объём работ",
  deadline: "Срок",
  showroom: "Шоурум / адрес",
  showcase: "Что покажете",
  date: "Дата встречи",
  event_kind: "Что приглашаете",
};

export default function FollowUpModal({ contact, onClose }: Props) {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [kind, setKind] = useState<FollowUpKind | null>(null);
  const [tpl, setTpl] = useState<Template | null>(null);
  const [subject, setSubject] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  const [rendered, setRendered] = useState<RenderResult | null>(null);

  const tplQ = useQuery({ queryKey: ["templates"], queryFn: listTemplates });

  const filteredTemplates = useMemo(() => {
    if (!tplQ.data || !kind) return [];
    return tplQ.data.filter((t) => t.kind === kind);
  }, [tplQ.data, kind]);

  // when a template is picked, copy text into editable subject/body
  useEffect(() => {
    if (!tpl) return;
    setSubject(tpl.subject || "");
    setBody(tpl.body);
  }, [tpl]);

  const usedVars = useMemo(() => extractVars(`${subject}\n${body}`), [subject, body]);

  const renderMut = useMutation({
    mutationFn: () =>
      renderTemplate({
        contact_id: contact.id,
        subject: subject || null,
        body,
        extras,
      }),
    onSuccess: (r) => {
      setRendered(r);
      setStep(3);
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!kind || !rendered) throw new Error("not ready");
      return createFollowup({
        contact_id: contact.id,
        kind,
        subject: rendered.subject ?? null,
        body: rendered.body,
        personalization: JSON.stringify(extras),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["followups", contact.id] });
      onClose();
    },
  });

  function copyText() {
    const text = rendered?.subject
      ? `${rendered.subject}\n\n${rendered.body}`
      : rendered?.body || "";
    navigator.clipboard.writeText(text);
  }

  function openMailto() {
    if (!rendered) return;
    const to = contact.email || "";
    const params = new URLSearchParams();
    if (rendered.subject) params.set("subject", rendered.subject);
    params.set("body", rendered.body);
    window.location.href = `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, "%20")}`;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-50 w-full max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white sticky top-0 rounded-t-2xl">
          <div>
            <p className="font-semibold text-slate-900">Follow-up</p>
            <p className="text-xs text-slate-500">Шаг {step} из 3</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
            aria-label="Закрыть"
          >
            <X size={22} />
          </button>
        </header>

        <div className="p-4 space-y-3">
          {step === 1 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Что хотите подготовить?</p>
              {KINDS.map((k) => (
                <button
                  key={k.value}
                  onClick={() => {
                    setKind(k.value);
                    setStep(2);
                  }}
                  className="block w-full text-left bg-white border border-slate-200 rounded-xl p-3 hover:border-brand"
                >
                  <p className="font-semibold text-slate-900">{k.label}</p>
                  <p className="text-xs text-slate-500">{k.subtitle}</p>
                </button>
              ))}
            </div>
          )}

          {step === 2 && kind && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                Выберите шаблон или начните с пустого. Затем заполните переменные{" "}
                <code className="text-xs">{"{{var}}"}</code>.
              </p>

              {tplQ.isLoading && <p className="text-sm text-slate-500">Загрузка шаблонов...</p>}
              {filteredTemplates.length > 0 && (
                <div className="space-y-1.5">
                  {filteredTemplates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTpl(t)}
                      className={`block w-full text-left rounded-lg border p-2 ${
                        tpl?.id === t.id
                          ? "border-brand bg-brand/5"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-900">{t.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {t.subject || t.body.slice(0, 80)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  setTpl(null);
                  setSubject("");
                  setBody("");
                }}
                className="text-xs text-slate-500 underline"
              >
                Пустой шаблон
              </button>

              {kind !== "call_script" && (
                <Input
                  label="Тема"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Например: {{name}}, рад знакомству на {{event}}"
                />
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Текст</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="w-full p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand text-sm font-mono"
                  placeholder="Привет, {{name}}! ..."
                  required
                />
              </div>

              {usedVars.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-medium text-slate-700">Персонализация</p>
                  {usedVars.map((v) => {
                    const placeholder = RU_LABELS[v] ?? v;
                    return (
                      <Input
                        key={v}
                        label={placeholder}
                        value={extras[v] ?? ""}
                        onChange={(e) => setExtras((s) => ({ ...s, [v]: e.target.value }))}
                        placeholder={`{{${v}}}`}
                      />
                    );
                  })}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Назад
                </Button>
                <Button
                  onClick={() => renderMut.mutate()}
                  disabled={!body.trim() || renderMut.isPending}
                >
                  {renderMut.isPending ? "..." : "Подготовить"}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && rendered && (
            <div className="space-y-3">
              {rendered.missing_vars.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800">
                  Не заполнено: {rendered.missing_vars.join(", ")}
                </div>
              )}
              {rendered.subject && (
                <div className="bg-white border border-slate-200 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Тема</p>
                  <p className="text-sm text-slate-900 mt-1">{rendered.subject}</p>
                </div>
              )}
              <div className="bg-white border border-slate-200 rounded-xl p-3">
                <p className="text-xs text-slate-500">Текст</p>
                <pre className="text-sm text-slate-900 mt-1 whitespace-pre-wrap font-sans">
                  {rendered.body}
                </pre>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={copyText}>
                  <Copy size={16} /> Скопировать
                </Button>
                {kind === "email" && (
                  <Button onClick={openMailto}>
                    <Mail size={16} /> В почту
                  </Button>
                )}
                {kind !== "email" && (
                  <Button onClick={() => saveMut.mutate()}>
                    <Save size={16} /> Сохранить
                  </Button>
                )}
              </div>
              {kind === "email" && (
                <Button variant="ghost" fullWidth onClick={() => saveMut.mutate()}>
                  <Save size={16} /> Только сохранить
                </Button>
              )}
              <Button variant="ghost" fullWidth onClick={() => setStep(2)}>
                Назад к редактированию
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
