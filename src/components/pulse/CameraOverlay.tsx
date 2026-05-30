import { useCallback, useEffect, useRef, useState } from "react";
import { FlipHorizontal, X } from "lucide-react";

interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export function CameraOverlay({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      setError(msg);
    }
  }, []);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode, startCamera]);

  const toggleCamera = () => {
    setFacingMode((f) => (f === "user" ? "environment" : "user"));
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    onCapture(dataUrl);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Toolbar */}
      <div className="relative flex items-center justify-between px-4 py-3 z-10">
        <button
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white backdrop-blur"
          aria-label="Cerrar cámara"
        >
          <X className="h-5 w-5" />
        </button>
        <button
          onClick={toggleCamera}
          className="grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white backdrop-blur"
          aria-label="Cambiar cámara"
        >
          <FlipHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* Video preview */}
      <div className="flex-1 relative flex items-center justify-center">
        {error ? (
          <div className="text-center px-6">
            <p className="text-sm text-red-400 mb-2">Error: {error}</p>
            <p className="text-xs text-white/60">Permite el acceso a la cámara en los ajustes del navegador</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Capture button */}
      <div className="flex justify-center py-8">
        <button
          onClick={capture}
          disabled={!!error}
          className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-white/20 backdrop-blur disabled:opacity-40 active:scale-90 transition"
          aria-label="Capturar foto"
        >
          <div className="h-12 w-12 rounded-full bg-white" />
        </button>
      </div>
    </div>
  );
}