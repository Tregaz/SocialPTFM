import { useEffect, useState } from "react";
import { Camera, Flag, Flame, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  return {
    id: row.id,
    author: row.usuario_nombre ? `@${row.usuario_nombre}` : "@anon",
    peerId: row.peer_id ?? "peer:db",
    gradient: gradientFor(row.id),
    caption: row.texto ?? "",
    likes: 0,
    liked: false,
    reported: false,
    ago: row.created_at ? timeAgo(row.created_at) : "ahora",
  };
}

interface Props {
  zone: string;
  eventId: string;
}

export function FeedView({ zone, eventId }: Props) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
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
        },
        (payload) => {
          const m = payload.new as { evento_id: string };
          if (m.evento_id !== eventId) return;
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
    const id = crypto.randomUUID();
    const colors = ["#ff2d87", "#00d27a", "#7a00ff", "#ff7a00"];
    const a = colors[Math.floor(Math.random() * colors.length)];
    const b = colors[Math.floor(Math.random() * colors.length)];
    setItems((xs) => [
      {
        id,
        author: "@tú",
        peerId: "peer:local",
        gradient: `linear-gradient(135deg, ${a}, ${b})`,
        caption: "Captura en vivo",
        likes: 0,
        liked: false,
        reported: false,
        ago: "ahora",
      },
      ...xs,
    ]);
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
            <div className="relative aspect-[4/5]" style={{ background: it.gradient }}>
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
        className="fixed bottom-24 left-1/2 z-30 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-[var(--neon)] shadow-glow active:scale-95 transition"
        aria-label="Capturar foto"
      >
        <Camera className="h-7 w-7 text-background" />
      </button>
    </div>
  );
}
