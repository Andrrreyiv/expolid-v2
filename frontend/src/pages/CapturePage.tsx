import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronLeft, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import PageHeader from "@/components/PageHeader";
import PhotoCapture from "@/components/PhotoCapture";
import VoiceRecorder from "@/components/VoiceRecorder";
import { absoluteUrl, uploadBlob, uploadDataUrl } from "@/api/uploads";
import { createContact, type Contact } from "@/api/contacts";
import { scanQrFromDataUrl, type ParsedCard } from "@/lib/qr";

type Step = 1 | 2 | 3;

const CONTACT_TYPES = [
  { value: "client", label: "Клиент" },
  { value: "partner", label: "Партнёр" },
  { value: "vendor", label: "Поставщик" },
  { value: "media", label: "Медиа" },
  { value: "other", label: "Другое" },
];

const STATUSES = [
  { value: "hot", label: "Горячий", cls: "bg-rose-600 text-white" },
  { value: "warm", label: "Тёплый", cls: "bg-amber-500 text-white" },
  { value: "cold", label: "Холодный", cls: "bg-sky-500 text-white" },
  { value: "new", label: "Новый", cls: "bg-slate-500 text-white" },
];

interface FormState {
  name: string;
  company: string;
  position: string;
  email: string;
  phone: string;
  website: string;
  telegram: string;
  whatsapp: string;
  linkedin: string;
  pavilion: string;
  stand: string;
  contact_type: string;
  status: string;
  note: string;
  card_belongs_to_other: boolean;
  card_owner_name: string;
  card_owner_position: string;
  card_owner_email: string;
  card_owner_phone: string;
}

const emptyForm: FormState = {
  name: "",
  company: "",
  position: "",
  email: "",
  phone: "",
  website: "",
  telegram: "",
  whatsapp: "",
  linkedin: "",
  pavilion: "",
  stand: "",
  contact_type: "",
  status: "warm",
  note: "",
  card_belongs_to_other: false,
  card_owner_name: "",
  card_owner_position: "",
  card_owner_email: "",
  card_owner_phone: "",
};

export default function CapturePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [cardImageUrl, setCardImageUrl] = useState<string | null>(null);
  const [personImageUrl, setPersonImageUrl] = useState<string | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [qr, setQr] = useState<ParsedCard | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleCardPhoto(dataUrl: string) {
    try {
      const upload = await uploadDataUrl(dataUrl, "card.jpg");
      setCardImageUrl(upload.url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    // QR scan in background — prefill what we can
    try {
      const parsed = await scanQrFromDataUrl(dataUrl);
      if (parsed) {
        setQr(parsed);
        setForm((f) => ({
          ...f,
          name: f.name || parsed.name || "",
          company: f.company || parsed.org || "",
          position: f.position || parsed.position || "",
          email: f.email || parsed.email || "",
          phone: f.phone || parsed.phone || "",
          website: f.website || parsed.url || "",
          telegram: f.telegram || parsed.telegram || "",
        }));
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("qr scan failed", e);
    }
    setStep(2);
  }

  async function handlePersonPhoto(dataUrl: string) {
    try {
      const upload = await uploadDataUrl(dataUrl, "person.jpg");
      setPersonImageUrl(upload.url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  async function handleVoice(blob: Blob) {
    setVoiceBlob(blob);
    if (blob.size === 0) {
      setVoiceUrl(null);
      return;
    }
    try {
      const upload = await uploadBlob(blob, "voice.webm");
      setVoiceUrl(upload.url);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: Partial<Contact> = {
        ...form,
        contact_type: form.contact_type || null,
        card_image_url: cardImageUrl,
        person_image_url: personImageUrl,
        voice_url: voiceUrl,
      };
      const created = await createContact(payload);
      navigate(`/contacts/${created.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setError(e?.response?.data?.detail ?? "Не удалось сохранить контакт");
    } finally {
      setSubmitting(false);
    }
  }

  function StepDots() {
    return (
      <div className="flex items-center justify-center gap-2 mb-3">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`h-2 rounded-full transition-all ${
              n === step ? "w-8 bg-brand" : "w-2 bg-slate-300"
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto pb-4">
      <PageHeader
        title={step === 1 ? "Фото визитки" : step === 2 ? "Голос и фото" : "Контакт"}
        subtitle={`Шаг ${step} из 3`}
        right={
          <button
            onClick={() => navigate(-1)}
            className="text-slate-400 hover:text-slate-700 p-1"
            aria-label="Закрыть"
          >
            <X size={22} />
          </button>
        }
      />
      <div className="px-4">
        <StepDots />

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Сфотографируйте визитку. Если на ней есть QR-код, мы попробуем его распознать и
              заполнить поля автоматически.
            </p>
            <PhotoCapture onAccept={handleCardPhoto} />
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                setCardImageUrl(null);
                setStep(2);
              }}
            >
              Пропустить (добавить позже)
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            {qr && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <ScanLine size={16} /> QR-код распознан
                  <span className="text-xs text-emerald-600 font-normal">{qr.format}</span>
                </div>
                <p className="text-xs text-emerald-700">
                  Поля предзаполнены — проверьте на шаге 3.
                </p>
              </div>
            )}

            {cardImageUrl && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Фото визитки</p>
                <img
                  src={absoluteUrl(cardImageUrl) || ""}
                  alt="card"
                  className="w-full rounded-lg max-h-48 object-contain bg-slate-100"
                />
              </div>
            )}

            <div>
              <p className="text-sm font-semibold text-slate-900 mb-2">Фото человека (опционально)</p>
              {personImageUrl ? (
                <div className="space-y-2">
                  <img
                    src={absoluteUrl(personImageUrl) || ""}
                    alt="person"
                    className="w-full rounded-lg max-h-48 object-contain bg-slate-100"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    onClick={() => setPersonImageUrl(null)}
                  >
                    Убрать
                  </Button>
                </div>
              ) : (
                <PhotoCapture facingMode="user" onAccept={handlePersonPhoto} />
              )}
            </div>

            <VoiceRecorder onRecorded={handleVoice} />

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                <ChevronLeft size={18} /> Назад
              </Button>
              <Button onClick={() => setStep(3)}>Далее</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              label="Имя"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
            <Input
              label="Компания"
              value={form.company}
              onChange={(e) => update("company", e.target.value)}
            />
            <Input
              label="Должность"
              value={form.position}
              onChange={(e) => update("position", e.target.value)}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
              <Input
                label="Телефон"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
              />
            </div>
            <Input
              label="Сайт"
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                label="Telegram"
                value={form.telegram}
                onChange={(e) => update("telegram", e.target.value)}
                placeholder="@user"
              />
              <Input
                label="WhatsApp"
                value={form.whatsapp}
                onChange={(e) => update("whatsapp", e.target.value)}
              />
              <Input
                label="LinkedIn"
                value={form.linkedin}
                onChange={(e) => update("linkedin", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Павильон"
                value={form.pavilion}
                onChange={(e) => update("pavilion", e.target.value)}
              />
              <Input
                label="Стенд"
                value={form.stand}
                onChange={(e) => update("stand", e.target.value)}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Тип</p>
              <div className="grid grid-cols-3 gap-1.5">
                {CONTACT_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t.value}
                    onClick={() => update("contact_type", form.contact_type === t.value ? "" : t.value)}
                    className={`text-xs h-9 rounded-lg border ${
                      form.contact_type === t.value
                        ? "border-brand bg-brand text-white"
                        : "border-slate-300 text-slate-700 bg-white"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-slate-700 mb-1">Статус</p>
              <div className="grid grid-cols-4 gap-1.5">
                {STATUSES.map((s) => (
                  <button
                    type="button"
                    key={s.value}
                    onClick={() => update("status", s.value)}
                    className={`text-xs h-9 rounded-lg ${
                      form.status === s.value ? s.cls : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
              <input
                type="checkbox"
                checked={form.card_belongs_to_other}
                onChange={(e) => update("card_belongs_to_other", e.target.checked)}
                className="w-4 h-4"
              />
              Я общался не с владельцем визитки
            </label>

            {form.card_belongs_to_other && (
              <div className="border-l-2 border-amber-300 pl-3 space-y-2">
                <p className="text-xs text-slate-500">
                  Заполните данные собственно человека, с которым общались, выше. А ниже — данные с
                  визитки (другого человека).
                </p>
                <Input
                  label="Имя на визитке"
                  value={form.card_owner_name}
                  onChange={(e) => update("card_owner_name", e.target.value)}
                />
                <Input
                  label="Должность на визитке"
                  value={form.card_owner_position}
                  onChange={(e) => update("card_owner_position", e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="Email на визитке"
                    value={form.card_owner_email}
                    onChange={(e) => update("card_owner_email", e.target.value)}
                  />
                  <Input
                    label="Телефон на визитке"
                    value={form.card_owner_phone}
                    onChange={(e) => update("card_owner_phone", e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Заметка</label>
              <textarea
                value={form.note}
                onChange={(e) => update("note", e.target.value)}
                rows={4}
                className="w-full p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand text-sm"
                placeholder="Что обсудили, договорённости, следующий шаг..."
              />
            </div>

            {error && <p className="text-rose-600 text-sm">{error}</p>}

            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                <ChevronLeft size={18} /> Назад
              </Button>
              <Button type="submit" disabled={submitting}>
                <CheckCircle2 size={18} /> {submitting ? "..." : "Сохранить"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
