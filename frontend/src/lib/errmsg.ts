/** Normalize FastAPI error responses into a string message safe for React rendering. */
export function errMsg(e: unknown, fallback = "Что-то пошло не так"): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  return fallback;
}
