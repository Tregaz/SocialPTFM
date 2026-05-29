import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface HotMessage {
  id: string;
  texto: string;
  usuario_nombre: string | null;
  zona_recinto: string;
}

interface Props {
  eventId: string | null;
}

export function HotAlert({ eventId }: Props) {
  const [alert, setAlert] = useState<HotMessage | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!eventId || eventId.startsWith("demo-")) return;

    const channel = supabase
      .channel(`pulse-event-${eventId}`)
      .on(
        "broadcast",
        { event: "hot_alert" },
        (msg: { payload: { id: string; texto: string; usuario_nombre: string | null; zona_recinto: string } }) => {
          const p = msg.payload;
          setAlert({
            id: p.id,
            texto: p.texto,
            usuario_nombre: p.usuario_nombre,
            zona_recinto: p.zona_recinto,
          });
          setVisible(true);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 12_000);
    return () => clearTimeout(t);
  }, [visible, alert?.id]);

  if (!visible || !alert) return null;

  const isSystem = alert.usuario_nombre === "SISTEMA / CONTROL";

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-4 pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-[440px] animate-slide-up overflow-hidden rounded-3xl border-2 shadow-2xl"
        style={{
          borderColor: "var(--danger)",
          background: "linear-gradient(135deg, oklch(0.18 0.06 15), oklch(0.12 0.04 15))",
          boxShadow: "0 0 40px oklch(0.55 0.25 15 / 0.5)",
        }}
      >
        {/* Pulsing top bar */}
        <div
          className="h-1.5 w-full animate-pulse"
          style={{ background: "var(--danger)" }}
        />

        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest"
                style={{ background: "var(--danger)", color: "white" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                {isSystem ? "ALERTA SISTEMA" : "HOT · URGENTE"}
              </div>
            </div>
            <button
              onClick={() => setVisible(false)}
              className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white/70 hover:bg-white/20"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-start gap-3">
            <div
              className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
              style={{ background: "var(--danger)" }}
            >
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-base font-bold leading-snug text-white">
                {alert.texto}
              </p>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-white/50">
                <span>{alert.usuario_nombre ?? "Anón"}</span>
                <span>·</span>
                <span>{alert.zona_recinto}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setVisible(false)}
            className="mt-4 w-full rounded-2xl border border-white/20 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            Entendido — cerrar aviso
          </button>
        </div>
      </div>
    </div>
  );
}
