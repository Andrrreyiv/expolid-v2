import { useEffect, useRef, useState } from "react";
import { Camera, Upload, X, Repeat } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface PhotoCaptureProps {
  /** dataUrl returned to caller when user accepts a photo */
  onAccept: (dataUrl: string) => void;
  /** caller may close/cancel */
  onCancel?: () => void;
  facingMode?: "environment" | "user";
}

type Mode = "choose" | "camera" | "preview";

export default function PhotoCapture({
  onAccept,
  onCancel,
  facingMode = "environment",
}: PhotoCaptureProps) {
  const [mode, setMode] = useState<Mode>("choose");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode("camera");
    } catch (e) {
      setError("Не удалось получить доступ к камере. Используйте загрузку файла.");
      // eslint-disable-next-line no-console
      console.error(e);
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  function takeShot() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreviewUrl(dataUrl);
    stopCamera();
    setMode("preview");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
      setMode("preview");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3">
      {mode === "choose" && (
        <div className="space-y-3">
          <Button fullWidth size="lg" onClick={startCamera}>
            <Camera size={20} /> Камера
          </Button>
          <label className="block">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
            <span className="inline-flex items-center justify-center gap-2 w-full h-14 px-5 text-lg font-semibold rounded-xl bg-white text-brand border border-slate-200 hover:bg-slate-50 cursor-pointer">
              <Upload size={20} /> Загрузить файл
            </span>
          </label>
          {error && <p className="text-rose-600 text-sm">{error}</p>}
          {onCancel && (
            <Button fullWidth size="md" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
          )}
        </div>
      )}

      {mode === "camera" && (
        <div className="space-y-3">
          <video
            ref={videoRef}
            playsInline
            muted
            className="w-full rounded-lg bg-slate-900 aspect-video object-cover"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                stopCamera();
                setMode("choose");
              }}
            >
              <X size={18} /> Отмена
            </Button>
            <Button onClick={takeShot}>
              <Camera size={18} /> Снимок
            </Button>
          </div>
        </div>
      )}

      {mode === "preview" && previewUrl && (
        <div className="space-y-3">
          <img
            src={previewUrl}
            alt="preview"
            className="w-full rounded-lg max-h-[60vh] object-contain bg-slate-100"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setPreviewUrl(null);
                setMode("choose");
              }}
            >
              <Repeat size={18} /> Переснять
            </Button>
            <Button onClick={() => onAccept(previewUrl)}>Принять</Button>
          </div>
        </div>
      )}
    </div>
  );
}
