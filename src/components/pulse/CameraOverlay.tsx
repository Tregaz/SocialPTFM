import { useCallback, useEffect, useRef, useState } from "react";
import { FlipHorizontal, X, AlertCircle, RefreshCw, AlertTriangle } from "lucide-react";

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
  const [isReady, setIsReady] = useState(false);

  const startCamera = useCallback(async (facing: "user" | "environment") => {
    setIsReady(false);
    
    // Clear previous stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const constraintsList = [
      { 
        video: { 
          facingMode: facing, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        }, 
        audio: false 
      },
      { 
        video: { facingMode: facing }, 
        audio: false 
      },
      { 
        video: true, 
        audio: false 
      }
    ];

    let lastError: any = null;
    
    for (const constraints of constraintsList) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setError(null);
        return;
      } catch (err) {
        lastError = err;
        console.warn("Retrying camera with next constraints due to:", err);
      }
    }

    if (lastError) {
      const msg = lastError instanceof Error ? lastError.message : "Camera access denied";
      if (lastError.name === "NotReadableError" || msg.includes("Starting videoinput failed")) {
        setError("La cámara está en uso por otra aplicación o no responde. Reinicia tu navegador.");
      } else if (lastError.name === "NotAllowedError") {
        setError("Acceso denegado. Permite el uso de la cámara en los ajustes de tu navegador.");
      } else {
        setError(msg);
      }
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

  const retry = () => {
    setError(null);
    startCamera(facingMode);
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isReady) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    
    if (vw === 0 || vh === 0) return;

    // Target 9:16
    const targetRatio = 9 / 16;
    let sw, sh, sx, sy;

    if (vw / vh > targetRatio) {
      // Video is wider than target (e.g. horizontal)
      sh = vh;
      sw = vh * targetRatio;
      sx = (vw - sw) / 2;
      sy = 0;
    } else {
      // Video is taller than target
      sw = vw;
      sh = vw / targetRatio;
      sx = 0;
      sy = (vh - sh) / 2;
    }

    // High quality vertical capture
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext("2d", { alpha: false })!;

    // Background color for safety
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Mirror if using front camera
    if (facingMode === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    try {
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 720, 1280);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
      onCapture(dataUrl);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      console.error("Capture failed:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black overflow-hidden font-body">
      {/* Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-6 pointer-events-none">
        <button
          onClick={onClose}
          className="pointer-events-auto grid h-12 w-12 place-items-center rounded-2xl bg-black/40 text-white backdrop-blur-xl border border-white/10 transition active:scale-95"
          aria-label="Cerrar cámara"
        >
          <X className="h-6 w-6" />
        </button>
        {!error && (
          <button
            onClick={toggleCamera}
            className="pointer-events-auto grid h-12 w-12 place-items-center rounded-2xl bg-black/40 text-white backdrop-blur-xl border border-white/10 transition active:scale-95"
            aria-label="Cambiar cámara"
          >
            <FlipHorizontal className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Video preview */}
      <div className="flex-1 relative flex items-center justify-center bg-zinc-950">
        {error ? (
          <div className="animate-slide-up flex flex-col items-center text-center px-8">
            <div className="mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-danger/20 text-danger" style={{ boxShadow: "0 0 40px oklch(0.7 0.22 25 / 0.3)" }}>
              <AlertCircle className="h-10 w-10" />
            </div>
            <h3 className="mb-2 text-xl font-bold text-white">Error de Cámara</h3>
            <p className="mb-8 text-sm leading-relaxed text-white/60 max-w-[260px]">
              {error}
            </p>
            <button
              onClick={retry}
              className="flex items-center gap-3 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-black transition hover:bg-white/90 active:scale-95 shadow-xl"
            >
              <RefreshCw className="h-4 w-4" />
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => setIsReady(true)}
              className={`h-full w-full object-cover transition-opacity duration-500 ${isReady ? "opacity-100" : "opacity-0"}`}
            />
            {!isReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="h-12 w-12 rounded-full border-4 border-white/10 border-t-white animate-spin" />
                <p className="mt-4 text-xs font-medium tracking-widest text-white/40 uppercase">Iniciando...</p>
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Capture button area */}
      {!error && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-12 pt-20 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none">
          <button
            onClick={capture}
            disabled={!isReady}
            className="pointer-events-auto relative group"
            aria-label="Capturar foto"
          >
            {/* Outer Glow Layer */}
            <div className="absolute inset-0 rounded-full bg-white opacity-0 blur-2xl transition-all duration-500 group-active:opacity-40" />
            
            {/* Triple Layer Button */}
            <div className="relative grid h-20 w-20 place-items-center rounded-full border-[3px] border-white/30 p-1.5 transition-all duration-300 group-hover:border-white group-active:scale-90">
              <div className="h-full w-full rounded-full border-2 border-white/10 bg-white/5 backdrop-blur-sm" />
              <div className={`absolute inset-3 rounded-full transition-all duration-300 ${isReady ? "bg-white" : "bg-white/20 scale-75"}`} />
            </div>
            
            {/* Ready indicator */}
            {isReady && (
              <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-neon-2 text-black shadow-lg animate-pulse-dot">
                <div className="h-2 w-2 rounded-full bg-black" />
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
