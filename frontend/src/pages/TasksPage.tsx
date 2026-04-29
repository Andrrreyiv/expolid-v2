import PageHeader from "@/components/PageHeader";

export default function TasksPage() {
  return (
    <div className="max-w-md mx-auto">
      <PageHeader title="Задачи" subtitle="Скоро" />
      <div className="px-4">
        <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-slate-500 text-sm">
          Раздел появится в Пакете 2 (после релиза follow-up + tasks API).
        </div>
      </div>
    </div>
  );
}
