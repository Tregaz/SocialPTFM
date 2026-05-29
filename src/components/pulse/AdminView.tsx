import { useState } from "react";
import { AlertTriangle, Megaphone, Send, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const QUICK_ALERTS = [
  "⚠️ Desvío obligatorio por masificación en Pista",
  "🚨 Evacuación inmediata del sector Escenario Principal",
  "🔴 Acceso VIP cerrado temporalmente por colapso",
  "⛔ Suspensión momentánea del evento — mantengan la calma",
  "🚑 Equipo médico en camino — despejen el área central",
  "📢 Cambio de ruta: salida por puerta norte solamente",
];

interface Props {
  eventId: string;
  zone: string;
}

export function AdminView({ eventId, zone }: Props) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const { user } = useAuth();
  const isDemo = !eventId || eventId.startsWith("demo-");

  const emit = async (message: string) => {
    if (!message.trim() || sending || isDemo) return;
    setSending(true);

    const { error } = await (supabase.from("mensajes") as ReturnType<typeof supabase.from> & { insert: (data: Record<string, unknown>) => Promise<{ error: Error | null }> }).insert({
      evento_id: eventId,
      zona_recinto: zone,
      usuario_id: user?.id ?? "system",
      usuario_nombre: "SISTEMA / CONTROL",
      texto: message.trim(),
      hot: true,
    });

    if (error) {
      console.error("Error emitting alert:", error);
    }

    setSending(false);
    setLastSent(message.trim());
    setText("");
  };

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-3xl border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--danger)]/20">
          <ShieldAlert className="h-5 w-5 text-[var(--danger)]" />
        </div>
        <div>
          <p className="text-sm font-bold text-[var(--danger)]">Panel de Control</p>
          <p className="text-[10px] uppercase tracking-widest text-[var(--danger)]/70">
            Acceso restringido · SISTEMA · escritura en BD
          </p>
        </div>
      </div>

      {isDemo && (
        <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-xs text-muted-foreground">
          Selecciona un evento real (no demo) para emitir alertas.
        </div>
      )}

      {/* Quick alerts */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          Alertas rápidas
        </p>
        <div className="flex flex-col gap-2">
          {QUICK_ALERTS.map((a) => (
            <button
              key={a}
              disabled={isDemo || sending}
              onClick={() => emit(a)}
              className="flex items-center gap-3 rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-4 py-3 text-left text-sm transition hover:bg-[var(--danger)]/15 disabled:opacity-40"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--danger)]" />
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Custom message */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          Mensaje personalizado
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={isDemo}
          placeholder="Escribe un aviso de urgencia para todos los asistentes…"
          rows={3}
          className="w-full resize-none rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-[var(--danger)] focus:outline-none disabled:opacity-40"
        />
        <button
          disabled={!text.trim() || isDemo || sending}
          onClick={() => emit(text)}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--danger)] py-3.5 text-sm font-bold text-white shadow-lg disabled:opacity-40 active:scale-[0.98] transition"
        >
          <Megaphone className="h-4 w-4" />
          {sending ? "Emitiendo…" : "Emitir Alerta Masiva (HOT)"}
          {!sending && <Send className="h-3.5 w-3.5" />}
        </button>
      </div>

      {lastSent && (
        <div className="rounded-2xl border border-[var(--neon)]/30 bg-[var(--neon)]/5 px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest text-[var(--neon)]">Última alerta emitida</p>
          <p className="mt-1 text-sm">{lastSent}</p>
        </div>
      )}
    </div>
  );
}
