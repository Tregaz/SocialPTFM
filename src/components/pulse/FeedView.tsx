import { useEffect, useRef, useState } from "react";
import { Camera, Flag, Flame, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PHOTO_PREFIX = "PHOTO:";
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const MAX_IMAGE_BYTES = 15 * 1024; // 15KB
const MAX_WIDTH = 320;
const MAX_HEIGHT = 400;

interface FeedItem {
  id: string;
  author: string;
  peerId: string;
  gradient: string;
  caption: string;
  photoUrl?: string;
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
  const isPhoto = texto.startsWith(PHOTO_PREFIX);
  return {
    id: row.id,
    author: row.usuario_nombre ? `@${row.usuario_nombre}` : "@anon",
    peerId: row.peer_id ?? "peer:db",
    gradient: gradientFor(row.id),
    caption: isPhoto ? "[Foto]" : texto,
    photoUrl: isPhoto ? texto.slice(PHOTO_PREFIX.length) : undefined,
    likes: 0,
    liked: false,
    reported: false,
    ago: row.created_at ? timeAgo(row.created_at) : "ahora",
  };
}

/**
 * Compress a base64 image to fit under a target byte size by resizing
 * and iteratively reducing JPEG quality.
 */
function compressImage(
  base64: string,
  maxBytes: number,
  maxW: number,
  maxH: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      // Resize to fit within maxW x maxH
      if (w > maxW) {
        h = Math.round(h * (maxW / w));
        w = maxW;
      }
      if (h > maxH) {
        w = Math.round(w * (maxH / h));
        h = maxH;
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);

      // Binary search for best quality
      let low = 0.05;
      let high = 0.95;
      let best = base64;
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2;
        const data = canvas.toDataURL("image/jpeg", mid);
        if (data.length <= maxBytes) {
          best = data;
          low = mid;
        } else {
          high = mid;
        }
      }
      resolve(best);
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = base64;
  });
}

function formatCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

interface Props {
  zone: string;
  eventId: string;
}

export function FeedView({ zone, eventId }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [lastPhotoTimestamp, setLastPhotoTimestamp] = useState<number>(() => {
    const saved = localStorage.getItem("lastPhotoTimestamp");
    return saved ? Number(saved) : 0;
  });
  const [timeLeft, setTimeLeft] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDemo = !eventId || eventId.startsWith("demo-");

  // Update timeLeft every second
  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - lastPhotoTimestamp;
      const remaining = Math.max(0, COOLDOWN_MS - elapsed);
      setTimeLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastPhotoTimestamp]);

  const isPhotoBlocked = timeLeft > 0;

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
            {
              id: p.id,
              author: `@${p.author}`,
              peerId: `sim:${p.zone}`,
              gradient: gradientFor(p.id),
              caption: p.text,
              likes: 0,
              liked: false,
              reported: false,
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

  const report = (id: string) =>
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, reported: true } : x)));

  const capture = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    e.target.value = "";

    setPhotoUploading(true);
    try {
      // Read file as base64
      const rawBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(file);
      });

      // Compress
      const compressed = await compressImage(rawBase64, MAX_IMAGE_BYTES, MAX_WIDTH, MAX_HEIGHT);
      const texto = PHOTO_PREFIX + compressed;

      // Upload to Supabase
      const { error } = await supabase.from("mensajes").insert({
        evento_id: eventId,
        zona_recinto: zone,
        usuario_id: "00000000-0000-0000-0000-000000000000", // anonymous / system
        usuario_nombre: "tú",
        texto,
        hot: false,
      });

      if (error) {
        console.error("[FeedView] Error uploading photo:", error.message);
      } else {
        // Update cooldown
        const now = Date.now();
        setLastPhotoTimestamp(now);
        localStorage.setItem("lastPhotoTimestamp", String(now));
      }
    } catch (err) {
      console.error("[FeedView] Photo capture error:", err);
    } finally {
      setPhotoUploading(false);
    }
  };

  return (
    <div className="relative pb-32">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

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
            <div className="relative aspect-[4/5]" style={{ background: it.gradient }}>
              {it.photoUrl && (
                <img
                  src={it.photoUrl}
                  alt="Foto"
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
                  <p className="text-sm text-white/90">{it.caption}</p>
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
        onClick={capture}
        disabled={isPhotoBlocked || photoUploading}
        className="fixed bottom-24 left-1/2 z-30 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-[var(--neon)] shadow-glow active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Capturar foto"
      >
        {photoUploading ? (
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-background border-t-transparent" />
        ) : isPhotoBlocked ? (
          <span className="text-[10px] font-bold text-background leading-tight text-center">
            {formatCountdown(timeLeft)}
          </span>
        ) : (
          <Camera className="h-7 w-7 text-background" />
        )}
      </button>
    </div>
  );
}