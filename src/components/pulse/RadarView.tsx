import { useEffect, useState } from "react";
import { MapPin, Radio, Users, Zap, LocateFixed, WifiOff, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { distanceMeters, getPeerId } from "@/lib/pulse/session";
import type { GeoStatus } from "@/hooks/useGeofence";

function SaturationBanner({ zone, isRed }: { zone: string; isRed: boolean }) {
  return (
    <div className={`mx-4 mb-3 flex items-center gap-2 rounded-2xl px-4 py-3 animate-pulse ${
      isRed ? "bg-[var(--danger)] text-white" : "bg-orange-500/20 text-orange-500 border border-orange-500/50"
    }`}>
      <AlertTriangle className="h-5 w-5 shrink-0" />
      <div>
        <p className="text-xs font-bold uppercase tracking-wider">
          {isRed ? "ZONA ROJA · CRÍTICO" : "ALTA SATURACIÓN"}
        </p>
        <p className="text-[10px] opacity-90">
          {isRed 
            ? `Consenso de seguridad en ${zone}. Evita desplazamientos.` 
            : `Mucha actividad en ${zone}. Acceso lento.`}
        </p>
      </div>
    </div>
  );
}

export type EventTheme = "festival" | "sport";

export interface PulseEvent {
  id: string;
  name: string;
  venue: string;
  theme: EventTheme;
  liveUsers: number;
  zones: string[];
  cover: string;
  lat?: number;
  lng?: number;
  radio?: number;
}

const FALLBACK: PulseEvent[] = [
  {
    id: "demo-coachella",
    name: "Coachella · Stage Sahara",
    venue: "Indio, CA",
    theme: "festival",
    liveUsers: 12483,
    zones: ["Pista", "Zona VIP", "Escenario Principal", "Camping"],
    cover: "linear-gradient(135deg, oklch(0.55 0.28 350), oklch(0.45 0.25 300))",
  },
  {
    id: "demo-bernabeu",
    name: "Real Madrid vs Barça",
    venue: "Estadio Santiago Bernabéu",
    theme: "sport",
    liveUsers: 58210,
    zones: ["Grada Baja", "Fondo Norte", "Fondo Sur", "Tribuna"],
    cover: "linear-gradient(135deg, oklch(0.55 0.22 145), oklch(0.4 0.18 200))",
  },
];

interface Props {
  selected: { event: PulseEvent; zone: string } | null;
  onSelect: (event: PulseEvent, zone: string) => void;
  usuarioId: string;
  /** Passed from App when geofence is active — skips internal GPS/DB fetch */
  geofenceEvents?: PulseEvent[];
  geoStatus?: GeoStatus;
  userLat?: number;
  userLng?: number;
}

export function RadarView({
  selected,
  onSelect,
  usuarioId,
  geofenceEvents,
  geoStatus,
  userLat,
  userLng,
}: Props) {
  const [scanning, setScanning] = useState(true);
  const [found, setFound] = useState<PulseEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<PulseEvent | null>(selected?.event ?? null);
  const [zone, setZone] = useState<string | null>(selected?.zone ?? null);
  const [statusMsg, setStatusMsg] = useState("Escaneando frecuencia · GPS");
  const [hotReports, setHotReports] = useState<Record<string, { userId: string; ts: number }[]>>({});
  const [systemAlerts, setSystemAlerts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!activeEvent || activeEvent.id.startsWith("demo-")) return;

    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    (async () => {
      const { data } = await supabase
        .from("mensajes")
        .select("usuario_id, zona_recinto, created_at")
        .eq("evento_id", activeEvent.id)
        .eq("hot", true)
        .gt("created_at", fiveMinsAgo);

      if (data) {
        const reports: Record<string, { userId: string; ts: number }[]> = {};
        data.forEach((m) => {
          if (!reports[m.zona_recinto]) reports[m.zona_recinto] = [];
          reports[m.zona_recinto].push({ userId: m.usuario_id, ts: new Date(m.created_at).getTime() });
        });
        setHotReports(reports);
      }
    })();

    const channel = supabase
      .channel(`pulse-event-${activeEvent.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensajes" }, (payload) => {
        const m = payload.new as { evento_id: string; hot: boolean; zona_recinto: string; usuario_id: string };
        if (m.evento_id !== activeEvent.id || !m.hot) return;
        setHotReports((prev) => {
          const next = { ...prev };
          if (!next[m.zona_recinto]) next[m.zona_recinto] = [];
          next[m.zona_recinto] = [...next[m.zona_recinto], { userId: m.usuario_id, ts: Date.now() }];
          return next;
        });
      })
      .on("broadcast", { event: "hot_alert" }, (msg) => {
        const p = msg.payload as { usuario_nombre: string; zona_recinto: string };
        if (p.usuario_nombre === "SISTEMA / CONTROL") {
          setSystemAlerts((prev) => ({ ...prev, [p.zona_recinto]: Date.now() }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeEvent]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const fiveMins = 5 * 60 * 1000;
      
      setSystemAlerts((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const z in next) {
          if (now - next[z] > fiveMins) {
            delete next[z];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      
      setHotReports((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const z in next) {
          const filtered = next[z].filter(r => now - r.ts < fiveMins);
          if (filtered.length !== next[z].length) {
            next[z] = filtered;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const isRedZone = (z: string) => {
    if (systemAlerts[z]) return true;
    const uniqueUsers = new Set(hotReports[z]?.map(r => r.userId) ?? []);
    return uniqueUsers.size >= 3;
  };

  // If geofence provided events externally, use them directly
  useEffect(() => {
    if (geofenceEvents !== undefined) {
      if (geofenceEvents.length > 0) {
        setFound(geofenceEvents);
        const inRange = geofenceEvents.filter(
          (e) =>
            userLat !== undefined &&
            userLng !== undefined &&
            e.lat !== undefined &&
            e.lng !== undefined &&
            e.radio !== undefined &&
            distanceMeters({ lat: userLat, lng: userLng }, { lat: e.lat, lng: e.lng }) <= e.radio,
        );
        setStatusMsg(
          inRange.length > 0
            ? `🎯 ${inRange.length} evento(s) en tu radio GPS`
            : `${geofenceEvents.length} evento(s) cercanos`,
        );
      } else if (geoStatus === "denied" || geoStatus === "unavailable") {
        setFound(FALLBACK);
        setStatusMsg("GPS no disponible · modo demo");
      } else {
        setFound(FALLBACK);
        setStatusMsg("Sin eventos en tu zona · modo demo");
      }
      setScanning(false);
      return;
    }

    // Fallback: internal GPS + Supabase fetch (no geofence hook available)
    let cancelled = false;
    (async () => {
      const { data: eventos, error } = await supabase
        .from("eventos")
        .select("*")
        .eq("activo", true);

      const dbEvents: PulseEvent[] = (eventos ?? []).map(toPulseEvent);

      if (!cancelled) {
        setFound(dbEvents.length ? [...dbEvents, ...FALLBACK] : FALLBACK);
        setStatusMsg(
          dbEvents.length ? "Catálogo de eventos" : "Modo demo · eventos simulados",
        );
        setScanning(false);
      }
    })();
    return () => { cancelled = true; };
  }, [geofenceEvents, geoStatus, userLat, userLng]);

  const connect = async () => {
    if (!activeEvent || !zone) return;
    if (!activeEvent.id.startsWith("demo-")) {
      await supabase.from("nodos_activos").insert({
        usuario_id: usuarioId,
        evento_id: activeEvent.id,
        peer_id_webrtc: getPeerId(),
        zona_recinto: zone,
      });
    }
    onSelect(activeEvent, zone);
  };

  // ── Geo status banner ─────────────────────────────────────────────────────
  const geoBanner = () => {
    if (!geoStatus || geoStatus === "watching") return null;
    if (geoStatus === "denied")
      return (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 text-xs text-[var(--danger)]">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          GPS denegado — actívalo en ajustes del navegador para Modo Evento automático
        </div>
      );
    if (geoStatus === "requesting")
      return (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 py-2 text-xs text-muted-foreground">
          <LocateFixed className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          Solicitando permiso GPS…
        </div>
      );
    return null;
  };

  return (
    <div className="flex flex-col gap-6 pb-6">
      {/* Radar animation */}
      <div className="relative mx-auto mt-2 grid h-72 w-72 place-items-center">
        <div className="absolute inset-0 rounded-full border border-border/60" />
        <div className="absolute inset-6 rounded-full border border-border/50" />
        <div className="absolute inset-14 rounded-full border border-border/40" />
        <div className="absolute inset-24 rounded-full border border-border/30" />

        <div
          className="absolute inset-0 rounded-full animate-radar-sweep"
          style={{
            background:
              "conic-gradient(from 0deg, color-mix(in oklab, var(--neon) 35%, transparent), transparent 35%)",
            mask: "radial-gradient(circle, black 60%, transparent 61%)",
            WebkitMask: "radial-gradient(circle, black 60%, transparent 61%)",
          }}
        />

        {scanning && (
          <>
            <span className="absolute h-8 w-8 rounded-full bg-[var(--neon)]/30 animate-radar-ping" />
            <span
              className="absolute h-8 w-8 rounded-full bg-[var(--neon)]/30 animate-radar-ping"
              style={{ animationDelay: "0.8s" }}
            />
          </>
        )}

        <div className="relative grid h-14 w-14 place-items-center rounded-full bg-[var(--neon)] shadow-glow">
          <Radio className="h-6 w-6 text-background" />
        </div>

        {!scanning &&
          found.slice(0, 4).map((e, i) => (
            <button
              key={e.id}
              onClick={() => setActiveEvent(e)}
              className="absolute grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full glass neon-border animate-slide-up"
              style={{
                left: `${50 + (i % 2 === 0 ? -26 : 28) + i * 2}%`,
                top: `${50 + (i % 2 === 0 ? -22 : 24)}%`,
              }}
            >
              <MapPin className="h-4 w-4 text-[var(--neon)]" />
            </button>
          ))}
      </div>

      <p className="text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
        {scanning ? "Escaneando frecuencia · GPS" : statusMsg}
      </p>

      {geoBanner()}

      {/* Accuracy badge */}
      {geoStatus === "watching" && userLat !== undefined && (
        <div className="mx-4 -mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <LocateFixed className="h-3 w-3 text-[var(--neon)]" />
          GPS activo · {userLat.toFixed(4)}°N {Math.abs(userLng ?? 0).toFixed(4)}°
        </div>
      )}

      {/* Event cards */}
      <div className="flex flex-col gap-3 px-4">
        {found.map((e) => {
          const isActive = activeEvent?.id === e.id;
          const distM =
            userLat !== undefined && userLng !== undefined && e.lat && e.lng
              ? distanceMeters({ lat: userLat, lng: userLng }, { lat: e.lat, lng: e.lng })
              : null;
          const inRadius = distM !== null && e.radio !== undefined && distM <= e.radio;

          return (
            <div
              key={e.id}
              data-theme={e.theme}
              onClick={() => setActiveEvent(e)}
              className={`overflow-hidden rounded-3xl border transition ${
                inRadius
                  ? "neon-border ring-1 ring-[var(--neon)]/30"
                  : isActive
                  ? "neon-border"
                  : "border-border"
              }`}
            >
              <div className="relative h-32" style={{ background: e.cover }}>
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />

                {inRadius && (
                  <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-[var(--neon)] px-3 py-1 text-[10px] font-bold text-background">
                    <span className="h-1.5 w-1.5 rounded-full bg-background animate-pulse-dot" />
                    EN TU ZONA
                  </div>
                )}
                {!inRadius && (
                  <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur">
                    <span className="h-2 w-2 rounded-full bg-[var(--neon)] animate-pulse-dot" />
                    LIVE
                  </div>
                )}

                <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur">
                  <Users className="h-3 w-3" /> {e.liveUsers.toLocaleString()}
                </div>

                <div className="absolute bottom-3 left-4 right-4">
                  <h3 className="text-lg font-bold leading-tight">{e.name}</h3>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-white/70">{e.venue}</p>
                    {distM !== null && (
                      <span className="text-[10px] text-white/50">
                        · {distM < 1000 ? `${Math.round(distM)}m` : `${(distM / 1000).toFixed(1)}km`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {isActive && (
                <div className="space-y-3 p-4 animate-slide-up">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Selecciona tu zona física
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {e.zones.map((z) => (
                      <button
                        key={z}
                        onClick={(ev) => { ev.stopPropagation(); setZone(z); }}
                        className={`relative rounded-full px-3 py-1.5 text-xs font-medium transition ${
                          zone === z
                            ? "neon-chip"
                            : "border border-border bg-surface-2 text-muted-foreground"
                        } ${isRedZone(z) ? "border-[var(--danger)] text-[var(--danger)]" : ""}`}
                      >
                        {z}
                        {isRedZone(z) && (
                          <span className="absolute -right-1 -top-1 flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--danger)] opacity-75"></span>
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-[var(--danger)]"></span>
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {zone && (isRedZone(zone) || e.liveUsers > 1000) && (
                    <SaturationBanner zone={zone} isRed={isRedZone(zone)} />
                  )}

                  <button
                    disabled={!zone}
                    onClick={(ev) => { ev.stopPropagation(); connect(); }}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--neon)] py-3 text-sm font-bold text-background disabled:opacity-40"
                  >
                    <Zap className="h-4 w-4" /> Conectar al Pulse
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toPulseEvent(row: {
  id: string;
  nombre: string;
  venue: string | null;
  tema: string;
  latitud: number;
  longitud: number;
  radio_metros: number;
  zonas: string[];
}): PulseEvent {
  return {
    id: row.id,
    name: row.nombre,
    venue: row.venue ?? "",
    theme: (row.tema === "sport" ? "sport" : "festival") as EventTheme,
    liveUsers: 0,
    zones: row.zonas?.length ? row.zonas : ["Pista", "VIP"],
    cover:
      row.tema === "sport"
        ? "linear-gradient(135deg, oklch(0.55 0.22 145), oklch(0.4 0.18 200))"
        : "linear-gradient(135deg, oklch(0.55 0.28 350), oklch(0.45 0.25 300))",
    lat: row.latitud,
    lng: row.longitud,
    radio: row.radio_metros,
  };
}
