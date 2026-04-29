import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface VoiceRecorderProps {
  onRecorded?: (blob: Blob, durationSec: number) => void;
  initialBlob?: Blob | null;
}

export default function VoiceRecorder({ onRecorded, initialBlob }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(initialBlob ?? null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      stopStream();
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
        setBlob(finalBlob);
        onRecorded?.(finalBlob, seconds);
        stopStream();
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setError("Нет доступа к микрофону");
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  function stop() {
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  function discard() {
    setBlob(null);
    setSeconds(0);
    onRecorded?.(new Blob(), 0);
  }

  function play() {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Голосовая заметка</p>
          <p className="text-xs text-slate-500">{format(seconds)}</p>
        </div>
        {!recording && !blob && (
          <Button onClick={start}>
            <Mic size={18} /> Запись
          </Button>
        )}
        {recording && (
          <Button variant="danger" onClick={stop}>
            <Square size={18} /> Стоп
          </Button>
        )}
        {!recording && blob && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={play} aria-label="Воспроизвести">
              <Play size={18} />
            </Button>
            <Button variant="ghost" onClick={discard} aria-label="Удалить">
              <Trash2 size={18} />
            </Button>
          </div>
        )}
      </div>
      {recording && (
        <div className="flex items-center gap-2 text-rose-600 text-xs">
          <span className="inline-block w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
          Идёт запись...
        </div>
      )}
      {error && <p className="text-rose-600 text-sm">{error}</p>}
    </div>
  );
}

function format(s: number): string {
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return undefined;
}
