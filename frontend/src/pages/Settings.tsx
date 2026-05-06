import { useEffect, useState } from "react";
import { LogOut, Plus, Trash2, Star, Users, FileText, Bell, BellOff, Send, Pencil, Check, X } from "lucide-react";
import { api, type Company, type Exhibition, type ProposalTemplate, type TeamMember, type User } from "../api";
import { formatDate } from "../lib/utils";
import { getPushStatus, subscribePush, unsubscribePush, sendTestPush, checkOverdueNow } from "../lib/push";

export default function SettingsPage({ user, company }: { user: User; company: Company | null }) {
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tab, setTab] = useState<"exhibitions" | "templates" | "team" | "notifications" | "telegram" | "amocrm">("exhibitions");

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
        <TabBtn active={tab === "amocrm"} onClick={() => setTab("amocrm")}>amoCRM</TabBtn>
      </div>

      {tab === "exhibitions" && <ExhibitionsTab items={exhibitions} reload={reload} />}
      {tab === "templates" && <TemplatesTab items={templates} reload={reload} />}
      {tab === "team" && <TeamTab items={team} currentUserId={user.id} reload={reload} />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "telegram" && <TelegramTab />}
      {tab === "amocrm" && <AmocrmTab />}

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
