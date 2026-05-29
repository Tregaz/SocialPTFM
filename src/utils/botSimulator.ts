import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

const BOT_NAMES = [
  "Raver_404",
  "Anón_782",
  "VIP_Vibes",
  "TechnoKing",
  "NoizeMaker",
  "PulseBot_11",
  "BassHunter",
  "SombraX",
];

const ZONES = ["Pista", "Zona VIP", "Escenario Principal", "Camping"];

const MESSAGES = [
  "La barra de la izquierda está vacía 🍺",
  "¡Qué locura el sonido aquí!",
  "Ojo con los empujones en el centro",
  "Cerraron el acceso a VIP",
  "El DJ acaba de subir el BPM 🔥",
  "Hay colapso total en la entrada principal",
  "Esto está lleno, imposible moverse",
  "¡Drop brutal! Todo el mundo saltando",
  "Seguridad bloqueando el paso a Escenario",
  "El ambiente en Camping está increíble ahora mismo",
  "Luz estroboscópica activada, precaución epilépticos",
  "¡Temazo! No para nadie aquí",
  "La pantalla gigante se fue de luz un momento",
  "Cola de 20 min para los baños en zona pista",
  "Alguien tiró una bengala, ojo ahí",
];

const HOT_KEYWORDS = ["colapso", "lleno", "brutal", "temazo", "drop", "bengala"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInterval(): number {
  return 15_000 + Math.random() * 5_000;
}

export interface BotSimulatorOptions {
  eventId: string;
}

export function startBotSimulator({ eventId }: BotSimulatorOptions): () => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  let stopped = false;
  let channel: RealtimeChannel | null = null;

  const channelName = `pulse-event-${eventId}`;
  channel = supabase.channel(channelName);
  channel.subscribe();

  const fire = () => {
    if (stopped || !channel) return;

    const id = crypto.randomUUID();
    const author = pickRandom(BOT_NAMES);
    const zone = pickRandom(ZONES);
    const text = pickRandom(MESSAGES);
    const lower = text.toLowerCase();
    const hot = HOT_KEYWORDS.some((kw) => lower.includes(kw));

    channel.send({
      type: "broadcast",
      event: "bot_message",
      payload: { id, author, zone, text, hot, ts: new Date().toISOString() },
    });

    if (!stopped) {
      timeoutId = setTimeout(fire, randomInterval());
    }
  };

  timeoutId = setTimeout(fire, randomInterval());

  return () => {
    stopped = true;
    clearTimeout(timeoutId);
    if (channel) supabase.removeChannel(channel);
  };
}
