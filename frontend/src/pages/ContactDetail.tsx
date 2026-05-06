import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Pencil, Trash2, Phone, Mail, Globe, Send, Loader2, Save, MessageSquare,
  Sparkles, Calendar, FileText
} from "lucide-react";
import { api, apiBaseURL, type Contact, type FollowUp, type ProposalTemplate } from "../api";
import { StatusBadge, TypeBadge } from "../components/StatusBadge";
import { FOLLOWUP_KIND_LABEL, formatDate } from "../lib/utils";

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [editing, setEditing] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!id) return;
    const r = await api.get<Contact>(`/api/contacts/${id}`);
    setContact(r.data);
    const fu = await api.get<FollowUp[]>(`/api/followups/by-contact/${id}`);
    setFollowups(fu.data);
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!contact) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const remove = async () => {
    if (!confirm("Удалить контакт?")) return;
    await api.delete(`/api/contacts/${contact.id}`);
    nav("/contacts");
  };

  const cardMedia = contact.media.find((m) => m.kind === "card");
  const personMedia = contact.media.find((m) => m.kind === "person");
  const voiceMedia = contact.media.find((m) => m.kind === "voice");

  if (editing) {
    return <EditForm contact={contact} onSave={() => { setEditing(false); reload(); }} onCancel={() => setEditing(false)} />;
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Link to="/contacts" className="text-slate-500"><ArrowLeft size={20} /></Link>
        <h1 className="text-lg font-bold text-slate-800 truncate flex-1 mx-3">{contact.name}</h1>
        <button onClick={() => setEditing(true)} className="text-slate-500"><Pencil size={18} /></button>
      </header>

      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center flex-shrink-0">
            {contact.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-slate-800">{contact.name}</div>
            {contact.role_title && <div className="text-sm text-slate-500">{contact.role_title}</div>}
            {contact.contact_company && <div className="text-sm text-slate-500">🏢 {contact.contact_company}</div>}
            <div className="flex gap-1 flex-wrap mt-2">
              <StatusBadge status={contact.status} />
              <TypeBadge type={contact.contact_type} />
              {contact.ai_score != null && (
                <span className="badge bg-violet-100 text-violet-700">
                  <Sparkles size={10} /> AI {contact.ai_score}/100
                </span>
              )}
            </div>
          </div>
        </div>

        {!contact.talked_to_card_owner && (
          <div className="mt-3 text-xs bg-amber-50 text-amber-700 rounded-lg p-2 flex gap-2">
            <span>👥</span>
            <div>
              <div className="font-semibold">Контакт через коллегу</div>
              <div>Визитка: {contact.name}. Разговор был с: {contact.talked_to_name}{contact.talked_to_role ? `, ${contact.talked_to_role}` : ""}.</div>
            </div>
          </div>
        )}

        {contact.ai_score_reason && (
          <div className="mt-3 text-xs text-slate-600 italic border-l-2 border-violet-200 pl-2">
            {contact.ai_score_reason}
          </div>
        )}
      </div>

      <div className="card divide-y divide-slate-100">
        {contact.phone && <ContactRow icon={<Phone size={16} />} value={contact.phone} href={`tel:${contact.phone}`} />}
        {contact.email && <ContactRow icon={<Mail size={16} />} value={contact.email} href={`mailto:${contact.email}`} />}
        {contact.website && <ContactRow icon={<Globe size={16} />} value={contact.website} href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`} />}
        {contact.telegram && <ContactRow icon={<MessageSquare size={16} />} value={`Telegram: ${contact.telegram}`} />}
        {contact.whatsapp && <ContactRow icon={<MessageSquare size={16} />} value={`WhatsApp: ${contact.whatsapp}`} />}
      </div>

      <button onClick={() => setDraftOpen(true)} className="btn-primary w-full">
        <Send size={16} /> Подготовить follow-up
      </button>
      <PushToAmoButton contactId={contact.id} />
      <PushToBitrixButton contactId={contact.id} />
      <PushToHubspotButton contactId={contact.id} />
      <EnrichmentBlock contact={contact} onUpdated={reload} />

      {draftOpen && (
        <FollowupDrafter
          contact={contact}
          onClose={() => setDraftOpen(false)}
          onCreated={() => { setDraftOpen(false); reload(); }}
        />
      )}

      {cardMedia && (
        <Section title="Визитка">
          <img src={`${apiBaseURL}/uploads/${cardMedia.file_path}`} className="w-full rounded-xl" alt="card" />
        </Section>
      )}

      {personMedia && (
        <Section title="Фото человека">
          <img src={`${apiBaseURL}/uploads/${personMedia.file_path}`} className="w-full rounded-xl" alt="person" />
        </Section>
      )}

      {voiceMedia && (
        <Section title="Голосовая заметка">
          <audio src={`${apiBaseURL}/uploads/${voiceMedia.file_path}`} controls className="w-full" />
          {voiceMedia.transcript && (
            <div className="mt-2 text-sm text-slate-600 bg-slate-50 rounded-lg p-3 italic">
              «{voiceMedia.transcript}»
            </div>
          )}
        </Section>
      )}

      {contact.summary && (
        <Section title="Резюме встречи">
          <p className="text-sm text-slate-700">{contact.summary}</p>
        </Section>
      )}

      {contact.agreements && (
        <Section title="Договорённости">
          <p className="text-sm text-slate-700">{contact.agreements}</p>
        </Section>
      )}

      {contact.next_step && (
        <Section title="Следующий шаг">
          <p className="text-sm text-slate-700">{contact.next_step}</p>
          {contact.reminder_at && (
            <p className="text-xs text-slate-500 mt-2 flex items-center gap-1">
              <Calendar size={12} /> Напоминание: {formatDate(contact.reminder_at)}
            </p>
          )}
        </Section>
      )}

      {followups.length > 0 && (
        <Section title="Follow-up'ы">
          <div className="space-y-2">
            {followups.map((f) => (
              <FollowupCard key={f.id} fu={f} onUpdated={reload} />
            ))}
          </div>
        </Section>
      )}

      <ConsentBlock contact={contact} />

      <button onClick={remove} className="btn-danger w-full">
        <Trash2 size={16} /> Удалить контакт
      </button>
      <EraseButton contactId={contact.id} onErased={reload} />
    </div>
  );
}

function ConsentBlock({ contact }: { contact: Contact }) {
  if (!contact.consent_given_at && !contact.erased_at) return null;
  return (
    <div className="card p-3 text-xs">
      {contact.erased_at && (
        <div className="text-rose-600 font-semibold">
          🗑 Данные стёрты по запросу субъекта ПДн ({formatDate(contact.erased_at)})
        </div>
      )}
      {contact.consent_given_at && !contact.erased_at && (
        <div className="text-emerald-700">
          ✅ Согласие на обработку ПДн получено {formatDate(contact.consent_given_at)}
          {contact.consent_text_version && ` (v${contact.consent_text_version})`}
        </div>
      )}
    </div>
  );
}

function EraseButton({ contactId, onErased }: { contactId: string; onErased: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const erase = async () => {
    if (!confirm("Стереть все ПДн (имя, email, телефон, медиа)? Это необратимо. Запись о согласии останется, но контент удаляется навсегда (152-ФЗ / GDPR).")) return;
    setBusy(true);
    try {
      await api.post(`/api/contacts/${contactId}/erase`);
      onErased();
      setMsg("ПДн стёрты");
    } catch (e: unknown) {
      setMsg((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button onClick={erase} disabled={busy} className="btn-secondary w-full text-rose-600">
        🗑 Стереть ПДн (152-ФЗ / GDPR)
      </button>
      {msg && <div className="text-xs text-slate-600 mt-1">{msg}</div>}
    </div>
  );
}

function EnrichmentBlock({ contact, onUpdated }: { contact: Contact; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const enrich = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post(`/api/contacts/${contact.id}/enrich`);
      onUpdated();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  const data = (contact.enrichment_data || {}) as Record<string, unknown>;
  const hasData = Object.keys(data).length > 0;
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Контекст компании (DaData + meta)</div>
        <button onClick={enrich} disabled={busy} className="btn-secondary text-xs">
          {busy ? "..." : hasData ? "Обновить" : "Обогатить"}
        </button>
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      {hasData ? (
        <pre className="text-xs whitespace-pre-wrap bg-slate-50 rounded p-2 overflow-auto max-h-72">
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <p className="text-xs text-slate-500">
          Кликните «Обогатить» — система найдёт ИНН/ОГРН/руководство компании в DaData (РФ) и метаданные сайта.
        </p>
      )}
    </div>
  );
}

function PushToBitrixButton({ contactId }: { contactId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ connected: boolean }>("/api/integrations/bitrix24/status")
      .then((r) => setEnabled(r.data.connected))
      .catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  const push = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ contact_id: number; deal_id: number }>(`/api/integrations/bitrix24/push/${contactId}`);
      setMsg(`Создано в Bitrix24: контакт #${r.data.contact_id}`);
    } catch (e: unknown) {
      setMsg((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <button onClick={push} disabled={busy} className="btn-secondary w-full">↗ Отправить в Bitrix24</button>
      {msg && <div className="text-xs text-slate-600 mt-1">{msg}</div>}
    </div>
  );
}

function PushToHubspotButton({ contactId }: { contactId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    api.get<{ connected: boolean }>("/api/integrations/hubspot/status")
      .then((r) => setEnabled(r.data.connected))
      .catch(() => setEnabled(false));
  }, []);
  if (!enabled) return null;
  const push = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ contact_id: string; deal_id: string }>(`/api/integrations/hubspot/push/${contactId}`);
      setMsg(`Создано в HubSpot: contact ${r.data.contact_id}`);
    } catch (e: unknown) {
      setMsg((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally { setBusy(false); }
  };
  return (
    <div>
      <button onClick={push} disabled={busy} className="btn-secondary w-full">↗ Отправить в HubSpot</button>
      {msg && <div className="text-xs text-slate-600 mt-1">{msg}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}

function ContactRow({ icon, value, href }: { icon: React.ReactNode; value: string; href?: string }) {
  const content = (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-slate-400">{icon}</span>
      <span className="text-sm text-slate-700">{value}</span>
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}

function FollowupCard({ fu, onUpdated }: { fu: FollowUp; onUpdated: () => void }) {
  const [body, setBody] = useState(fu.body || "");
  const [subject, setSubject] = useState(fu.subject || "");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/followups/${fu.id}`, { subject, body });
      onUpdated();
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const markSent = async () => {
    await api.patch(`/api/followups/${fu.id}`, { status: "sent" });
    onUpdated();
  };

  const sendMail = () => {
    const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{FOLLOWUP_KIND_LABEL[fu.kind] ?? fu.kind}</span>
        <span className={`badge ${fu.status === "sent" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
          {fu.status === "sent" ? "Отправлено" : "Черновик"}
        </span>
      </div>
      {fu.personalization && (
        <div className="text-xs text-slate-500 mt-1">Персонализация: {fu.personalization}</div>
      )}
      {!open ? (
        <>
          {fu.subject && <div className="text-sm font-medium mt-2 text-slate-700">{fu.subject}</div>}
          {fu.body && <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap line-clamp-4">{fu.body}</div>}
          <div className="flex gap-2 mt-2">
            <button onClick={() => setOpen(true)} className="text-xs text-brand-700 font-medium">Редактировать</button>
            <button onClick={sendMail} className="text-xs text-brand-700 font-medium">Открыть в почте</button>
            {fu.status !== "sent" && (
              <button onClick={markSent} className="text-xs text-emerald-700 font-medium">Отметить отправленным</button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-2 mt-2">
          <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Тема" />
          <textarea className="input min-h-[180px]" value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} className="btn-primary !py-1.5 text-xs">
              <Save size={14} /> Сохранить
            </button>
            <button onClick={() => setOpen(false)} className="btn-secondary !py-1.5 text-xs">Отмена</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FollowupDrafter({
  contact,
  onClose,
  onCreated,
}: {
  contact: Contact;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<"intro" | "proposal" | "invite" | "call">("intro");
  const [personalization, setPersonalization] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<ProposalTemplate[]>("/api/followups/templates").then((r) => setTemplates(r.data));
  }, []);

  const submit = async () => {
    setLoading(true);
    try {
      await api.post("/api/followups/draft", {
        contact_id: contact.id,
        kind,
        personalization: personalization || null,
        template_id: templateId || null,
      });
      onCreated();
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter((t) => t.kind === kind);

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl p-5 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-lg font-bold">AI-черновик follow-up</h2>

        <div className="space-y-2">
          <label className="label">Что отправить</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["intro", "📧 Вводное письмо"],
                ["proposal", "📑 КП / презентация"],
                ["invite", "🎟 Приглашение / демо"],
                ["call", "📞 План звонка"],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setKind(v)}
                className={`p-2 rounded-lg text-sm border ${kind === v ? "bg-brand-700 text-white border-brand-700" : "bg-white border-slate-200"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Персонализация (одна строка)</label>
          <input
            className="input"
            placeholder="скидка 15%, шоу-рум на ВДНХ, кейс по проекту X…"
            value={personalization}
            onChange={(e) => setPersonalization(e.target.value)}
          />
        </div>

        {filteredTemplates.length > 0 && (
          <div>
            <label className="label">Шаблон (опционально)</label>
            <select className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— без шаблона —</option>
              {filteredTemplates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}

        <button onClick={submit} className="btn-primary w-full" disabled={loading}>
          {loading ? <><Loader2 className="animate-spin" size={16} /> AI пишет…</> : <><Sparkles size={16} /> Сгенерировать AI</>}
        </button>
        <button onClick={onClose} className="btn-secondary w-full">Отмена</button>
      </div>
    </div>
  );
}

function EditForm({ contact, onSave, onCancel }: { contact: Contact; onSave: () => void; onCancel: () => void }) {
  const [c, setC] = useState({ ...contact });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/contacts/${contact.id}`, c);
      onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <button onClick={onCancel} className="text-slate-500"><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold">Редактирование</h1>
        <button onClick={save} disabled={saving} className="text-brand-700 font-semibold flex items-center gap-1">
          <Save size={16} /> {saving ? "…" : "OK"}
        </button>
      </header>

      <div className="card p-4 space-y-3">
        <div><label className="label">ФИО</label><input className="input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
        <div><label className="label">Компания</label><input className="input" value={c.contact_company || ""} onChange={(e) => setC({ ...c, contact_company: e.target.value })} /></div>
        <div><label className="label">Должность</label><input className="input" value={c.role_title || ""} onChange={(e) => setC({ ...c, role_title: e.target.value })} /></div>
        <div><label className="label">Телефон</label><input className="input" value={c.phone || ""} onChange={(e) => setC({ ...c, phone: e.target.value })} /></div>
        <div><label className="label">Email</label><input className="input" value={c.email || ""} onChange={(e) => setC({ ...c, email: e.target.value })} /></div>
        <div><label className="label">Сайт</label><input className="input" value={c.website || ""} onChange={(e) => setC({ ...c, website: e.target.value })} /></div>
        <div><label className="label">Telegram</label><input className="input" value={c.telegram || ""} onChange={(e) => setC({ ...c, telegram: e.target.value })} /></div>
        <div><label className="label">WhatsApp</label><input className="input" value={c.whatsapp || ""} onChange={(e) => setC({ ...c, whatsapp: e.target.value })} /></div>
      </div>

      <div className="card p-4 space-y-3">
        <div>
          <label className="label">Тип контакта</label>
          <div className="flex flex-wrap gap-2">
            {[["client","Клиент"],["partner","Партнёр"],["supplier","Поставщик"],["investor","Инвестор"],["other","Другое"]].map(([v,l]) => (
              <button key={v} onClick={() => setC({ ...c, contact_type: v })} className={`px-3 py-1.5 rounded-full text-sm ${c.contact_type === v ? "bg-brand-700 text-white" : "bg-white border border-slate-200"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Статус</label>
          <div className="flex gap-2">
            {[["hot","🔥 Горячий"],["warm","🟡 Тёплый"],["cold","⚪ Холодный"]].map(([v,l]) => (
              <button key={v} onClick={() => setC({ ...c, status: v })} className={`px-3 py-1.5 rounded-full text-sm ${c.status === v ? "bg-brand-700 text-white" : "bg-white border border-slate-200"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4 space-y-3">
        <div><label className="label">Резюме</label><textarea className="input min-h-[60px]" value={c.summary || ""} onChange={(e) => setC({ ...c, summary: e.target.value })} /></div>
        <div><label className="label">Договорённости</label><textarea className="input min-h-[60px]" value={c.agreements || ""} onChange={(e) => setC({ ...c, agreements: e.target.value })} /></div>
        <div><label className="label">Следующий шаг</label><textarea className="input min-h-[60px]" value={c.next_step || ""} onChange={(e) => setC({ ...c, next_step: e.target.value })} /></div>
      </div>

      <div className="card p-4 space-y-3">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1">
          <FileText size={12} /> Связь с компанией
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!c.talked_to_card_owner}
            onChange={(e) => setC({ ...c, talked_to_card_owner: !e.target.checked })}
          />
          Поговорили не с владельцем визитки
        </label>
        {!c.talked_to_card_owner && (
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Имя" value={c.talked_to_name || ""} onChange={(e) => setC({ ...c, talked_to_name: e.target.value })} />
            <input className="input" placeholder="Должность" value={c.talked_to_role || ""} onChange={(e) => setC({ ...c, talked_to_role: e.target.value })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Павильон</label>
            <input className="input" placeholder="напр. №3" value={c.pavilion || ""} onChange={(e) => setC({ ...c, pavilion: e.target.value })} />
          </div>
          <div>
            <label className="label">Стенд</label>
            <input className="input" placeholder="напр. B14" value={c.stand || ""} onChange={(e) => setC({ ...c, stand: e.target.value })} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PushToAmoButton({ contactId }: { contactId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ connected: boolean }>("/api/integrations/amocrm/status")
      .then((r) => setEnabled(r.data.connected))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  const push = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post<{ contact_id: number; lead_id: number; subdomain: string }>(`/api/integrations/amocrm/push/${contactId}`);
      setMsg(`Создано в amoCRM: lead #${r.data.lead_id}`);
    } catch (e: unknown) {
      setMsg((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <button onClick={push} disabled={busy} className="btn-secondary w-full">
        ↗ Отправить в amoCRM
      </button>
      {msg && <div className="text-xs text-slate-600 mt-1">{msg}</div>}
    </div>
  );
}
