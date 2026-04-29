import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Mic, Users, ListChecks } from "lucide-react";
import { listExhibitions } from "@/api/exhibitions";
import { listContacts } from "@/api/contacts";
import { useAuth } from "@/store/auth";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const exhibitionsQ = useQuery({ queryKey: ["exhibitions"], queryFn: listExhibitions });
  const contactsQ = useQuery({ queryKey: ["contacts"], queryFn: () => listContacts() });

  const activeExhibition = exhibitionsQ.data?.find((e) => e.id === user?.active_exhibition_id);
  const totalContacts = contactsQ.data?.length ?? 0;
  const tasksCount = 0; // placeholder until tasks router lands

  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="ЭкспоЛид" subtitle="Захват контактов на выставках" />

      <div className="px-4 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          {activeExhibition ? (
            <div>
              <p className="text-xs text-slate-500">Активная выставка</p>
              <p className="font-semibold text-slate-900 truncate">{activeExhibition.name}</p>
              {activeExhibition.location && (
                <p className="text-xs text-slate-500 mt-0.5">{activeExhibition.location}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">Нет активной выставки</p>
              <Button variant="secondary" size="sm" onClick={() => navigate("/settings")}>
                Выбрать
              </Button>
            </div>
          )}
        </div>

        <Button
          fullWidth
          size="lg"
          onClick={() => navigate("/capture")}
          className="!h-16"
        >
          <Mic size={22} /> Записать контакт
        </Button>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate("/contacts")}
            className="bg-white border border-slate-200 rounded-xl p-4 text-left active:bg-slate-50"
          >
            <Users size={20} className="text-amber-600" />
            <p className="text-2xl font-bold text-slate-900 mt-2">{totalContacts}</p>
            <p className="text-xs text-slate-500">Контактов</p>
          </button>
          <button
            onClick={() => navigate("/tasks")}
            className="bg-white border border-slate-200 rounded-xl p-4 text-left active:bg-slate-50"
          >
            <ListChecks size={20} className="text-amber-600" />
            <p className="text-2xl font-bold text-slate-900 mt-2">{tasksCount}</p>
            <p className="text-xs text-slate-500">Задач</p>
          </button>
        </div>

        <p className="text-center text-xs text-slate-400 pt-4">
          Made by Devin · v0.1.0
        </p>
      </div>
    </div>
  );
}
