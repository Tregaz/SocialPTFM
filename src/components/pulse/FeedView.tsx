import { useEffect, useState } from "react";
import { Camera, Flag, Flame, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CameraOverlay } from "./CameraOverlay";
import { checkContentSafety, compressToLimit } from "@/utils/image";

interface FeedItem {
  id: string;
  author: string;
  peerId: string;
  gradient: string;
  caption: string;
  likes: number;
  liked: boolean;
  reported: boolean;
  hidden: boolean;
  reportCount: number;
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
  let texto = row.texto ?? "";
  let hidden = false;
  let reportCount = 0;

  if (texto.startsWith("HIDDEN:")) {
    hidden = true;
    texto = texto.substring(7);
  } else if (texto.startsWith("REPORT:")) {
    const pipeIndex = texto.indexOf("|");
    if (pipeIndex !== -1) {
      reportCount = parseInt(texto.substring(7, pipeIndex), 10);
      texto = texto.substring(pipeIndex + 1);
    }
  }

  return {
    id: row.id,
    author: row.usuario_nombre ? `@${row.usuario_nombre}` : "@anon",
    peerId: row.peer_id ?? "peer:db",
    gradient: gradientFor(row.id),
    caption: texto,
    likes: 0,
    liked: false,
    reported: reportCount > 0,
    hidden,
    reportCount,
    ago: row.created_at ? timeAgo(row.created_at) : "ahora",
  };
}

interface Props {
  zone: string;
  eventId: string;
}

export function FeedView({ zone, eventId }: Props) {
  const { user, displayName } = useAuth();
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
          event: "*",
          schema: "public",
          table: "mensajes",
          filter: `evento_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newItem = dbRowToItem(payload.new as Parameters<typeof dbRowToItem>[0]);
            setItems((prev) => {
              if (prev.some((x) => x.id === newItem.id)) return prev;
              return [newItem, ...prev];
            });
          } else if (payload.eventType === "UPDATE") {
            const updated = dbRowToItem(payload.new as Parameters<typeof dbRowToItem>[0]);
            setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
          }
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
          setItems((prev) => {
            if (prev.some((x) => x.id === p.id)) return prev;
            return [
              {
                id: p.id,
                author: `@${p.author}`,
                peerId: `sim:${p.zone}`,
                gradient: gradientFor(p.id),
                caption: p.text,
                likes: 0,
                liked: false,
                reported: false,
                hidden: false,
                reportCount: 0,
                ago: "ahora",
              },
              ...prev,
            ];
          });
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

  const report = async (item: FeedItem) => {
    if (item.reported || item.hidden || isDemo) return;

    // Local update
    setItems((xs) =>
      xs.map((x) =>
        x.id === item.id ? { ...x, reported: true, reportCount: x.reportCount + 1 } : x,
      ),
    );

    // DB update
    const { data: current } = await supabase
      .from("mensajes")
      .select("texto")
      .eq("id", item.id)
      .single();

    if (current) {
      let newTexto = current.texto;
      let newCount = 1;

      if (newTexto.startsWith("REPORT:")) {
        const pipeIndex = newTexto.indexOf("|");
        newCount = parseInt(newTexto.substring(7, pipeIndex), 10) + 1;
        newTexto = newTexto.substring(pipeIndex + 1);
      } else if (newTexto.startsWith("HIDDEN:")) {
        return; // Already hidden
      }

      if (newCount >= 3) {
        newTexto = `HIDDEN:${newTexto}`;
      } else {
        newTexto = `REPORT:${newCount}|${newTexto}`;
      }

      await supabase.from("mensajes").update({ texto: newTexto }).eq("id", item.id);
    }
  };

  const handleCapture = async (dataUrl: string) => {
    setShowCamera(false);

    if (!checkContentSafety(dataUrl)) {
      alert("La imagen no cumple con los requisitos de seguridad.");
      return;
    }

    try {
      const compressed = await compressToLimit(dataUrl, 60000);

      const { error } = await supabase.from("mensajes").insert({
        evento_id: eventId,
        zona_recinto: zone,
        usuario_id: user?.id ?? "anon",
        usuario_nombre: displayName ?? "raver",
        texto: compressed,
        hot: false,
      });

      if (error) console.error("Error saving message:", error);
    } catch (err) {
      console.error("Error processing image:", err);
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
        {items.map((it) => {
          const isImage = it.caption.startsWith("data:image/");
          return (
            <article
              key={it.id}
              className="overflow-hidden rounded-3xl border border-border bg-surface animate-slide-up"
            >
              <div className="relative aspect-[9/16]" style={{ background: it.gradient }}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
                <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-2 py-1 text-[10px] backdrop-blur z-10">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-2)] animate-pulse-dot" />
                  {it.peerId}
                </div>

                <div className="h-full w-full">
                  {it.hidden ? (
                    <div className="flex h-full w-full flex-col items-center justify-center bg-gray-800 text-center p-6">
                      <Flag className="h-12 w-12 text-gray-500 mb-4" />
                      <p className="text-sm font-bold text-gray-400">
                        ⚠️ Contenido oculto por reportes de la comunidad
                      </p>
                    </div>
                  ) : isImage ? (
                    <img
                      src={it.caption}
                      className="h-full w-full object-cover"
                      alt="Pulse"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center p-6 text-center">
                      <p className="text-lg font-medium">{it.caption}</p>
                    </div>
                  )}
                </div>

                <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 z-10">
                  <div>
                    <p className="text-sm font-semibold">
                      {it.author} · <span className="text-white/60 text-xs">{it.ago}</span>
                    </p>
                    {!isImage && !it.hidden && <p className="text-sm text-white/90">{it.caption}</p>}
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => toggleLike(it.id)}
                      className={`grid h-11 w-11 place-items-center rounded-full glass ${
                        it.liked ? "neon-border" : ""
                      }`}
                    >
                      <Flame
                        className={`h-5 w-5 ${it.liked ? "text-[var(--neon)]" : "text-white"}`}
                      />
                    </button>
                    <button
                      disabled={it.reported || it.hidden}
                      onClick={() => report(it)}
                      className="grid h-11 w-11 place-items-center rounded-full glass disabled:opacity-50"
                    >
                      <Flag
                        className={`h-4 w-4 ${
                          it.reported ? "text-[var(--danger)]" : "text-white"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                <span>🔥 {it.likes}</span>
                <span>
                  {it.hidden
                    ? "Contenido oculto"
                    : it.reported
                    ? "Reportado · revisión comunitaria"
                    : "Expira pronto"}
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <button
        onClick={() => setShowCamera(true)}
        className="fixed bottom-24 left-1/2 z-30 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-[var(--neon)] shadow-glow active:scale-95 transition"
        aria-label="Capturar foto"
      >
        <Camera className="h-7 w-7 text-background" />
      </button>

      {showCamera && (
        <CameraOverlay onCapture={handleCapture} onClose={() => setShowCamera(false)} />
      )}
    </div>
  );
}
