import { useEffect, useState } from "react";
import { Camera, Flag, Flame, Wifi, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseMessage } from "@/utils/filter";
import { checkContentSafety, compressToLimit } from "@/utils/image";
import { toast } from "sonner";

interface FeedItem {
  id: string;
  author: string;
  peerId: string;
  gradient: string;
  caption: string;
  likes: number;
  liked: boolean;
  reported: boolean;
  isHidden: boolean;
  ago: string;
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
  texto?: string | null;
  created_at?: string | null;
  hot?: boolean | null;
}): FeedItem {
  const parsed = parseMessage(row.texto ?? "");
  const isPhoto = parsed.content.startsWith("PHOTO:");
  const photoUrl = isPhoto ? parsed.content.replace("PHOTO:", "") : null;

  return {
    id: row.id,
    author: row.usuario_nombre ? `@${row.usuario_nombre}` : "@anon",
    peerId: row.peer_id ?? "peer:db",
    gradient: photoUrl ? `url(${photoUrl})` : gradientFor(row.id),
    caption: isPhoto ? "Captura en vivo" : parsed.content,
    likes: 0,
    liked: false,
    reported: parsed.reportCount > 0,
    isHidden: parsed.isHidden,
    ago: row.created_at ? timeAgo(row.created_at) : "ahora",
  };
}

import { CameraOverlay } from "./CameraOverlay";

interface Props {
  zone: string;
  eventId: string;
  usuarioId?: string;
  usuarioNombre?: string;
}

export function FeedView({ zone, eventId, usuarioId, usuarioNombre }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "mensajes",
          filter: `evento_id=eq.${eventId}`,
        },
        (payload) => {
          const updatedItem = dbRowToItem(payload.new as Parameters<typeof dbRowToItem>[0]);
          setItems((prev) => prev.map((it) => it.id === updatedItem.id ? updatedItem : it));
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
          const parsed = parseMessage(p.text);
          const isPhoto = parsed.content.startsWith("PHOTO:");
          const photoUrl = isPhoto ? parsed.content.replace("PHOTO:", "") : null;

          setItems((prev) => [
            {
              id: p.id,
              author: `@${p.author}`,
              peerId: `sim:${p.zone}`,
              gradient: photoUrl ? `url(${photoUrl})` : gradientFor(p.id),
              caption: isPhoto ? "Captura en vivo" : parsed.content,
              likes: 0,
              liked: false,
              reported: parsed.reportCount > 0,
              isHidden: parsed.isHidden,
              ago: "ahora",
            },
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
    // Optimistic UI
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, reported: true } : x)));

    if (isDemo) return;

    try {
      const { data: msg } = await supabase
        .from("mensajes")
        .select("texto")
        .eq("id", id)
        .single();

      if (msg) {
        const parsed = parseMessage(msg.texto || "");
        const newCount = parsed.reportCount + 1;
        let newTexto = msg.texto;

        if (newCount >= 3) {
          newTexto = `HIDDEN:${parsed.content}`;
        } else {
          newTexto = `REPORT:${newCount}|${parsed.content}`;
        }

        await supabase
          .from("mensajes")
          .update({ texto: newTexto })
          .eq("id", id);
      }
    } catch (err) {
      console.error("Error reporting message:", err);
    }
  };

  const handleCapture = async (dataUrl: string) => {
    setShowCamera(false);
    
    try {
      const compressed = await compressToLimit(dataUrl, 50000); // Base64 limit around 50kb
      const isSafe = await checkContentSafety(compressed);
      
      if (!isSafe) {
        toast.error("Contenido no permitido", {
          description: "La imagen parece contener material no apto o uniforme.",
        });
        return;
      }

      if (isDemo) {
        const id = crypto.randomUUID();
        setItems((xs) => [
          {
            id,
            author: "@tú",
            peerId: "peer:local",
            gradient: `url(${compressed})`,
            caption: "Captura en vivo",
            likes: 0,
            liked: false,
            reported: false,
            isHidden: false,
            ago: "ahora",
          },
          ...xs,
        ]);
      } else {
        const { error } = await supabase.from("mensajes").insert({
          evento_id: eventId,
          zona_recinto: zone,
          usuario_id: usuarioId,
          usuario_nombre: usuarioNombre,
          texto: `PHOTO:${compressed}`,
          hot: false,
        });
        if (error) throw error;
      }
    } catch (err) {
      console.error("Capture error:", err);
      toast.error("Error al subir captura");
    }
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
            <div 
              className="relative aspect-[4/5] bg-cover bg-center transition-all duration-500" 
              style={{ 
                backgroundImage: it.isHidden ? "none" : it.gradient,
                backgroundColor: it.isHidden ? "#222" : "transparent"
              }}
            >
              {it.isHidden ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                  <AlertTriangle className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Contenido oculto</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Este mensaje ha sido reportado por la comunidad.</p>
                </div>
              ) : (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                  <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-2 py-1 text-[10px] backdrop-blur">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-2)] animate-pulse-dot" />
                    {it.peerId}
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{it.author} · <span className="text-white/60 text-xs">{it.ago}</span></p>
                      <p className="text-sm text-white/90">{it.caption.startsWith("PHOTO:") ? "Captura compartida" : it.caption}</p>
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
                </>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
              <span>🔥 {it.likes}</span>
              <span>{it.isHidden ? "Bloqueado" : it.reported ? "Reportado · revisión comunitaria" : "Expira en 2h"}</span>
            </div>
          </article>
        ))}
      </div>

      <button
        onClick={() => setShowCamera(true)}
        className="fixed bottom-24 left-1/2 z-30 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-[var(--neon)] shadow-glow active:scale-95 transition"
        aria-label="Capturar foto"
      >
        <Camera className="h-7 w-7 text-background" />
      </button>

      {showCamera && (
        <CameraOverlay
          onCapture={handleCapture}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}
