import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { api, apiBaseURL, type Exhibition } from "../api";

export default function ExportPage() {
  const [exhibitions, setExhibitions] = useState<Exhibition[]>([]);
  const [exhibitionId, setExhibitionId] = useState<string>("");

  useEffect(() => {
    api.get<Exhibition[]>("/api/exhibitions").then((r) => setExhibitions(r.data));
  }, []);

  const download = async () => {
    const url = exhibitionId
      ? `${apiBaseURL}/api/export/contacts.xlsx?exhibition_id=${exhibitionId}`
      : `${apiBaseURL}/api/export/contacts.xlsx`;
    const token = localStorage.getItem("token");
    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!r.ok) {
      alert("Ошибка экспорта");
      return;
    }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `contacts_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Экспорт контактов</h1>
      <div className="card p-4 space-y-3">
        <div>
          <label className="label">Выставка (опционально)</label>
          <select
            className="input"
            value={exhibitionId}
            onChange={(e) => setExhibitionId(e.target.value)}
          >
            <option value="">Все выставки</option>
            {exhibitions.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        <button onClick={download} className="btn-primary w-full">
          <Download size={16} /> Скачать Excel
        </button>
        <p className="text-xs text-slate-500">
          Колонки: Дата, Выставка, ФИО, Компания, Должность, Телефон, Email, Сайт,
          Telegram, WhatsApp, LinkedIn, Тип, Статус, AI-балл, Резюме, Договорённости,
          Следующий шаг, Дата напоминания, Связь, Поговорил с, Менеджер, Источник.
        </p>
      </div>
    </div>
  );
}
