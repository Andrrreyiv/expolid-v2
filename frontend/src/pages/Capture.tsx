import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Camera, Mic, Square, Upload, Image as ImageIcon, Loader2, X, QrCode, MapPin, Shield } from "lucide-react";
import jsQR from "jsqr";
import { api, type BadgeParseResponse, type Contact, type Exhibition, type QualificationTemplate } from "../api";
import { parseQrContact, type ContactFromQr } from "../lib/vcard";
import { enqueueCapture, syncPending } from "../lib/offline";

type Step = 1 | 2 | "processing";

export default function Capture() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>(1);

  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [exhibitionId, setExhibitionId] = useState<string>("");

  const [cardFile, setCardFile] = useState<File | null>(null);
  const [cardPreview, setCardPreview] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrPrefill, setQrPrefill] = useState<ContactFromQr | null>(null);

  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);

  const [notesText, setNotesText] = useState("");

  const [talkedToOwner, setTalkedToOwner] = useState(true);
  const [talkedToName, setTalkedToName] = useState("");
  const [talkedToRole, setTalkedToRole] = useState("");

  const [personFile, setPersonFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);

  const [pavilion, setPavilion] = useState("");
  const [stand, setStand] = useState("");

  const [contactType, setContactType] = useState("client");
  const [status, setStatus] = useState("warm");

  // Quiz (P0.1)
  const [quizTemplates, setQuizTemplates] = useState<QualificationTemplate[]>([]);
  const [quizTemplateId, setQuizTemplateId] = useState<string>("");
  const [quizAnswers, setQuizAnswers] = useState<Record<string, unknown>>({});

  // Consent (P0.4)
  const [consentGiven, setConsentGiven] = useState(false);
  const consentTextVersion = "2026-04-27-v1";

  // Badge scan (P0.2)
  const [badgeScanning, setBadgeScanning] = useState(false);
  const [badgePrefill, setBadgePrefill] = useState<BadgeParseResponse | null>(null);
  const [badgeId, setBadgeId] = useState<string>("");
  const [captureSource, setCaptureSource] = useState<string>("");

  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get<Exhibition[]>("/api/exhibitions").then((r) => {
      setExhibitions(r.data);
      const active = r.data.find((e) => e.is_active);
      if (active) setExhibitionId(active.id);
    });
    api
      .get<QualificationTemplate[]>("/api/qualification-templates")
      .then((r) => {
        setQuizTemplates(r.data);
        const def = r.data.find((t) => t.is_default) || r.data[0];
        if (def) setQuizTemplateId(def.id);
      })
      .catch(() => undefined);
  }, []);

  const activeQuizTemplate = useMemo(
    () => quizTemplates.find((t) => t.id === quizTemplateId) || null,
    [quizTemplates, quizTemplateId],
  );

  // Branching logic (P1.5): hide questions whose previous "branch.if_value/goto" routes around them.
  const visibleQuizQuestions = useMemo(() => {
    if (!activeQuizTemplate) return [];
    const qs = activeQuizTemplate.questions;
    let skipUntil: string | null = null;
    const out: typeof qs = [];
    for (const q of qs) {
      if (skipUntil) {
        if (q.id === skipUntil) {
          skipUntil = null;
        } else {
          continue;
        }
      }
      out.push(q);
      const ans = quizAnswers[q.id];
      if (q.branch?.if_value && q.branch?.goto && ans === q.branch.if_value) {
        skipUntil = q.branch.goto;
      }
    }
    return out;
  }, [activeQuizTemplate, quizAnswers]);

  // ---- Card ----
  const onCardChange = async (file: File | null) => {
    setCardFile(file);
    setCardPreview(file ? URL.createObjectURL(file) : null);
    setQrPayload(null);
    setQrPrefill(null);
    if (file) {
      try {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise((res) => {
          img.onload = res;
          img.onerror = res;
        });
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext("2d");
        if (ctx && img.naturalWidth > 0) {
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, c.width, c.height);
          const code = jsQR(data.data, data.width, data.height);
          if (code?.data) {
            setQrPayload(code.data);
            const prefill = parseQrContact(code.data);
            if (prefill && Object.keys(prefill).length > 0) setQrPrefill(prefill);
          }
        }
      } catch {
        /* ignore */
      }
    }
  };

  // ---- Voice ----
  const startRecording = async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: "audio/webm" });
        setVoiceFile(file);
        setVoiceUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setRecordSecs(0);
      const interval = setInterval(() => {
        setRecordSecs((s) => s + 1);
      }, 1000);
      mr.addEventListener("stop", () => clearInterval(interval));
    } catch {
      setErr("Не удалось получить доступ к микрофону. Разрешите доступ в настройках браузера.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const onVoiceUpload = (file: File | null) => {
    if (!file) return;
    setVoiceFile(file);
    setVoiceUrl(URL.createObjectURL(file));
  };

  // ---- Badge scan (P0.2) ----
  const onBadgeFile = async (file: File | null) => {
    if (!file) return;
    setBadgeScanning(true);
    setErr(null);
    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((res) => {
        img.onload = res;
        img.onerror = res;
      });
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      let payload: string | null = null;
      if (ctx && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height);
        const code = jsQR(data.data, data.width, data.height);
        if (code?.data) payload = code.data;
      }
      if (!payload) {
        setErr("QR-код не найден на бейдже. Попробуйте сделать фото при лучшем освещении.");
        setBadgeScanning(false);
        return;
      }
      const r = await api.post<BadgeParseResponse>("/api/badge/parse", { payload });
      setBadgePrefill(r.data);
      setCaptureSource(r.data.capture_source || "badge");
      if (r.data.badge_id) setBadgeId(r.data.badge_id);
    } catch (e: unknown) {
      setErr((e as { message?: string }).message || "Не удалось распарсить бейдж");
    } finally {
      setBadgeScanning(false);
    }
  };

  const updateQuizAnswer = (qid: string, val: unknown) => {
    setQuizAnswers((a) => ({ ...a, [qid]: val }));
  };

  // ---- Submit ----
  const submit = async () => {
    setErr(null);
    if (!cardFile && !voiceFile && !notesText.trim() && !badgePrefill) {
      setErr("Добавьте хотя бы одно: фото визитки, бейдж, голос или текст");
      return;
    }
    // Validate required quiz answers
    if (activeQuizTemplate) {
      const missing = visibleQuizQuestions.find(
        (q) => q.required && (quizAnswers[q.id] === undefined || quizAnswers[q.id] === ""),
      );
      if (missing) {
        setErr(`Ответьте на обязательный вопрос: ${missing.text}`);
        return;
      }
    }
    setStep("processing");

    const fd = new FormData();
    if (exhibitionId) fd.append("exhibition_id", exhibitionId);
    if (notesText.trim()) fd.append("notes_text", notesText.trim());
    // Quiz (P0.1)
    if (quizTemplateId && Object.keys(quizAnswers).length > 0) {
      fd.append("qualification_template_id", quizTemplateId);
      fd.append("qualification_answers_json", JSON.stringify(quizAnswers));
    }
    // Consent (P0.4)
    if (consentGiven) {
      fd.append("consent_given", "true");
      fd.append("consent_text_version", consentTextVersion);
      fd.append("consent_source", "capture");
    }
    // Badge prefill (P0.2)
    if (badgeId) fd.append("badge_id", badgeId);
    if (captureSource) fd.append("capture_source", captureSource);
    if (badgePrefill) {
      if (badgePrefill.name && !qrPrefill?.name) fd.append("prefill_name", badgePrefill.name);
      if (badgePrefill.email && !qrPrefill?.email) fd.append("prefill_email", badgePrefill.email);
      if (badgePrefill.phone && !qrPrefill?.phone) fd.append("prefill_phone", badgePrefill.phone);
      if (badgePrefill.contact_company && !qrPrefill?.contact_company) fd.append("prefill_company", badgePrefill.contact_company);
      if (badgePrefill.role_title && !qrPrefill?.role_title) fd.append("prefill_role", badgePrefill.role_title);
      if (badgePrefill.website && !qrPrefill?.website) fd.append("prefill_website", badgePrefill.website);
      if (badgePrefill.telegram && !qrPrefill?.telegram) fd.append("prefill_telegram", badgePrefill.telegram);
    }
    fd.append("talked_to_card_owner", String(talkedToOwner));
    if (!talkedToOwner) {
      if (talkedToName) fd.append("talked_to_name", talkedToName);
      if (talkedToRole) fd.append("talked_to_role", talkedToRole);
    }
    if (pavilion) fd.append("pavilion", pavilion);
    if (stand) fd.append("stand", stand);
    fd.append("contact_type", contactType);
    fd.append("status", status);
    if (qrPrefill?.name) fd.append("prefill_name", qrPrefill.name);
    if (qrPrefill?.phone) fd.append("prefill_phone", qrPrefill.phone);
    if (qrPrefill?.email) fd.append("prefill_email", qrPrefill.email);
    if (qrPrefill?.contact_company) fd.append("prefill_company", qrPrefill.contact_company);
    if (qrPrefill?.role_title) fd.append("prefill_role", qrPrefill.role_title);
    if (qrPrefill?.website) fd.append("prefill_website", qrPrefill.website);
    if (qrPrefill?.telegram) fd.append("prefill_telegram", qrPrefill.telegram);
    if (cardFile) fd.append("card_image", cardFile);
    if (personFile) fd.append("person_image", personFile);
    if (voiceFile) fd.append("voice", voiceFile);

    try {
      const r = await api.post<Contact>("/api/contacts/capture", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      });
      nav(`/contacts/${r.data.id}`);
    } catch (e: unknown) {
      // Network error → enqueue locally, navigate home
      const isNetwork =
        !(e as { response?: unknown }).response ||
        (e as { code?: string }).code === "ERR_NETWORK";
      if (isNetwork) {
        await enqueueCapture({
          exhibition_id: exhibitionId || undefined,
          notes_text: notesText.trim() || undefined,
          talked_to_card_owner: talkedToOwner,
          talked_to_name: talkedToName || undefined,
          talked_to_role: talkedToRole || undefined,
          pavilion: pavilion || undefined,
          stand: stand || undefined,
          contact_type: contactType,
          status,
          card_image: cardFile || undefined,
          card_filename: cardFile?.name,
          person_image: personFile || undefined,
          person_filename: personFile?.name,
          voice: voiceFile || undefined,
          voice_filename: voiceFile?.name,
          prefill_name: qrPrefill?.name,
          prefill_phone: qrPrefill?.phone,
          prefill_email: qrPrefill?.email,
          prefill_company: qrPrefill?.contact_company,
          prefill_role: qrPrefill?.role_title,
          prefill_website: qrPrefill?.website,
          prefill_telegram: qrPrefill?.telegram,
        });
        // try background sync (will be no-op if offline)
        syncPending().catch(() => undefined);
        alert("Нет соединения. Контакт сохранён локально и отправится автоматически, когда появится сеть.");
        nav("/");
        return;
      }
      setErr(
        (e as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
          "Не удалось создать контакт",
      );
      setStep(2);
    }
  };

  if (step === "processing") {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="animate-spin text-brand-700" size={48} />
        <div className="text-lg font-semibold text-slate-700">AI обрабатывает контакт</div>
        <div className="text-sm text-slate-500 text-center max-w-xs">
          Распознаю визитку, расшифровываю голос, формирую договорённости и следующий шаг…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <Link to="/" className="text-slate-500 hover:text-slate-700"><ArrowLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-slate-800">
          {step === 1 ? "Шаг 1: Визитка + голос" : "Шаг 2: Дополнительно"}
        </h1>
      </header>

      {step === 1 && (
        <>
          <Section title="Фото визитки">
            {cardPreview ? (
              <div className="relative">
                <img src={cardPreview} alt="card" className="w-full rounded-xl" />
                <button
                  onClick={() => onCardChange(null)}
                  className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow"
                  aria-label="Remove"
                >
                  <X size={16} />
                </button>
                {qrPayload && (
                  <div className="mt-2 text-xs bg-emerald-50 text-emerald-700 rounded-lg p-2 flex items-start gap-2">
                    <QrCode size={14} className="mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="font-semibold">QR найден</div>
                      {qrPrefill ? (
                        <ul className="mt-1 space-y-0.5">
                          {qrPrefill.name && <li>👤 {qrPrefill.name}</li>}
                          {qrPrefill.contact_company && <li>🏢 {qrPrefill.contact_company}</li>}
                          {qrPrefill.role_title && <li>💼 {qrPrefill.role_title}</li>}
                          {qrPrefill.phone && <li>📞 {qrPrefill.phone}</li>}
                          {qrPrefill.email && <li>✉️ {qrPrefill.email}</li>}
                          {qrPrefill.website && <li>🌐 {qrPrefill.website}</li>}
                          {qrPrefill.telegram && <li>📱 TG: {qrPrefill.telegram}</li>}
                        </ul>
                      ) : (
                        <div className="break-all">{qrPayload.slice(0, 200)}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FileButton
                  icon={<Camera size={20} />}
                  label="Камера"
                  accept="image/*"
                  capture="environment"
                  onFile={onCardChange}
                />
                <FileButton
                  icon={<ImageIcon size={20} />}
                  label="Файл"
                  accept="image/*"
                  onFile={onCardChange}
                />
              </div>
            )}
          </Section>

          <Section title={<span className="flex items-center gap-1"><QrCode size={12} /> Бейдж выставки (QR/штрихкод)</span>}>
            {badgePrefill ? (
              <div className="text-xs bg-emerald-50 text-emerald-700 rounded-lg p-2 flex items-start gap-2">
                <QrCode size={14} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold">Бейдж распознан ({badgePrefill.capture_source})</div>
                  <ul className="mt-1 space-y-0.5">
                    {badgePrefill.name && <li>👤 {badgePrefill.name}</li>}
                    {badgePrefill.contact_company && <li>🏢 {badgePrefill.contact_company}</li>}
                    {badgePrefill.role_title && <li>💼 {badgePrefill.role_title}</li>}
                    {badgePrefill.email && <li>✉️ {badgePrefill.email}</li>}
                    {badgePrefill.phone && <li>📞 {badgePrefill.phone}</li>}
                    {badgePrefill.badge_id && <li>🎫 ID: {badgePrefill.badge_id}</li>}
                  </ul>
                </div>
                <button
                  onClick={() => { setBadgePrefill(null); setBadgeId(""); setCaptureSource(""); }}
                  className="text-rose-600 hover:text-rose-800"
                  aria-label="Remove"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FileButton
                  icon={badgeScanning ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                  label="Камера"
                  accept="image/*"
                  capture="environment"
                  onFile={onBadgeFile}
                />
                <FileButton
                  icon={<ImageIcon size={20} />}
                  label="Файл"
                  accept="image/*"
                  onFile={onBadgeFile}
                />
              </div>
            )}
            <p className="text-xs text-slate-500 mt-1">
              Сканирует QR-код на пластиковом бейдже (ExpoCenter, Crocus, Messe).
            </p>
          </Section>

          <Section title="Голосовая заметка">
            {voiceUrl ? (
              <div className="space-y-2">
                <audio src={voiceUrl} controls className="w-full" />
                <button onClick={() => { setVoiceFile(null); setVoiceUrl(null); }} className="btn-secondary w-full">
                  <X size={16} /> Удалить
                </button>
              </div>
            ) : recording ? (
              <button onClick={stopRecording} className="btn-danger w-full">
                <Square size={18} fill="currentColor" /> Остановить ({recordSecs}с)
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={startRecording} className="btn-secondary">
                  <Mic size={20} /> Записать
                </button>
                <FileButton
                  icon={<Upload size={20} />}
                  label="Загрузить"
                  accept="audio/*"
                  onFile={onVoiceUpload}
                />
              </div>
            )}
          </Section>

          <Section title="Заметка / уточнения">
            <textarea
              className="input min-h-[88px]"
              placeholder="Например: интересуется внедрением AI в логистику, бюджет до 5 млн."
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
            />
          </Section>

          <Section title="Я общался не с владельцем визитки">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={!talkedToOwner}
                onChange={(e) => setTalkedToOwner(!e.target.checked)}
                className="w-4 h-4"
              />
              Поговорил с другим сотрудником компании
            </label>
            {!talkedToOwner && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input className="input" placeholder="Имя" value={talkedToName} onChange={(e) => setTalkedToName(e.target.value)} />
                <input className="input" placeholder="Должность" value={talkedToRole} onChange={(e) => setTalkedToRole(e.target.value)} />
              </div>
            )}
          </Section>

          {err && <div className="text-rose-600 text-sm">{err}</div>}
          <button className="btn-primary w-full" onClick={() => setStep(2)}>
            Далее
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <Section title="Фото человека (опционально)">
            <p className="text-xs text-slate-500 mb-2">
              Помогает запомнить, с кем разговаривали. Не обязательно.
            </p>
            {personPreview ? (
              <div className="relative">
                <img src={personPreview} alt="person" className="w-full rounded-xl" />
                <button
                  onClick={() => { setPersonFile(null); setPersonPreview(null); }}
                  className="absolute top-2 right-2 bg-white/90 rounded-full p-1 shadow"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FileButton
                  icon={<Camera size={20} />}
                  label="Камера"
                  accept="image/*"
                  capture="user"
                  onFile={(f) => { setPersonFile(f); setPersonPreview(f ? URL.createObjectURL(f) : null); }}
                />
                <FileButton
                  icon={<ImageIcon size={20} />}
                  label="Файл"
                  accept="image/*"
                  onFile={(f) => { setPersonFile(f); setPersonPreview(f ? URL.createObjectURL(f) : null); }}
                />
              </div>
            )}
          </Section>

          <Section title={
            <span className="flex items-center gap-1"><MapPin size={12} /> Локация на выставке</span>
          }>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="input"
                placeholder="Павильон (напр. №3)"
                value={pavilion}
                onChange={(e) => setPavilion(e.target.value)}
              />
              <input
                className="input"
                placeholder="Стенд (напр. B14)"
                value={stand}
                onChange={(e) => setStand(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Помогает потом понять, где встретились — особенно полезно для крупных выставок.
            </p>
          </Section>

          <Section title="Тип контакта">
            <div className="flex flex-wrap gap-2">
              {[
                ["client", "Клиент"],
                ["partner", "Партнёр"],
                ["supplier", "Поставщик"],
                ["investor", "Инвестор"],
                ["other", "Другое"],
              ].map(([v, l]) => (
                <Chip key={v} active={contactType === v} onClick={() => setContactType(v)}>
                  {l}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Статус (можно скорректировать после AI)">
            <div className="flex gap-2">
              {[
                ["hot", "🔥 Горячий"],
                ["warm", "🟡 Тёплый"],
                ["cold", "⚪ Холодный"],
              ].map(([v, l]) => (
                <Chip key={v} active={status === v} onClick={() => setStatus(v)}>
                  {l}
                </Chip>
              ))}
            </div>
          </Section>

          {activeQuizTemplate && visibleQuizQuestions.length > 0 && (
            <Section title="Анкета квалификации">
              {quizTemplates.length > 1 && (
                <select
                  className="input mb-3"
                  value={quizTemplateId}
                  onChange={(e) => { setQuizTemplateId(e.target.value); setQuizAnswers({}); }}
                >
                  {quizTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <div className="space-y-3">
                {visibleQuizQuestions.map((q) => (
                  <div key={q.id}>
                    <div className="text-sm font-medium text-slate-700 mb-1">
                      {q.text}
                      {q.required && <span className="text-rose-500 ml-1">*</span>}
                    </div>
                    {q.type === "single" && q.options && (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt) => (
                          <Chip
                            key={opt.value}
                            active={quizAnswers[q.id] === opt.value}
                            onClick={() => updateQuizAnswer(q.id, opt.value)}
                          >
                            {opt.label}
                          </Chip>
                        ))}
                      </div>
                    )}
                    {q.type === "multi" && q.options && (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map((opt) => {
                          const arr = (quizAnswers[q.id] as string[] | undefined) || [];
                          const checked = arr.includes(opt.value);
                          return (
                            <Chip
                              key={opt.value}
                              active={checked}
                              onClick={() => {
                                const next = checked
                                  ? arr.filter((v) => v !== opt.value)
                                  : [...arr, opt.value];
                                updateQuizAnswer(q.id, next);
                              }}
                            >
                              {opt.label}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                    {q.type === "rating" && (
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => updateQuizAnswer(q.id, n)}
                            className={`w-9 h-9 rounded-lg text-sm font-semibold ${
                              (quizAnswers[q.id] as number) === n
                                ? "bg-brand-700 text-white"
                                : "bg-white border border-slate-200"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    )}
                    {q.type === "bool" && (
                      <div className="flex gap-2">
                        <Chip active={quizAnswers[q.id] === true} onClick={() => updateQuizAnswer(q.id, true)}>Да</Chip>
                        <Chip active={quizAnswers[q.id] === false} onClick={() => updateQuizAnswer(q.id, false)}>Нет</Chip>
                      </div>
                    )}
                    {q.type === "text" && (
                      <input
                        className="input"
                        value={(quizAnswers[q.id] as string) || ""}
                        onChange={(e) => updateQuizAnswer(q.id, e.target.value)}
                      />
                    )}
                    {q.type === "number" && (
                      <input
                        type="number"
                        className="input"
                        value={(quizAnswers[q.id] as number | string) || ""}
                        onChange={(e) => updateQuizAnswer(q.id, e.target.value ? Number(e.target.value) : "")}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title={<span className="flex items-center gap-1"><Shield size={12} /> Согласие на обработку ПДн (152-ФЗ / GDPR)</span>}>
            <label className="flex items-start gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="w-4 h-4 mt-0.5"
              />
              <span>
                Контакт согласен на обработку персональных данных согласно 152-ФЗ (РФ) / GDPR.
                Версия согласия: <code className="text-xs">{consentTextVersion}</code>.
              </span>
            </label>
          </Section>

          {exhibitions.length > 0 && (
            <Section title="Выставка">
              <select
                className="input"
                value={exhibitionId}
                onChange={(e) => setExhibitionId(e.target.value)}
              >
                {exhibitions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                    {e.is_active ? " (активна)" : ""}
                  </option>
                ))}
              </select>
            </Section>
          )}

          {err && <div className="text-rose-600 text-sm">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-secondary" onClick={() => setStep(1)}>Назад</button>
            <button className="btn-primary" onClick={submit}>Обработать с AI</button>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
        active
          ? "bg-brand-700 text-white"
          : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

function FileButton({
  icon,
  label,
  accept,
  capture,
  onFile,
}: {
  icon: React.ReactNode;
  label: string;
  accept?: string;
  capture?: "user" | "environment";
  onFile: (f: File | null) => void;
}) {
  const id = `file-${label}-${Math.random().toString(36).slice(2)}`;
  return (
    <label
      htmlFor={id}
      className="btn-secondary cursor-pointer"
    >
      {icon}
      {label}
      <input
        id={id}
        type="file"
        accept={accept}
        capture={capture}
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
