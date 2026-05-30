import { useEffect, useState } from "react";
import { Camera, Flag, Flame, Wifi, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CameraOverlay } from "@/components/pulse/CameraOverlay";
import { compressToLimit } from "@/utils/image";

interface FeedItem {
  id: string;
  author: string;
  peerId: string;
  gradient: string;
  caption: string;
  photoUrl: string;
  likes: number;
  liked: boolean;
  reported: boolean;
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
  const texto = row.texto ?? "";
  const isPhoto = texto.startsWith("PHOTO:");
  return {
    id: row.id,
    author: row.usuario_nombre ? `@${row.usuario_nombre}` : "@anon",
    peerId: row.peer_id ?? "peer:db",
    gradient: gradientFor(row.id),
    caption: isPhoto ? "" : texto,
    photoUrl: isPhoto ? texto.slice(6) : "",
    likes: 0,
    liked: false,
    reported: false,
    ago: row.created_at ? timeAgo(row.created_at) : "ahora",
  };
}

interface Props {
  zone: string;
  eventId: string;
  usuarioId: string;
  usuarioNombre: string;
}

export function FeedView({ zone, eventId, usuarioId, usuarioNombre }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
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
        .ilike("texto", "PHOTO:%")
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

    // Real-time photo messages from DB (postgres changes)
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
          const row = payload.new as Parameters<typeof dbRowToItem>[0];
          if (!row.texto?.startsWith("PHOTO:")) return;
          const newItem = dbRowToItem(row);
          setItems((prev) => [newItem, ...prev]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(dbChannel);
    };
  }, [eventId, isDemo]);

  const toggleLike = (id: string) =>
    setItems((xs) =>
      xs.map((x) =>
        x.id === id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x,
      ),
    );

  const report = (id: string) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, reported: true } : x)));

  const openCamera = () => setShowCamera(true);

  const handleCapture = async (dataUrl: string) => {
    setUploading(true);
    try {
      const compressed = await compressToLimit(dataUrl, 50000);
      const texto = "PHOTO:" + compressed;

      if (isDemo) {
        const id = crypto.randomUUID();
        setItems((xs) => [
          {
            id,
            author: "@tú",
            peerId: "peer:local",
            gradient: gradientFor(id),
            caption: "",
            photoUrl: compressed,
            likes: 0,
            liked: false,
            reported: false,
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
          texto: texto,
          hot: false,
        });
        if (error) console.error("[FeedView] Error inserting photo:", error.message);
      }
    } finally {
      setUploading(false);
      setShowCamera(false);
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
          Aún no hay fotos en este evento. ¡Sé el primero!
        </div>
      )}

      <div className="flex flex-col gap-4 px-4">
        {items.map((it) => (
          <article
            key={it.id}
            className="overflow-hidden rounded-3xl border border-border bg-surface animate-slide-up"
          >
            <div className="relative aspect-[3/4]" style={{ background: it.gradient }}>
              {it.photoUrl && (
                <img
                  src={it.photoUrl}
                  alt="Foto del feed"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/50 px-2 py-1 text-[10px] backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-2)] animate-pulse-dot" />
                {it.peerId}
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{it.author} · <span className="text-white/60 text-xs">{it.ago}</span></p>
                  {it.caption && <p className="text-sm text-white/90">{it.caption}</p>}
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
            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
              <span>🔥 {it.likes}</span>
              <span>{it.reported ? "Reportado · revisión comunitaria" : "Expira en 2h"}</span>
            </div>
          </article>
        ))}
      </div>

      <button
        onClick={openCamera}
        disabled={uploading}
        className="fixed bottom-24 left-1/2 z-30 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-[var(--neon)] shadow-glow active:scale-95 transition disabled:opacity-60"
        aria-label="Capturar foto"
      >
        {uploading ? (
          <Loader2 className="h-7 w-7 text-background animate-spin" />
        ) : (
          <Camera className="h-7 w-7 text-background" />
        )}
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
