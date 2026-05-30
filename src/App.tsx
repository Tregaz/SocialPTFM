import { useEffect, useRef, useState } from "react";
import { Bot, LogOut, MapPin, QrCode, X } from "lucide-react";
import { startBotSimulator } from "@/utils/botSimulator";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BottomNav, type Tab } from "@/components/pulse/BottomNav";
import { RadarView, type PulseEvent } from "@/components/pulse/RadarView";
import { FeedView } from "@/components/pulse/FeedView";
import { ChatView } from "@/components/pulse/ChatView";
import { AdminView } from "@/components/pulse/AdminView";
import { HotAlert } from "@/components/pulse/HotAlert";
import { LoginGate } from "@/components/pulse/LoginGate";
import { ShareQR } from "@/components/pulse/ShareQR";
import { useAuth } from "@/hooks/useAuth";
import { useGeofence } from "@/hooks/useGeofence";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

function PulseApp() {
  const { user, loading, displayName } = useAuth();
  const [tab, setTab] = useState<Tab>("radar");
  const [selection, setSelection] = useState<{ event: PulseEvent; zone: string } | null>(null);
  const [modoBanner, setModoBanner] = useState<string | null>(null);
  const [simActive, setSimActive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const autoActivatedId = useRef<string | null>(null);
  const logoTapCount = useRef(0);
  const logoTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { nearbyEvents, activeEvent, status: geoStatus, position } = useGeofence();

  // ── Auto-activate Modo Evento when GPS puts user inside an event radius ───
  useEffect(() => {
    if (!activeEvent) return;
    if (autoActivatedId.current === activeEvent.id) return;
    if (selection?.event.id === activeEvent.id) return;

    autoActivatedId.current = activeEvent.id;
    const defaultZone = activeEvent.zones[0] ?? "Pista";
    setSelection({ event: activeEvent, zone: defaultZone });
    setTab("feed");

    setModoBanner(`🎯 Modo Evento activado · ${activeEvent.name.split(" · ")[0]}`);
    const t = setTimeout(() => setModoBanner(null), 4000);
    return () => clearTimeout(t);
  }, [activeEvent, selection]);

  // ── Auto-pairing from URL params (QR scan) ────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlEventId = params.get("eventId");
    const urlZona = params.get("zona");
    if (!urlEventId || !urlZona) return;

    (async () => {
      const { data, error } = await supabase
        .from("eventos")
        .select("id, nombre, venue, tema, latitud, longitud, radio_metros, zonas")
        .eq("id", urlEventId)
        .single();

      if (error || !data) {
        console.error("[App] Auto-pairing failed:", error?.message);
        return;
      }

      const event: PulseEvent = {
        id: data.id,
        name: data.nombre,
        venue: data.venue ?? "",
        theme: data.tema === "sport" ? "sport" : "festival",
        liveUsers: 0,
        zones: data.zonas?.length ? data.zonas : ["Pista", "VIP"],
        cover:
          data.tema === "sport"
            ? "linear-gradient(135deg, oklch(0.55 0.22 145), oklch(0.4 0.18 200))"
            : "linear-gradient(135deg, oklch(0.55 0.28 350), oklch(0.45 0.25 300))",
        lat: data.latitud,
        lng: data.longitud,
        radio: data.radio_metros,
      };

      handleSelect(event, urlZona);
      // Clean URL params to prevent re-triggering on refresh
      window.history.replaceState({}, "", window.location.pathname);
    })();
  }, []);

  const handleSelect = (event: PulseEvent, zone: string) => {
    setSelection({ event, zone });
    autoActivatedId.current = event.id;
    setTab("feed");
  };

  useEffect(() => {
    const eventId = selection?.event.id;
    if (!simActive || !eventId || eventId.startsWith("demo-")) return;
    const stop = startBotSimulator({ eventId });
    return stop;
  }, [simActive, selection?.event.id]);

  // ── Triple-tap logo to unlock admin panel ────────────────────────────────
  const handleLogoTap = () => {
    logoTapCount.current += 1;
    if (logoTapTimer.current) clearTimeout(logoTapTimer.current);
    logoTapTimer.current = setTimeout(() => {
      logoTapCount.current = 0;
    }, 800);

    if (logoTapCount.current >= 3) {
      logoTapCount.current = 0;
      setIsAdmin((v) => {
        const next = !v;
        if (!next && tab === "admin") setTab("radar");
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <p className="text-xs uppercase tracking-[0.3em]">Sincronizando…</p>
      </div>
    );
  }

  if (!user) return <LoginGate />;

  const usuarioId = user.id;
  const usuarioNombre = displayName ?? "raver";

  return (
    <div
      className="mx-auto min-h-screen w-full max-w-[480px] pb-20"
      data-theme={selection?.event.theme ?? "festival"}
    >
      {/* Global HOT alert interrupt — listens to all users */}
      <HotAlert eventId={selection?.event.id ?? null} />

      {/* QR Share Modal */}
      {showQR && selection && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="relative w-full max-w-sm animate-slide-up rounded-3xl border border-border bg-surface p-6 shadow-2xl">
            <button
              onClick={() => setShowQR(false)}
              className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted-foreground hover:text-foreground transition"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
            <ShareQR
              userId={usuarioId}
              eventId={selection.event.id}
              zona={selection.zone}
              displayName={usuarioNombre}
            />
          </div>
        </div>
      )}

      {/* Auto-detection banner */}
      {modoBanner && (
        <div className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-3 pointer-events-none">
          <div className="flex items-center gap-2 rounded-full bg-[var(--neon)] px-4 py-2 text-sm font-bold text-background shadow-glow animate-slide-up">
            <MapPin className="h-4 w-4" />
            {modoBanner}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-30 glass border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Triple-tap to unlock admin */}
            <button
              onClick={handleLogoTap}
              className="grid h-8 w-8 place-items-center rounded-xl shadow-glow select-none"
              style={{
                background: isAdmin ? "var(--danger)" : "var(--neon)",
                transition: "background 0.3s",
              }}
              aria-label="Logo"
            >
              <span className="text-sm font-black text-background">P</span>
            </button>
            <div className="leading-tight">
              <h1 className="text-base font-bold tracking-tight">Pulse</h1>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {selection
                  ? selection.event.name.split(" · ")[0]
                  : `Hola, @${usuarioNombre}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* GPS status pill */}
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${
                geoStatus === "watching"
                  ? "neon-chip"
                  : geoStatus === "denied" || geoStatus === "unavailable"
                  ? "bg-[var(--danger)]/20 text-[var(--danger)]"
                  : "bg-surface-2 text-muted-foreground"
              }`}
              title={`GPS: ${geoStatus}`}
            >
              <MapPin className="h-3 w-3" />
              {geoStatus === "watching"
                ? "GPS"
                : geoStatus === "denied"
                ? "sin GPS"
                : geoStatus === "requesting"
                ? "GPS…"
                : "GPS"}
            </div>

            {selection && (
              <span className="rounded-full neon-chip px-2.5 py-1 text-[10px] font-semibold">
                {selection.zone}
              </span>
            )}
            {selection && (
              <button
                onClick={() => setShowQR(true)}
                className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted-foreground hover:text-foreground transition"
                aria-label="Compartir QR"
              >
                <QrCode className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setSimActive((v) => !v)}
              title={simActive ? "Simulación ON — click para apagar" : "Simulación OFF — click para encender"}
              className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold transition ${
                simActive
                  ? "bg-[var(--neon)] text-background animate-pulse"
                  : "bg-surface-2 text-muted-foreground"
              }`}
            >
              <Bot className="h-3 w-3" />
              {simActive ? "SIM ON" : "SIM"}
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted-foreground"
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main>
        {tab === "radar" && (
          <RadarView
            selected={selection}
            onSelect={handleSelect}
            usuarioId={usuarioId}
            geofenceEvents={nearbyEvents.length > 0 ? nearbyEvents : undefined}
            geoStatus={geoStatus}
            userLat={position?.latitude}
            userLng={position?.longitude}
          />
        )}
        {tab === "feed" && selection && (
          <FeedView zone={selection.zone} eventId={selection.event.id} usuarioId={usuarioId} usuarioNombre={usuarioNombre} />
        )}
        {tab === "chat" && selection && (
          <ChatView
            zone={selection.zone}
            eventId={selection.event.id}
            usuarioId={usuarioId}
            usuarioNombre={`@${usuarioNombre}`}
          />
        )}
        {tab === "admin" && isAdmin && (
          <AdminView
            eventId={selection?.event.id ?? ""}
            zone={selection?.zone ?? "Pista"}
          />
        )}
      </main>

      <BottomNav
        active={tab}
        onChange={setTab}
        disabled={!selection}
        showAdmin={isAdmin}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PulseApp />
    </QueryClientProvider>
  );
}

export default App;
