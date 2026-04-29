import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getContact } from "@/api/contacts";
import { Button } from "@/components/ui/Button";
import PageHeader from "@/components/PageHeader";

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["contact", id],
    queryFn: () => getContact(Number(id)),
    enabled: Boolean(id),
  });

  if (q.isLoading) {
    return <p className="p-4 text-slate-500">Загрузка...</p>;
  }
  if (!q.data) {
    return <p className="p-4 text-slate-500">Контакт не найден</p>;
  }
  const c = q.data;

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title={c.name || "(Без имени)"} subtitle={c.company || undefined} />
      <div className="px-4 space-y-3">
        <Field label="Должность" value={c.position} />
        <Field label="Email" value={c.email} />
        <Field label="Телефон" value={c.phone} />
        <Field label="Сайт" value={c.website} />
        <Field label="Telegram" value={c.telegram} />
        <Field label="WhatsApp" value={c.whatsapp} />
        <Field label="LinkedIn" value={c.linkedin} />
        <Field label="Павильон / Стенд" value={[c.pavilion, c.stand].filter(Boolean).join(" · ")} />
        <Field label="Тип" value={c.contact_type} />
        <Field label="Статус" value={c.status} />
        <Field label="Заметка" value={c.note} />
        <Button variant="secondary" fullWidth onClick={() => navigate(-1)}>
          Назад
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (!value) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm text-slate-900 mt-0.5 break-words">{String(value)}</p>
    </div>
  );
}
