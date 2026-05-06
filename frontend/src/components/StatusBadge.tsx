import { STATUS_LABEL, TYPE_LABEL } from "../lib/utils";

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "hot" ? "badge-hot" : status === "cold" ? "badge-cold" : "badge-warm";
  const dot =
    status === "hot" ? "bg-rose-500" : status === "cold" ? "bg-slate-400" : "bg-amber-500";
  return (
    <span className={cls}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} /> {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const cls =
    type === "client"
      ? "badge-client"
      : type === "partner"
        ? "badge-partner"
        : "badge bg-slate-100 text-slate-700";
  return <span className={cls}>{TYPE_LABEL[type] ?? type}</span>;
}
