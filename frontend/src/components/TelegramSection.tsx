import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Send, Trash2, Settings } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/store/auth";
import {
  TelegramStatus,
  configureBot,
  getStatus,
  requestPairCode,
  unpair,
} from "@/api/telegram";

export default function TelegramSection() {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const { data, isLoading } = useQuery<TelegramStatus>({
    queryKey: ["telegram-status"],
    queryFn: getStatus,
  });

  const [copied, setCopied] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [token, setToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);

  const pairMut = useMutation({
    mutationFn: requestPairCode,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["telegram-status"] }),
  });
  const unpairMut = useMutation({
    mutationFn: unpair,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["telegram-status"] }),
  });
  const configMut = useMutation({
    mutationFn: ({ t, u }: { t: string; u?: string }) => configureBot(t, u),
    onSuccess: () => {
      setToken("");
      setShowConfig(false);
      setConfigError(null);
      qc.invalidateQueries({ queryKey: ["telegram-status"] });
    },
    onError: (e: unknown) => setConfigError((e as Error).message),
  });

  // refresh status while waiting for pairing
  useEffect(() => {
    if (!data?.code) return;
    const id = setInterval(() => qc.invalidateQueries({ queryKey: ["telegram-status"] }), 4000);
    return () => clearInterval(id);
  }, [data?.code, qc]);

  if (isLoading || !data) return null;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-900">Telegram-бот</p>
        {me?.role === "owner" && (
          <button
            type="button"
            onClick={() => setShowConfig((v) => !v)}
            className="text-xs text-slate-500 hover:text-slate-900 inline-flex items-center gap-1"
          >
            <Settings size={14} /> Настроить
          </button>
        )}
      </div>

      {!data.enabled && !showConfig && (
        <p className="text-sm text-slate-500">
          Бот не настроен. {me?.role === "owner" ? "Нажмите «Настроить»." : "Попросите владельца аккаунта настроить бота."}
        </p>
      )}

      {showConfig && me?.role === "owner" && (
        <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
          <p className="text-xs text-slate-600">
            Токен от @BotFather (вид <code>123456789:AA…</code>) и username бота (без @).
          </p>
          <Input
            placeholder="Токен"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type="password"
          />
          <Input
            placeholder="Username бота (например Expolead_bot)"
            value={botUsername}
            onChange={(e) => setBotUsername(e.target.value)}
          />
          {configError && <p className="text-xs text-rose-600">{configError}</p>}
          <Button
            onClick={() => configMut.mutate({ t: token, u: botUsername || undefined })}
            disabled={!token || configMut.isPending}
            fullWidth
          >
            Сохранить и запустить бота
          </Button>
        </div>
      )}

      {data.enabled && data.paired && (
        <div className="space-y-2">
          <p className="text-sm text-emerald-700">Привязан · chat #{data.chat_id}</p>
          <Button variant="danger" onClick={() => unpairMut.mutate()} disabled={unpairMut.isPending}>
            <Trash2 size={14} /> Отвязать
          </Button>
        </div>
      )}

      {data.enabled && !data.paired && (
        <div className="space-y-2">
          {data.code ? (
            <>
              <p className="text-sm text-slate-700">
                Откройте{" "}
                {data.bot_username ? (
                  <a
                    href={`https://t.me/${data.bot_username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    @{data.bot_username}
                  </a>
                ) : (
                  "бота в Telegram"
                )}{" "}
                и отправьте:
              </p>
              <div className="flex gap-2">
                <code className="flex-1 bg-slate-100 px-3 py-2 rounded font-mono text-sm">
                  /start {data.code}
                </code>
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(`/start ${data.code}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  <Copy size={14} /> {copied ? "✓" : "Копировать"}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                После отправки сообщения этот блок обновится автоматически.
              </p>
            </>
          ) : (
            <Button onClick={() => pairMut.mutate()} disabled={pairMut.isPending}>
              <Send size={14} /> Получить код привязки
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
