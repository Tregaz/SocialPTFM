import { useEffect, useState, useRef } from "react";
import { Camera, Flag, Flame, Wifi, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CameraOverlay } from "./CameraOverlay";

interface FeedItem {
  id: string;
  author: string;
  peerId: string;
  gradient: string;
  caption: string;
  likes: number;
  liked: boolean;
  reported: boolean;
  ago: string;
  isPhoto: boolean;
  reportCount: number;
  hidden: boolean;
}

const GRADIENTS = [
  "linear-gradient(135deg,#ff2d87,#7a00ff)",
  "linear-gradient(135deg,#00d27a,#005a8a)",
  "linear-gradient(135deg,#ff7a00,#ff007a)",
  "linear-gradient(135deg,#7a00ff,#00d27a)",
  "linear-gradient(135deg,#005a8a,#ff2d87)",
];

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

function dbRowToItem(row: {
  id: string;
  usuario_nombre?: string | null;
  peer_id?: string | null;
  zona_recinto?: string | null;
  texto?: string | null;
  created_at?: string | null;
  hot?: boolean | null;
}): FeedItem {
  let texto = row.texto ?? "";
  let hidden = texto.startsWith("HIDDEN:");
  if (hidden) texto = texto.replace("HIDDEN:", "");

  let reportCount = 0;
  const reportMatch = texto.match(/^REPORT:(\d+)\|/);
  if (reportMatch) {
    reportCount = parseInt(reportMatch[1], 10);
    texto = texto.replace(/^REPORT:\d+\|/, "");
  }

  const isPhoto = texto.startsWith("PHOTO:");
  if (isPhoto) texto = texto.replace("PHOTO:", "");

  return {
    id: row.id,
    author: row.usuario_nombre ? `@${row.usuario_nombre}` : "@anon",
    peerId: row.peer_id ?? row.zona_recinto ?? "peer:db",
    gradient: gradientFor(row.id),
    caption: texto,
    likes: 0,
    liked: false,
    reported: false,
    ago: row.created_at ? timeAgo(row.created_at) : "ahora",
    isPhoto,
    reportCount,
    hidden: hidden || reportCount >= 3,
  };
}

interface Props {
  zone: string;
  eventId: string;
  nsfwModel?: any;
}

export function FeedView({ zone, eventId, nsfwModel }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const isDemo = !eventId || eventId.startsWith("demo-");

  useEffect(() => {
    if (isDemo) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("mensajes")
        .select("*")
        .eq("evento_id", eventId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!cancelled) {
        if (data) {
          setItems(data.map(dbRowToItem));
        } else if (error) {
          console.error("[FeedView] Error fetching mensajes:", error.message);
        }
        setLoading(false);
      }
    })();

    // Real messages from DB (postgres changes)
    const dbChannel = supabase
      .channel(`feed-db-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mensajes",
          filter: `evento_id=eq.${eventId}`,
        },
        (payload) => {
          const newItem = dbRowToItem(payload.new as Parameters<typeof dbRowToItem>[0]);
          setItems((prev) => [newItem, ...prev]);
        },
      )
      .subscribe();

    // Ephemeral bot messages via Broadcast (no DB write)
    const simChannel = supabase
      .channel(`pulse-sim-${eventId}`)
      .on(
        "broadcast",
        { event: "bot_message" },
        (msg: { payload: { id: string; author: string; zone: string; text: string; hot: boolean; ts: string } }) => {
          const p = msg.payload;
          setItems((prev) => [
            dbRowToItem({
              id: p.id,
              usuario_nombre: p.author,
              zona_recinto: p.zone,
              texto: p.text,
              hot: p.hot,
              created_at: p.ts,
            }),
            ...prev,
          ]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(simChannel);
    };
  }, [eventId, isDemo]);

  const toggleLike = (id: string) =>
    setItems((xs) =>
      xs.map((x) =>
        x.id === id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x,
      ),
    );

  const report = async (id: string) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, reported: true } : x)));

    const { data: msg } = await supabase
      .from("mensajes")
      .select("texto")
      .eq("id", id)
      .single();

    if (msg) {
      let texto = msg.texto || "";
      let reportCount = 0;
      const reportMatch = texto.match(/REPORT:(\d+)\|/);
      
      if (reportMatch) {
        reportCount = parseInt(reportMatch[1], 10) + 1;
        texto = texto.replace(/REPORT:\d+\|/, `REPORT:${reportCount}|`);
      } else {
        reportCount = 1;
        if (texto.startsWith("HIDDEN:")) {
          texto = texto.replace("HIDDEN:", `HIDDEN:REPORT:${reportCount}|`);
        } else {
          texto = `REPORT:${reportCount}|${texto}`;
        }
      }

      if (reportCount >= 3 && !texto.startsWith("HIDDEN:")) {
        texto = `HIDDEN:${texto}`;
      }

      await supabase
        .from("mensajes")
        .update({ texto })
        .eq("id", id);
    }
  };

  const handleCapture = async (dataUrl: string) => {
    setShowCamera(false);
    
    if (nsfwModel) {
      setIsVerifying(true);
      try {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((resolve) => (img.onload = resolve));
        
        const predictions = await nsfwModel.classify(img);
        const porn = predictions.find((p: any) => p.className === "Porn" || p.className === "Hentai");
        
        if (porn && porn.probability > 0.60) {
          alert("Contenido inapropiado detectado. La imagen no será publicada.");
          setIsVerifying(false);
          return;
        }
      } catch (err) {
        console.error("NSFW classification failed:", err);
      } finally {
        setIsVerifying(false);
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const texto = `PHOTO:${dataUrl}`;
    const { error } = await supabase
      .from("mensajes")
      .insert({
        evento_id: eventId,
        zona_recinto: zone,
        usuario_id: user.id,
        usuario_nombre: user.user_metadata.display_name || "anon",
        texto: texto,
        hot: false,
      });

    if (error) {
      console.error("Error uploading photo:", error.message);
    } else {
      localStorage.setItem("last_photo_ts", Date.now().toString());
    }
  };

  const onCaptureClick = () => {
    const lastTs = localStorage.getItem("last_photo_ts");
    if (lastTs) {
      const diff = Date.now() - parseInt(lastTs, 10);
      if (diff < 5 * 60 * 1000) {
        const mins = Math.ceil((5 * 60 * 1000 - diff) / 60000);
        alert(`Espera ${mins} min para otra foto (cooldown comunitario).`);
        return;
      }
    }
    setShowCamera(true);
  };

  return (
    <div className="relative pb-32">
      <div className="px-4 pt-2 pb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Feed efímero · {zone}</p>
          <h2 className="text-xl font-bold">P2P en vivo</h2>
        </div>
        <div className="flex items-center gap-1 rounded-full neon-chip px-3 py-1 text-[10px] font-semibold">
          <Wifi className="h-3 w-3" /> WebRTC
        </div>
      </div>

      {loading && (
        <div className="px-4 py-2 text-xs text-muted-foreground animate-pulse">
          Descargando de peers cercanos…
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Aún no hay mensajes en este evento. ¡Sé el primero!
        </div>
      )}

      <div className="flex flex-col gap-4 px-4">
        {items.map((it) => (
          <article
            key={it.id}
            className="overflow-hidden rounded-3xl border border-border bg-surface animate-slide-up"
          >
            {it.hidden ? (
              <div className="flex flex-col items-center justify-center gap-2 bg-slate-900/50 py-12 px-6 text-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground font-medium">
                  ⚠️ Contenido oculto por reportes de la comunidad
                </p>
              </div>
            ) : (
              <div className={it.isPhoto ? "p-3" : "relative aspect-[4/5]"} style={!it.isPhoto ? { background: it.gradient } : {}}>
                {it.isPhoto ? (
                  <img
                    src={it.caption}
                    alt="Captured content"
                    className="max-h-60 object-cover w-full rounded-lg border border-slate-800 bg-slate-950 mb-3"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "https://via.placeholder.com/400x300?text=Error+al+cargar+imagen";
                    }}
                  />
                ) : (
                  <>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                    <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-2 py-1 text-[10px] backdrop-blur">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-2)] animate-pulse-dot" />
                      {it.peerId}
                    </div>
                  </>
                )}
                
                <div className={it.isPhoto ? "flex items-end justify-between gap-3" : "absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3"}>
                  <div>
                    <p className="text-sm font-semibold">{it.author} · <span className="text-white/60 text-xs">{it.ago}</span></p>
                    <p className="text-sm text-white/90">{it.isPhoto ? "Captura en vivo" : it.caption}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => toggleLike(it.id)}
                      className={`grid h-11 w-11 place-items-center rounded-full glass ${it.liked ? "neon-border" : ""}`}
                    >
                      <Flame className={`h-5 w-5 ${it.liked ? "text-[var(--neon)]" : "text-white"}`} />
                    </button>
                    <button
                      disabled={it.reported}
                      onClick={() => report(it.id)}
                      className="grid h-11 w-11 place-items-center rounded-full glass disabled:opacity-50"
                    >
                      <Flag className={`h-4 w-4 ${it.reported ? "text-[var(--danger)]" : "text-white"}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
              <span>🔥 {it.likes}</span>
              <span>{it.reported ? "Reportado · revisión comunitaria" : "Expira en 2h"}</span>
            </div>
          </article>
        ))}
      </div>

      {isVerifying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface p-6 shadow-glow">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--neon)] border-t-transparent" />
            <p className="text-sm font-medium">Verificando seguridad del reporte...</p>
          </div>
        </div>
      )}

      {showCamera && (
        <CameraOverlay
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      <button
        onClick={onCaptureClick}
        disabled={isVerifying}
        className="fixed bottom-24 left-1/2 z-30 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-[var(--neon)] shadow-glow active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Capturar foto"
      >
        <Camera className="h-7 w-7 text-background" />
      </button>
    </div>
  );
}
