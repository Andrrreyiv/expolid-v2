import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Send, Sparkles, Trash2 } from "lucide-react";
import { deleteFollowup, listFollowups, markSent } from "@/api/followups";
import { Button } from "@/components/ui/Button";
import FollowUpModal from "@/components/FollowUpModal";
import type { Contact } from "@/api/contacts";

const KIND_LABEL: Record<string, string> = {
  email: "Письмо",
  proposal: "КП",
  invitation: "Приглашение",
  call_script: "Скрипт звонка",
};

export default function FollowUpsSection({ contact }: { contact: Contact }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const fuQ = useQuery({
    queryKey: ["followups", contact.id],
    queryFn: () => listFollowups(contact.id),
  });

  const sentMut = useMutation({
    mutationFn: (id: number) => markSent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups", contact.id] }),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => deleteFollowup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups", contact.id] }),
  });

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-900">Follow-up</p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Sparkles size={16} /> Создать
        </Button>
      </div>

      {fuQ.data?.length === 0 && (
        <p className="text-sm text-slate-500">
          Письма / КП / приглашения / скрипты звонков появятся здесь.
        </p>
      )}

      <div className="space-y-2">
        {fuQ.data?.map((f) => (
          <div key={f.id} className="rounded-lg border border-slate-200 p-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500">
                {KIND_LABEL[f.kind] ?? f.kind} · {new Date(f.created_at).toLocaleString("ru-RU")}
                {f.sent_at && " · отправлено"}
              </p>
              <div className="flex items-center gap-1">
                {!f.sent_at && (
                  <button
                    onClick={() => sentMut.mutate(f.id)}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    Отметить
                  </button>
                )}
                <button
                  onClick={() => delMut.mutate(f.id)}
                  className="p-1 text-slate-400 hover:text-rose-600"
                  aria-label="Удалить"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {f.subject && (
              <p className="text-sm font-medium text-slate-900 mt-1 truncate">{f.subject}</p>
            )}
            <pre className="text-xs text-slate-700 mt-1 whitespace-pre-wrap font-sans line-clamp-4">
              {f.body}
            </pre>
          </div>
        ))}
      </div>

      {open && <FollowUpModal contact={contact} onClose={() => setOpen(false)} />}
    </section>
  );
}
