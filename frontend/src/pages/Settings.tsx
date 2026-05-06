import { useEffect, useState } from "react";
import { LogOut, Plus, Trash2, Star, Users, FileText, Bell, BellOff, Send, Pencil, Check, X, ListChecks, Shuffle } from "lucide-react";
import { api, type Company, type Exhibition, type ProposalTemplate, type QualificationTemplate, type RoutingRule, type TeamMember, type User } from "../api";
import { formatDate } from "../lib/utils";
import { getPushStatus, subscribePush, unsubscribePush, sendTestPush, checkOverdueNow } from "../lib/push";

export default function SettingsPage({ user, company }: { user: User; company: Company | null }) {
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tab, setTab] = useState<"exhibitions" | "templates" | "quiz" | "routing" | "team" | "notifications" | "telegram" | "amocrm" | "bitrix24" | "hubspot">("exhibitions");

  const reload = () => {
    api.get<Exhibition[]>("/api/exhibitions").then((r) => setExhibitions(r.data));
    api.get<ProposalTemplate[]>("/api/followups/templates").then((r) => setTemplates(r.data));
    api.get<TeamMember[]>("/api/team/members").then((r) => setTeam(r.data));
  };
  useEffect(() => { reload(); }, []);

  const logout = () => {
    localStorage.removeItem("token");
    window.location.href = "/signin";
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Настройки</h1>

      <div className="flex gap-2 flex-wrap">
        <TabBtn active={tab === "exhibitions"} onClick={() => setTab("exhibitions")}>Выставки</TabBtn>
        <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>Шаблоны</TabBtn>
        <TabBtn active={tab === "team"} onClick={() => setTab("team")}>Команда</TabBtn>
        <TabBtn active={tab === "notifications"} onClick={() => setTab("notifications")}>Push</TabBtn>
        <TabBtn active={tab === "telegram"} onClick={() => setTab("telegram")}>Telegram</TabBtn>
        <TabBtn active={tab === "quiz"} onClick={() => setTab("quiz")}>Анкеты</TabBtn>
        <TabBtn active={tab === "routing"} onClick={() => setTab("routing")}>Маршруты</TabBtn>
        <TabBtn active={tab === "amocrm"} onClick={() => setTab("amocrm")}>amoCRM</TabBtn>
        <TabBtn active={tab === "bitrix24"} onClick={() => setTab("bitrix24")}>Bitrix24</TabBtn>
        <TabBtn active={tab === "hubspot"} onClick={() => setTab("hubspot")}>HubSpot</TabBtn>
      </div>

      {tab === "exhibitions" && <ExhibitionsTab items={exhibitions} reload={reload} />}
      {tab === "templates" && <TemplatesTab items={templates} reload={reload} />}
      {tab === "quiz" && <QuizTab />}
      {tab === "routing" && <RoutingTab team={team} />}
      {tab === "team" && <TeamTab items={team} currentUserId={user.id} reload={reload} />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "telegram" && <TelegramTab />}
      {tab === "amocrm" && <AmocrmTab />}
      {tab === "bitrix24" && <Bitrix24Tab />}
      {tab === "hubspot" && <HubspotTab />}

      <div className="card p-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
          Аккаунт
        </div>
        <div className="text-sm">{user.name}</div>
        <div className="text-xs text-slate-500">{user.email}</div>
        {company && (
          <CompanyNameRow
            company={company}
            canEdit={user.role === "owner" || user.role === "manager"}
          />
        )}
        <button onClick={logout} className="btn-danger w-full mt-3">
          <LogOut size={16} /> Выйти
        </button>
      </div>
    </div>
  );
}

function CompanyNameRow({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(company.name);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.patch("/api/auth/company", { name: trimmed });
      window.location.reload();
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <span className="text-xs text-slate-500">🏢 {company.name}</span>
        {canEdit && (
          <button
            onClick={() => { setName(company.name); setEditing(true); }}
            className="text-slate-400 hover:text-brand-700 p-0.5"
            aria-label="Переименовать компанию"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 mt-1">
      <input
        autoFocus
        className="input !py-1 !text-xs flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="Название компании"
      />
      <button onClick={save} disabled={saving || !name.trim()} className="text-emerald-600 p-1 disabled:opacity-50" aria-label="Сохранить">
        <Check size={14} />
      </button>
      <button onClick={() => setEditing(false)} className="text-slate-400 p-1" aria-label="Отмена">
        <X size={14} />
      </button>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium ${active ? "bg-brand-700 text-white" : "bg-white border border-slate-200"}`}
    >
      {children}
    </button>
  );
}

function ExhibitionsTab({ items, reload }: { items: Exhibition[]; reload: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [venue, setVenue] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [show, setShow] = useState(false);

  const create = async () => {
    await api.post("/api/exhibitions", {
      name,
      city: city || null,
      venue: venue || null,
      start_date: start || null,
      end_date: end || null,
    });
    setName(""); setCity(""); setVenue(""); setStart(""); setEnd(""); setShow(false);
    reload();
  };

  const activate = async (id: string) => {
    await api.post(`/api/exhibitions/${id}/activate`);
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить выставку?")) return;
    await api.delete(`/api/exhibitions/${id}`);
    reload();
  };

  return (
    <div className="space-y-2">
      {!show ? (
        <button onClick={() => setShow(true)} className="btn-secondary w-full">
          <Plus size={16} /> Добавить выставку
        </button>
      ) : (
        <div className="card p-3 space-y-2">
          <input className="input" placeholder="Название выставки" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="Город" value={city} onChange={(e) => setCity(e.target.value)} />
            <input className="input" placeholder="Площадка" value={venue} onChange={(e) => setVenue(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setShow(false)}>Отмена</button>
            <button className="btn-primary" onClick={create} disabled={!name}>Создать</button>
          </div>
        </div>
      )}
      {items.map((e) => (
        <div key={e.id} className="card p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-800">{e.name}</div>
              <div className="text-xs text-slate-500">
                {e.city || ""}{e.venue ? `, ${e.venue}` : ""}{(e.start_date || e.end_date) ? ` · ${formatDate(e.start_date)} — ${formatDate(e.end_date)}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {e.is_active ? (
                <span className="badge bg-emerald-100 text-emerald-700">Активна</span>
              ) : (
                <button onClick={() => activate(e.id)} className="text-xs text-brand-700 font-medium">
                  Активировать
                </button>
              )}
              <button onClick={() => remove(e.id)} className="text-rose-500"><Trash2 size={14} /></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TemplatesTab({ items, reload }: { items: ProposalTemplate[]; reload: () => void }) {
  const [show, setShow] = useState(false);
  const [kind, setKind] = useState("intro");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const create = async () => {
    await api.post("/api/followups/templates", { kind, name, body, is_default: isDefault });
    setShow(false); setName(""); setBody(""); setIsDefault(false);
    reload();
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить шаблон?")) return;
    await api.delete(`/api/followups/templates/${id}`);
    reload();
  };

  return (
    <div className="space-y-2">
      {!show ? (
        <button onClick={() => setShow(true)} className="btn-secondary w-full">
          <Plus size={16} /> Новый шаблон
        </button>
      ) : (
        <div className="card p-3 space-y-2">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="intro">Вводное письмо</option>
            <option value="proposal">КП / презентация</option>
            <option value="invite">Приглашение в шоу-рум / на демо</option>
            <option value="call">План звонка</option>
          </select>
          <input className="input" placeholder="Название шаблона" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea
            className="input min-h-[160px]"
            placeholder="Текст шаблона. AI адаптирует под конкретного контакта."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            По умолчанию для этого типа
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setShow(false)}>Отмена</button>
            <button className="btn-primary" onClick={create} disabled={!name || !body}>Сохранить</button>
          </div>
        </div>
      )}
      {items.length === 0 && (
        <p className="text-xs text-slate-500 text-center py-4">
          Шаблонов пока нет. AI сгенерирует follow-up'ы и без них, но шаблоны помогают сохранить tone of voice.
        </p>
      )}
      {items.map((t) => (
        <div key={t.id} className="card p-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-sm text-slate-800 flex items-center gap-1">
                <FileText size={14} /> {t.name}
                {t.is_default && <Star size={12} className="text-amber-500" />}
              </div>
              <div className="text-xs text-slate-500">
                {t.kind === "intro" ? "Вводное" : t.kind === "proposal" ? "КП" : t.kind === "invite" ? "Приглашение" : "Звонок"}
              </div>
            </div>
            <button onClick={() => remove(t.id)} className="text-rose-500"><Trash2 size={14} /></button>
          </div>
          <div className="text-xs text-slate-600 whitespace-pre-wrap mt-2 line-clamp-4">{t.body}</div>
        </div>
      ))}
    </div>
  );
}

function TeamTab({ items, currentUserId, reload }: { items: TeamMember[]; currentUserId: string; reload: () => void }) {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [err, setErr] = useState<string | null>(null);

  const invite = async () => {
    setErr(null);
    try {
      await api.post("/api/team/members", { email, name, password, role });
      setShow(false); setEmail(""); setName(""); setPassword(""); setRole("staff");
      reload();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Ошибка");
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Удалить участника?")) return;
    await api.delete(`/api/team/members/${id}`);
    reload();
  };

  return (
    <div className="space-y-2">
      {!show ? (
        <button onClick={() => setShow(true)} className="btn-secondary w-full">
          <Plus size={16} /> Пригласить участника
        </button>
      ) : (
        <div className="card p-3 space-y-2">
          <input className="input" placeholder="Имя" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" placeholder="Временный пароль" type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="staff">Стендист</option>
            <option value="manager">Менеджер</option>
            <option value="owner">Владелец</option>
          </select>
          {err && <div className="text-rose-600 text-sm">{err}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" onClick={() => setShow(false)}>Отмена</button>
            <button className="btn-primary" onClick={invite} disabled={!name || !email || !password}>Создать</button>
          </div>
        </div>
      )}
      {items.map((m) => (
        <div key={m.id} className="card p-3 flex items-center justify-between">
          <div>
            <div className="font-medium text-sm flex items-center gap-1">
              <Users size={14} /> {m.name}
              {m.id === currentUserId && <span className="text-xs text-slate-400">(вы)</span>}
              {!m.is_active && <span className="text-xs text-slate-400">(деактивирован)</span>}
            </div>
            <div className="text-xs text-slate-500">{m.email} · {m.role}</div>
          </div>
          {m.id !== currentUserId && m.is_active && (
            <button onClick={() => remove(m.id)} className="text-rose-500"><Trash2 size={14} /></button>
          )}
        </div>
      ))}
    </div>
  );
}

function NotificationsTab() {
  const [status, setStatus] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => getPushStatus().then(setStatus);
  useEffect(() => { refresh(); }, []);

  const wrap = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg(ok); }
    catch (e) { setMsg(`Ошибка: ${(e as Error).message ?? e}`); }
    finally { setBusy(false); refresh(); }
  };

  return (
    <div className="space-y-3">
      <div className="card p-4">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">
          Push-уведомления
        </div>
        <div className="text-sm text-slate-600 mb-3">
          Получайте уведомления, когда:
          <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-500">
            <li>коллега добавил новый контакт</li>
            <li>задача просрочена</li>
          </ul>
        </div>
        <div className="text-xs text-slate-500 mb-2">Статус: <b>{status}</b></div>
        {status === "unsupported" && (
          <div className="text-rose-600 text-xs">Браузер не поддерживает Web Push (на iOS — установите PWA на главный экран сначала).</div>
        )}
        {status === "denied" && (
          <div className="text-rose-600 text-xs">Уведомления заблокированы в настройках браузера. Откройте chrome://settings/content/notifications и разрешите для этого сайта.</div>
        )}
        {status !== "subscribed" && status !== "unsupported" && status !== "denied" && (
          <button disabled={busy} className="btn-primary w-full" onClick={() => wrap(subscribePush, "Подписка оформлена")}>
            <Bell size={16} /> Включить уведомления
          </button>
        )}
        {status === "subscribed" && (
          <div className="space-y-2">
            <button disabled={busy} className="btn-secondary w-full" onClick={() => wrap(sendTestPush, "Тест отправлен")}>
              <Send size={16} /> Отправить тест
            </button>
            <button disabled={busy} className="btn-secondary w-full" onClick={() => wrap(checkOverdueNow, "Проверено")}>
              <Bell size={16} /> Проверить просроченные задачи
            </button>
            <button disabled={busy} className="btn-danger w-full" onClick={() => wrap(unsubscribePush, "Отписано")}>
              <BellOff size={16} /> Отключить
            </button>
          </div>
        )}
        {msg && <div className="text-xs text-slate-600 mt-2">{msg}</div>}
      </div>
    </div>
  );
}

function TelegramTab() {
  const [status, setStatus] = useState<{ enabled: boolean; linked: boolean; bot_username: string } | null>(null);
  const [link, setLink] = useState<{ code: string; deep_link: string; expires_minutes: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.get("/api/telegram/status").then((r) => setStatus(r.data));
  useEffect(() => { refresh(); }, []);

  const issue = async () => {
    setBusy(true);
    try {
      const r = await api.post("/api/telegram/link-code");
      setLink(r.data);
    } finally { setBusy(false); }
  };
  const unlink = async () => {
    if (!confirm("Отвязать Telegram?")) return;
    setBusy(true);
    try { await api.post("/api/telegram/unlink"); setLink(null); refresh(); }
    finally { setBusy(false); }
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
        Telegram-бот
      </div>
      {!status ? <div className="text-xs text-slate-500">Загрузка…</div> : (
        <>
          {!status.enabled && (
            <div className="bg-amber-50 text-amber-800 rounded p-2 text-xs">
              Telegram-бот ещё не настроен на сервере. Добавьте TELEGRAM_BOT_TOKEN.
            </div>
          )}
          {status.linked && (
            <div className="bg-emerald-50 text-emerald-800 rounded p-2 text-xs">
              ✅ Telegram привязан к этому аккаунту.
            </div>
          )}
          <div className="text-sm text-slate-600">
            Бот: <a className="text-brand-700 font-medium" href={`https://t.me/${status.bot_username}`} target="_blank">@{status.bot_username}</a>
          </div>
          <div className="text-xs text-slate-500">
            Что умеет: фото визитки → контакт; голосовая → транскрипт + контакт; /last, /tasks.
          </div>
          {!status.linked && (
            <button onClick={issue} disabled={busy || !status.enabled} className="btn-primary w-full">
              Получить код привязки
            </button>
          )}
          {status.linked && (
            <button onClick={unlink} disabled={busy} className="btn-danger w-full">
              Отвязать
            </button>
          )}
          {link && (
            <div className="bg-slate-100 rounded p-3 text-sm">
              <div className="text-xs text-slate-500 mb-1">Код (на 30 минут):</div>
              <div className="font-mono text-lg tracking-wider">{link.code}</div>
              <a className="text-brand-700 text-xs underline" href={link.deep_link} target="_blank">
                Открыть в Telegram
              </a>
              <div className="text-xs text-slate-500 mt-2">
                Или вручную в боте: <code>/start {link.code}</code>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AmocrmTab() {
  const [status, setStatus] = useState<{ connected: boolean; account?: string; subdomain?: string; error?: string } | null>(null);
  const [subdomain, setSubdomain] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = () => api.get("/api/integrations/amocrm/status").then((r) => setStatus(r.data));
  useEffect(() => { refresh(); }, []);

  const connect = async () => {
    setBusy(true); setMsg(null);
    try {
      await api.post("/api/integrations/amocrm/connect", { subdomain, access_token: token });
      setMsg("Подключено");
      setToken(""); refresh();
    } catch (e) {
      setMsg(`Ошибка: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!confirm("Отключить amoCRM?")) return;
    await api.post("/api/integrations/amocrm/disconnect");
    refresh();
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
        amoCRM
      </div>
      <div className="text-xs text-slate-500">
        Подключите долгоживущий токен из вашей amoCRM-интеграции:
        <ol className="list-decimal list-inside mt-1 space-y-0.5">
          <li>amoCRM → Настройки → Интеграции → Создать интеграцию</li>
          <li>Тип: внешняя · Доступы: contacts, leads, companies, notes</li>
          <li>Скопируйте Long-Lived Access Token</li>
          <li>Поддомен — то, что слева от .amocrm.ru (например <code>mycompany</code>)</li>
        </ol>
      </div>
      {status?.connected ? (
        <div className="bg-emerald-50 text-emerald-800 rounded p-2 text-sm">
          ✅ Подключено: {status.account || status.subdomain}.amocrm.ru
        </div>
      ) : status?.error ? (
        <div className="bg-rose-50 text-rose-800 rounded p-2 text-xs">Ошибка: {status.error}</div>
      ) : null}
      {!status?.connected && (
        <>
          <input className="input" placeholder="Поддомен (mycompany)" value={subdomain} onChange={(e) => setSubdomain(e.target.value)} />
          <input className="input" placeholder="Long-Lived Access Token" value={token} onChange={(e) => setToken(e.target.value)} />
          <button className="btn-primary w-full" disabled={busy || !subdomain || !token} onClick={connect}>
            Подключить
          </button>
        </>
      )}
      {status?.connected && (
        <button className="btn-danger w-full" onClick={disconnect}>Отключить</button>
      )}
      {msg && <div className="text-xs text-slate-600">{msg}</div>}
      <div className="text-xs text-slate-500 mt-2">
        Дальше в карточке любого контакта появится кнопка «Отправить в amoCRM» — создаст контакт + сделку + заметку.
      </div>
    </div>
  );
}

// ==================== Quiz tab (P0.1) ====================
function QuizTab() {
  const [items, setItems] = useState<QualificationTemplate[]>([]);
  const [editing, setEditing] = useState<QualificationTemplate | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = () =>
    api.get<QualificationTemplate[]>("/api/qualification-templates").then((r) => setItems(r.data));

  useEffect(() => {
    reload();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Удалить анкету?")) return;
    await api.delete(`/api/qualification-templates/${id}`);
    reload();
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
          <ListChecks className="inline mr-1" size={12} /> Анкеты квалификации
        </div>
        <button onClick={() => { setEditing(null); setCreating(true); }} className="btn-primary text-xs">
          <Plus size={14} /> Создать
        </button>
      </div>

      {(creating || editing) && (
        <QuizEditor
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSaved={() => { setEditing(null); setCreating(false); reload(); }}
        />
      )}

      {items.length === 0 && !creating && (
        <p className="text-sm text-slate-500">
          Нет анкет. Создайте первую — она поможет квалифицировать B2B-лиды (бюджет, сроки, ЛПР).
        </p>
      )}

      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">
                {t.name} {t.is_default && <span className="text-xs text-amber-600">★ дефолт</span>}
              </div>
              <div className="text-xs text-slate-500">{t.questions.length} вопросов</div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => { setCreating(false); setEditing(t); }} className="btn-secondary text-xs">
                <Pencil size={12} />
              </button>
              <button onClick={() => remove(t.id)} className="btn-danger text-xs">
                <Trash2 size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuizEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: QualificationTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [isDefault, setIsDefault] = useState(initial?.is_default || false);
  const [json, setJson] = useState(
    JSON.stringify(
      initial?.questions || [
        { id: "budget", type: "single", text: "Какой бюджет?", required: true,
          options: [
            { value: "small", label: "до 100к", score: 2 },
            { value: "mid", label: "100к-1М", score: 6 },
            { value: "big", label: "1М+", score: 10 },
          ] },
        { id: "timeline", type: "single", text: "Когда планируется решение?",
          options: [
            { value: "now", label: "Сейчас", score: 10 },
            { value: "qtr", label: "В этом квартале", score: 7 },
            { value: "year", label: "В этом году", score: 4 },
            { value: "later", label: "Позже", score: 1 },
          ] },
        { id: "decision_maker", type: "bool", text: "Лицо принимающее решение?" },
        { id: "interest", type: "rating", text: "Уровень интереса (1-5)" },
      ],
      null,
      2,
    ),
  );
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr(null);
    let questions;
    try {
      questions = JSON.parse(json);
      if (!Array.isArray(questions)) throw new Error("Не массив");
    } catch (e) {
      setErr("Невалидный JSON: " + (e as Error).message);
      return;
    }
    setSaving(true);
    try {
      if (initial) {
        await api.patch(`/api/qualification-templates/${initial.id}`, {
          name,
          questions,
          is_default: isDefault,
        });
      } else {
        await api.post("/api/qualification-templates", {
          name,
          questions,
          is_default: isDefault,
        });
      }
      onSaved();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-2 border-brand-200 rounded-lg p-3 space-y-2 bg-brand-50/30">
      <div className="flex items-center justify-between">
        <strong className="text-sm">{initial ? "Редактирование" : "Новая анкета"}</strong>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
      </div>
      <input className="input" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
        По умолчанию (показывать на capture)
      </label>
      <div className="text-xs text-slate-500">
        Вопросы (JSON): id, type (single/multi/rating/text/number/bool), text, required, options[{`{value,label,score}`}], branch{`{if_value,goto}`}
      </div>
      <textarea
        className="input font-mono text-xs"
        rows={14}
        value={json}
        onChange={(e) => setJson(e.target.value)}
      />
      {err && <div className="text-rose-600 text-xs">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="btn-primary text-sm flex-1">
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
        <button onClick={onClose} className="btn-secondary text-sm">Отмена</button>
      </div>
    </div>
  );
}

// ==================== Routing rules tab (P1.7) ====================
function RoutingTab({ team }: { team: TeamMember[] }) {
  const [items, setItems] = useState<RoutingRule[]>([]);
  const [creating, setCreating] = useState(false);

  const reload = () => api.get<RoutingRule[]>("/api/routing-rules").then((r) => setItems(r.data));

  useEffect(() => {
    reload();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Удалить правило?")) return;
    await api.delete(`/api/routing-rules/${id}`);
    reload();
  };

  const toggle = async (r: RoutingRule) => {
    await api.patch(`/api/routing-rules/${r.id}`, { is_active: !r.is_active });
    reload();
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
          <Shuffle className="inline mr-1" size={12} /> Маршрутизация лидов
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary text-xs">
          <Plus size={14} /> Создать правило
        </button>
      </div>

      {creating && (
        <RoutingEditor
          team={team}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); reload(); }}
        />
      )}

      {items.length === 0 && !creating && (
        <p className="text-sm text-slate-500">
          Нет правил. Пример: «status = hot → назначить менеджеру X», «город = Москва → round-robin между командой».
        </p>
      )}

      <ul className="space-y-2">
        {items.map((r) => (
          <li key={r.id} className="border border-slate-200 rounded-lg p-3 flex items-center justify-between">
            <div>
              <div className="font-medium text-sm">
                {r.name} {!r.is_active && <span className="text-xs text-slate-400">(выключено)</span>}
              </div>
              <div className="text-xs text-slate-500">
                {r.action_type} · приоритет {r.priority}
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={() => toggle(r)} className="btn-secondary text-xs">
                {r.is_active ? "Выкл" : "Вкл"}
              </button>
              <button onClick={() => remove(r.id)} className="btn-danger text-xs">
                <Trash2 size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoutingEditor({
  team,
  onClose,
  onSaved,
}: {
  team: TeamMember[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [field, setField] = useState("status");
  const [op, setOp] = useState("eq");
  const [value, setValue] = useState("hot");
  const [actionType, setActionType] = useState<"assign" | "round_robin" | "tag">("assign");
  const [assignUser, setAssignUser] = useState(team[0]?.id || "");
  const [tagStatus, setTagStatus] = useState("hot");
  const [priority, setPriority] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setErr(null);
    setSaving(true);
    try {
      const conditions = { all: [{ field, op, value }] };
      let action_data: Record<string, unknown> = {};
      if (actionType === "assign") action_data = { user_id: assignUser };
      else if (actionType === "round_robin") action_data = { user_ids: team.filter((t) => t.is_active).map((t) => t.id) };
      else action_data = { status: tagStatus };
      await api.post("/api/routing-rules", {
        name, priority, conditions, action_type: actionType, action_data, is_active: true,
      });
      onSaved();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-2 border-brand-200 rounded-lg p-3 space-y-2 bg-brand-50/30">
      <div className="flex items-center justify-between">
        <strong className="text-sm">Новое правило маршрутизации</strong>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
      </div>
      <input className="input" placeholder="Название" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="text-xs text-slate-500">Условие: ЕСЛИ</div>
      <div className="grid grid-cols-3 gap-2">
        <select className="input" value={field} onChange={(e) => setField(e.target.value)}>
          <option value="status">status</option>
          <option value="contact_type">contact_type</option>
          <option value="city">city</option>
          <option value="ai_score">ai_score</option>
          <option value="qualification_answers.budget">budget (анкета)</option>
        </select>
        <select className="input" value={op} onChange={(e) => setOp(e.target.value)}>
          <option value="eq">=</option>
          <option value="neq">≠</option>
          <option value="gte">≥</option>
          <option value="lte">≤</option>
          <option value="contains">содержит</option>
        </select>
        <input className="input" placeholder="значение" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <div className="text-xs text-slate-500">ТО действие:</div>
      <select className="input" value={actionType} onChange={(e) => setActionType(e.target.value as "assign" | "round_robin" | "tag")}>
        <option value="assign">Назначить на</option>
        <option value="round_robin">Round-robin (вся активная команда)</option>
        <option value="tag">Установить статус</option>
      </select>
      {actionType === "assign" && (
        <select className="input" value={assignUser} onChange={(e) => setAssignUser(e.target.value)}>
          {team.filter((t) => t.is_active).map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
          ))}
        </select>
      )}
      {actionType === "tag" && (
        <select className="input" value={tagStatus} onChange={(e) => setTagStatus(e.target.value)}>
          <option value="hot">hot</option>
          <option value="warm">warm</option>
          <option value="cold">cold</option>
        </select>
      )}
      <input
        className="input"
        type="number"
        placeholder="Приоритет (выше = раньше)"
        value={priority}
        onChange={(e) => setPriority(Number(e.target.value))}
      />
      {err && <div className="text-rose-600 text-xs">{err}</div>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || !name} className="btn-primary text-sm flex-1">
          {saving ? "Сохранение..." : "Создать"}
        </button>
        <button onClick={onClose} className="btn-secondary text-sm">Отмена</button>
      </div>
    </div>
  );
}

// ==================== Bitrix24 tab (P1.8) ====================
function Bitrix24Tab() {
  const [status, setStatus] = useState<{ connected: boolean; error?: string; user?: string } | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.get("/api/integrations/bitrix24/status").then((r) => setStatus(r.data));
  useEffect(() => { refresh(); }, []);

  const connect = async () => {
    setErr(null); setBusy(true);
    try {
      await api.post("/api/integrations/bitrix24/connect", { webhook_url: webhookUrl });
      setWebhookUrl("");
      refresh();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    await api.post("/api/integrations/bitrix24/disconnect");
    refresh();
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Bitrix24</div>
      <div className="text-xs text-slate-500 space-y-1">
        <div>Создайте «Входящий вебхук» в Bitrix24:</div>
        <ol className="list-decimal list-inside ml-2">
          <li>Разработчикам → Другое → Входящий вебхук</li>
          <li>Разрешить: CRM (crm)</li>
          <li>Скопировать URL вида <code>https://&lt;portal&gt;.bitrix24.ru/rest/&lt;id&gt;/&lt;token&gt;/</code></li>
        </ol>
      </div>
      {status?.connected ? (
        <div className="space-y-2">
          <div className="text-sm text-emerald-600">✅ Подключено{status.user ? ` (${status.user})` : ""}</div>
          <button onClick={disconnect} className="btn-danger text-sm">Отключить</button>
        </div>
      ) : (
        <>
          {status?.error && <div className="text-xs text-rose-600">Ошибка: {status.error}</div>}
          <input
            className="input"
            placeholder="https://yourportal.bitrix24.ru/rest/1/abc.../"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          {err && <div className="text-rose-600 text-xs">{err}</div>}
          <button onClick={connect} disabled={busy || !webhookUrl} className="btn-primary text-sm">
            {busy ? "Проверка..." : "Подключить"}
          </button>
        </>
      )}
    </div>
  );
}

// ==================== HubSpot tab (P1.8) ====================
function HubspotTab() {
  const [status, setStatus] = useState<{ connected: boolean; error?: string; portal_id?: number } | null>(null);
  const [token, setToken] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => api.get("/api/integrations/hubspot/status").then((r) => setStatus(r.data));
  useEffect(() => { refresh(); }, []);

  const connect = async () => {
    setErr(null); setBusy(true);
    try {
      await api.post("/api/integrations/hubspot/connect", { access_token: token });
      setToken("");
      refresh();
    } catch (e: unknown) {
      setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Ошибка");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    await api.post("/api/integrations/hubspot/disconnect");
    refresh();
  };

  return (
    <div className="card p-4 space-y-3">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">HubSpot</div>
      <div className="text-xs text-slate-500 space-y-1">
        <div>Создайте Private App:</div>
        <ol className="list-decimal list-inside ml-2">
          <li>Settings → Integrations → Private Apps → Create</li>
          <li>Scopes: crm.objects.contacts.write, crm.objects.deals.write</li>
          <li>Скопировать access token</li>
        </ol>
      </div>
      {status?.connected ? (
        <div className="space-y-2">
          <div className="text-sm text-emerald-600">✅ Подключено (portal {status.portal_id})</div>
          <button onClick={disconnect} className="btn-danger text-sm">Отключить</button>
        </div>
      ) : (
        <>
          {status?.error && <div className="text-xs text-rose-600">Ошибка: {status.error}</div>}
          <input
            className="input"
            type="password"
            placeholder="pat-eu1-..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          {err && <div className="text-rose-600 text-xs">{err}</div>}
          <button onClick={connect} disabled={busy || !token} className="btn-primary text-sm">
            {busy ? "Проверка..." : "Подключить"}
          </button>
        </>
      )}
    </div>
  );
}
