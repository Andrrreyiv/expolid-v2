import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getContact, updateContact } from "@/api/contacts";
import { listTeam } from "@/api/team";
import { absoluteUrl } from "@/api/uploads";
import { Button } from "@/components/ui/Button";
import PageHeader from "@/components/PageHeader";
import TasksSection from "@/components/TasksSection";
import FollowUpsSection from "@/components/FollowUpsSection";

const statusColors: Record<string, string> = {
  hot: "bg-rose-100 text-rose-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-sky-100 text-sky-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-slate-100 text-slate-500",
  new: "bg-slate-100 text-slate-700",
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["contact", id],
    queryFn: () => getContact(Number(id)),
    enabled: Boolean(id),
  });
  const team = useQuery({ queryKey: ["team"], queryFn: listTeam });
  const assignMut = useMutation({
    mutationFn: (assignee_id: number | null) =>
      updateContact(Number(id), { assignee_id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
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
      <PageHeader
        title={c.name || "(Без имени)"}
        subtitle={c.company || undefined}
        right={
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              statusColors[c.status] ?? statusColors.new
            }`}
          >
            {c.status}
          </span>
        }
      />
      <div className="px-4 space-y-3">
        {c.person_image_url && (
          <img
            src={absoluteUrl(c.person_image_url) || ""}
            alt="Фото человека"
            className="w-full rounded-xl max-h-72 object-cover bg-slate-100"
          />
        )}

        {c.voice_url && (
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-2">Голосовая заметка</p>
            <audio
              controls
              src={absoluteUrl(c.voice_url) || undefined}
              className="w-full"
            />
          </div>
        )}

        <Field label="Должность" value={c.position} />
        <Field label="Email" value={c.email} />
        <Field label="Телефон" value={c.phone} />
        <Field label="Сайт" value={c.website} />
        <Field label="Telegram" value={c.telegram} />
        <Field label="WhatsApp" value={c.whatsapp} />
        <Field label="LinkedIn" value={c.linkedin} />
        <Field
          label="Павильон / Стенд"
          value={[c.pavilion, c.stand].filter(Boolean).join(" · ") || null}
        />
        <Field label="Тип" value={c.contact_type} />

        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <label className="text-xs text-slate-500">Менеджер</label>
          <select
            className="mt-1 w-full text-sm bg-transparent"
            value={c.assignee_id ?? ""}
            disabled={assignMut.isPending}
            onChange={(e) =>
              assignMut.mutate(e.target.value === "" ? null : Number(e.target.value))
            }
          >
            <option value="">— не назначен —</option>
            {(team.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role})
              </option>
            ))}
          </select>
        </div>

        {c.card_belongs_to_other && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
            <p className="text-xs text-amber-700 font-medium">Визитка чужая</p>
            <Field label="Имя на визитке" value={c.card_owner_name} compact />
            <Field label="Должность" value={c.card_owner_position} compact />
            <Field label="Email" value={c.card_owner_email} compact />
            <Field label="Телефон" value={c.card_owner_phone} compact />
          </div>
        )}

        {c.card_image_url && (
          <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-xs text-slate-500 mb-2">Фото визитки</p>
            <img
              src={absoluteUrl(c.card_image_url) || ""}
              alt="Визитка"
              className="w-full rounded-lg bg-slate-100"
            />
          </div>
        )}

        <Field label="Заметка" value={c.note} />

        <TasksSection contactId={c.id} />
        <FollowUpsSection contact={c} />

        <Button variant="secondary" fullWidth onClick={() => navigate(-1)}>
          Назад
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  compact,
}: {
  label: string;
  value: string | number | null | undefined;
  compact?: boolean;
}) {
  if (!value) return null;
  return (
    <div
      className={
        compact
          ? "flex justify-between gap-2 text-xs"
          : "bg-white border border-slate-200 rounded-lg p-3"
      }
    >
      <p className={compact ? "text-amber-700" : "text-xs text-slate-500"}>{label}</p>
      <p
        className={
          compact ? "text-amber-900 break-words" : "text-sm text-slate-900 mt-0.5 break-words"
        }
      >
        {String(value)}
      </p>
    </div>
  );
}
