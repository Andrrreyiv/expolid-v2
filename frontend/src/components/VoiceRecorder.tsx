import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface VoiceRecorderProps {
  onRecorded?: (blob: Blob, durationSec: number) => void;
  onTranscript?: (transcript: string) => void;
  onSttStatus?: (status: { available: boolean; error?: string }) => void;
  initialBlob?: Blob | null;
}

type SRErrorEvent = { error?: string };
type SR = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal?: boolean; length: number }>; resultIndex: number }) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): { new (): SR } | null {
  const w = window as unknown as { SpeechRecognition?: { new (): SR }; webkitSpeechRecognition?: { new (): SR } };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function VoiceRecorder({ onRecorded, onTranscript, onSttStatus, initialBlob }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(initialBlob ?? null);
  const [error, setError] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SR | null>(null);
  const transcriptRef = useRef("");
  const sttErrorRef = useRef<string | null>(null);

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
      transcriptRef.current = "";
      setLiveTranscript("");
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);

      // Start browser speech recognition in parallel (best-effort).
      const Ctor = getSpeechRecognitionCtor();
      if (Ctor) {
        try {
          const sr = new Ctor();
          sr.continuous = true;
          sr.interimResults = true;
          sr.lang = "ru-RU";
          sr.onresult = (e) => {
            let finalText = transcriptRef.current;
            let interim = "";
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const r = e.results[i] as unknown as { 0: { transcript: string }; isFinal?: boolean };
              const piece = r[0].transcript;
              if (r.isFinal) {
                finalText = (finalText + " " + piece).trim();
              } else {
                interim += piece;
              }
            }
            transcriptRef.current = finalText;
            setLiveTranscript((finalText + " " + interim).trim());
          };
          sr.onerror = (ev) => {
            sttErrorRef.current = ev?.error ?? "unknown";
            onSttStatus?.({ available: true, error: ev?.error });
          };
          sr.onend = () => {
            // Auto-restart while we're still recording.
            if (recognitionRef.current === sr && recorderRef.current?.state === "recording") {
              try { sr.start(); } catch { /* ignore */ }
            }
          };
          sr.start();
          recognitionRef.current = sr;
          onSttStatus?.({ available: true });
        } catch {
          onSttStatus?.({ available: false, error: "start-failed" });
        }
      } else {
        onSttStatus?.({ available: false, error: "no-api" });
      }
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
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setRecording(false);
    // Always notify parent of the final transcript — even an empty string tells
    // the UI "STT ran but produced nothing" so it can show a clear error.
    onTranscript?.(transcriptRef.current.trim());
    if (!transcriptRef.current.trim() && sttErrorRef.current) {
      onSttStatus?.({ available: true, error: sttErrorRef.current });
    }
  }

  function discard() {
    setBlob(null);
    setSeconds(0);
    transcriptRef.current = "";
    setLiveTranscript("");
    onRecorded?.(new Blob(), 0);
    onTranscript?.("");
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
      {liveTranscript && (
        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 max-h-24 overflow-auto">
          {liveTranscript}
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
