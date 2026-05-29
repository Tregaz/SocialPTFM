import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Brain, Coins, Send, TrendingUp, Users, Wifi } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWebRTC, type P2PMessage } from "@/hooks/useWebRTC";

interface Msg {
  id: string;
  user: string;
  text: string;
  mine?: boolean;
  hot?: boolean;
  created_at?: string;
}

const HOT_WORDS = ["gol", "drop", "brutal", "temazo", "golazo", "bass", "🔴", "collapse", "colapso", "urgente", "filling"];

interface Poll {
  id: string;
  q: string;
  options: { label: string; votes: number }[];
  cost: number;
}

const INITIAL_POLLS: Poll[] = [
  {
    id: "p1",
    q: "¿Cuál será la próxima canción?",
    options: [
      { label: "Strobe", votes: 412 },
      { label: "Levels", votes: 298 },
      { label: "Opus", votes: 187 },
    ],
    cost: 5,
  },
  {
    id: "p2",
    q: "¿Quién mete el próximo gol?",
    options: [
      { label: "Vinicius", votes: 612 },
      { label: "Bellingham", votes: 401 },
      { label: "Mbappé", votes: 522 },
    ],
    cost: 10,
  },
];

interface Props {
  zone: string;
  eventId: string;
  usuarioId: string;
  usuarioNombre: string;
}

export function ChatView({ zone, eventId, usuarioId, usuarioNombre }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [shake, setShake] = useState(false);
  const [fires, setFires] = useState<number[]>([]);
  const [rep, setRep] = useState(120);
  const [polls, setPolls] = useState(INITIAL_POLLS);
  const [voted, setVoted] = useState<Record<string, number>>({});
  const [activity, setActivity] = useState(0);
  const [nodos, setNodos] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isDemoEvent = eventId.startsWith("demo-");

  const QUICK_TAGS = [
    { label: "🟢 Fluid", value: "🟢 Fluid" },
    { label: "🟡 Filling", value: "🟡 Filling" },
    { label: "🔴 Collapse", value: "🔴 Collapse" },
    { label: "🍻 Bar", value: "🍻 Bar" },
  ];

  const handleTagClick = (tag: string) => {
    setInput((prev) => (prev ? `${prev} ${tag}` : tag));
    inputRef.current?.focus();
  };

  const triggerHype = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
    const ids = Array.from({ length: 8 }, () => Date.now() + Math.random());
    setFires((f) => [...f, ...ids]);
    setTimeout(() => setFires((f) => f.filter((x) => !ids.includes(x))), 1500);
  };

  const handleP2P = useCallback((msg: P2PMessage) => {
    setActivity((a) => a + 1);
    if (msg.type === "chat") {
      const p = msg.payload as { id: string; user: string; text: string; hot: boolean };
      setMsgs((prev) =>
        prev.some((x) => x.id === p.id)
          ? prev
          : [...prev, { id: p.id, user: p.user, text: p.text, hot: p.hot }],
      );
      if (p.hot) triggerHype();
    } else if (msg.type === "hype") {
      triggerHype();
    }
  }, []);

  const { peerCount, broadcast, status: rtcStatus } = useWebRTC({
    eventId,
    zone,
    userId: usuarioId,
    enabled: !isDemoEvent,
    onMessage: handleP2P,
  });

  useEffect(() => {
    if (isDemoEvent) {
      setMsgs([
        { id: "m1", user: "@dj_oso", text: "Ambiente increíble aquí" },
        { id: "m2", user: "@laura", text: "¿Alguien más en VIP?" },
        { id: "m3", user: "@kev", text: "TEMAZO incoming 👀", hot: true },
      ]);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("mensajes")
        .select("*")
        .eq("evento_id", eventId)
        .eq("zona_recinto", zone)
        .order("created_at", { ascending: true })
        .limit(50);
      if (!cancelled && data) {
        setMsgs(
          data.map((m) => ({
            id: m.id,
            user: m.usuario_nombre ?? "@anon",
            text: m.texto,
            hot: m.hot,
            mine: m.usuario_id === usuarioId,
            created_at: m.created_at,
          })),
        );
      }

      const { count } = await supabase
        .from("nodos_activos")
        .select("*", { count: "exact", head: true })
        .eq("evento_id", eventId)
        .eq("zona_recinto", zone);
      if (!cancelled) setNodos(count ?? 0);
    })();

    const channel = supabase
      .channel(`zona-${eventId}-${zone}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mensajes", filter: `evento_id=eq.${eventId}` },
        (payload) => {
          const m = payload.new as {
            id: string; usuario_id: string; usuario_nombre: string | null;
            texto: string; hot: boolean; zona_recinto: string; created_at: string;
          };
          if (m.zona_recinto !== zone) return;
          setMsgs((prev) =>
            prev.some((x) => x.id === m.id)
              ? prev
              : [...prev, { id: m.id, user: m.usuario_nombre ?? "@anon", text: m.texto, hot: m.hot, mine: m.usuario_id === usuarioId, created_at: m.created_at }],
          );
          setActivity((a) => a + 1);
          if (m.hot && m.usuario_id !== usuarioId) triggerHype();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "nodos_activos", filter: `evento_id=eq.${eventId}` },
        (payload) => {
          const n = payload.new as { zona_recinto: string };
          if (n.zona_recinto === zone) {
            setNodos((c) => c + 1);
            setActivity((a) => a + 1);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [eventId, zone, isDemoEvent, usuarioId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    const isHot = HOT_WORDS.some((w) => text.toLowerCase().includes(w));
    setInput("");

    const localId = crypto.randomUUID();
    if (isDemoEvent) {
      setMsgs((m) => [...m, { id: localId, user: "@tú", text, mine: true, hot: isHot }]);
    } else {
      const { error } = await supabase.from("mensajes").insert({
        evento_id: eventId,
        zona_recinto: zone,
        usuario_id: usuarioId,
        usuario_nombre: usuarioNombre,
        texto: text,
        hot: isHot,
      });
      if (error) console.error("Mensaje no enviado", error);
      broadcast("chat", { id: localId, user: usuarioNombre, text, hot: isHot });
      if (isHot) broadcast("hype", { ts: Date.now() });
    }

    setActivity((a) => a + 1);
    if (isHot) {
      triggerHype();
      setRep((r) => r + 3);
    }
  };

  const vote = (pid: string, idx: number) => {
    const p = polls.find((x) => x.id === pid);
    if (!p || voted[pid] !== undefined || rep < p.cost) return;
    setRep((r) => r - p.cost);
    setVoted((v) => ({ ...v, [pid]: idx }));
    setPolls((ps) =>
      ps.map((x) =>
        x.id === pid
          ? { ...x, options: x.options.map((o, i) => (i === idx ? { ...o, votes: o.votes + 1 } : o)) }
          : x,
      ),
    );
  };

  return (
    <div className={`relative pb-36 ${shake ? "animate-shake" : ""}`}>
      <div className="sticky top-0 z-20 glass border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Megáfono · {zone} · {usuarioNombre}
          </p>
          <h2 className="text-lg font-bold">Chat de zona</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
            <Users className="h-3 w-3" /> {nodos}
          </div>
          {!isDemoEvent && (
            <div
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                rtcStatus === "ready" && peerCount > 0
                  ? "neon-chip"
                  : "bg-surface-2 text-muted-foreground"
              }`}
              title={`WebRTC · ${rtcStatus}`}
            >
              <Wifi className="h-3 w-3" /> {peerCount} P2P
            </div>
          )}
          <div className="flex items-center gap-1 rounded-full neon-chip px-3 py-1.5 text-xs font-bold">
            <Coins className="h-3.5 w-3.5" /> {rep} REP
          </div>
        </div>
      </div>

      {activity > 0 && (
        <div className="px-4 pt-2 text-[10px] uppercase tracking-widest text-[var(--neon-2)]">
          ⚡ Actividad P2P · {activity} eventos
        </div>
      )}

      <section className="px-4 pt-4">
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Brain className="h-3.5 w-3.5" /> IA Predicciones
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
          {polls.map((p) => {
            const total = p.options.reduce((a, b) => a + b.votes, 0);
            const myVote = voted[p.id];
            return (
              <div key={p.id} className="min-w-[78%] shrink-0 rounded-3xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">{p.q}</p>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {p.cost} REP
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {p.options.map((o, i) => {
                    const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
                    const isMine = myVote === i;
                    return (
                      <button
                        key={o.label}
                        onClick={() => vote(p.id, i)}
                        disabled={myVote !== undefined}
                        className="relative w-full overflow-hidden rounded-xl border border-border bg-surface-2 px-3 py-2 text-left text-xs"
                      >
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: `${pct}%`,
                            background: isMine
                              ? "color-mix(in oklab, var(--neon) 35%, transparent)"
                              : "color-mix(in oklab, var(--neon-2) 18%, transparent)",
                          }}
                        />
                        <div className="relative flex justify-between font-medium">
                          <span>{o.label}</span>
                          <span className="text-muted-foreground">{pct}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <TrendingUp className="h-3 w-3" /> {total} votos · cierra en 2:14
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="px-4 pt-4 space-y-3">
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div
              className={`relative max-w-[85%] px-4 py-2 text-sm shadow-sm transition-all animate-slide-up ${
                m.mine
                  ? "bg-emerald-600 text-white rounded-2xl rounded-tr-none"
                  : m.hot
                  ? "bg-red-500/20 border border-red-500/50 text-white rounded-2xl rounded-tl-none"
                  : "bg-zinc-700 text-white rounded-2xl rounded-tl-none"
              }`}
            >
              {!m.mine && (
                <p className="mb-1 text-[10px] font-bold text-zinc-400">
                  {m.user}
                </p>
              )}
              <div className="flex items-start gap-2">
                <p className="leading-relaxed">{m.text}</p>
                {m.hot && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
                )}
              </div>
              {m.hot && (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  Aviso Crítico
                </p>
              )}
              {m.created_at && (
                <p className={`mt-1 text-right text-[9px] ${m.mine ? "text-emerald-200" : "text-zinc-400"}`}>
                  {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </section>

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center">
        {fires.map((id, i) => (
          <span
            key={id}
            className="absolute text-3xl animate-fire-rise"
            style={{ left: `${20 + ((i * 9) % 60)}%`, animationDelay: `${i * 80}ms` }}
          >
            🔥
          </span>
        ))}
      </div>

      <div className="fixed bottom-16 left-0 right-0 z-30 glass border-t border-border px-3 py-2">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag.value}
              onClick={() => handleTagClick(tag.value)}
              className="whitespace-nowrap rounded-full bg-surface-2 px-3 py-1 text-xs font-medium hover:bg-surface-3 transition-colors"
            >
              {tag.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Escribe al megáfono…"
            className="flex-1 rounded-full bg-surface-2 px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-emerald-500/50"
          />
          <button
            onClick={send}
            className="grid h-12 w-12 place-items-center rounded-full bg-emerald-600 text-white active:scale-95 shadow-lg"
            aria-label="Enviar"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
