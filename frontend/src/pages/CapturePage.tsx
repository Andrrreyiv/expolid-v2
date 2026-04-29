import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/Button";
import { useNavigate } from "react-router-dom";

export default function CapturePage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Записать контакт" subtitle="Скоро (Пакет 1)" />
      <div className="px-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
          Поток захвата (фото визитки + фото человека + голос + QR + заметки) появится в
          Пакете 1.
        </div>
        <Button variant="secondary" fullWidth className="mt-4" onClick={() => navigate("/")}>
          На главную
        </Button>
      </div>
    </div>
  );
}
