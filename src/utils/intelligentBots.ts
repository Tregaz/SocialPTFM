import { supabase } from "@/integrations/supabase/client";

const FESTIVALS = [
  {
    nombre: "Coachella",
    venue: "Empire Polo Club",
    tema: "Indie, Rock, Hip Hop, EDM",
    latitud: 33.6784,
    longitud: -116.2372,
    radio_metros: 1000,
    zonas: ["Main Stage", "Outdoor Theatre", "Sahara Tent", "Mojave Tent", "Gobi Tent", "Rose Garden"],
    activo: true,
  },
  {
    nombre: "Tomorrowland",
    venue: "De Schorre",
    tema: "Electronic Dance Music",
    latitud: 51.0913,
    longitud: 4.3855,
    radio_metros: 800,
    zonas: ["Mainstage", "Freedom Stage", "Rose Garden", "Harbour House", "The Library"],
    activo: true,
  },
  {
    nombre: "Glastonbury",
    venue: "Worthy Farm",
    tema: "Contemporary Performing Arts",
    latitud: 51.1598,
    longitud: -2.5855,
    radio_metros: 1500,
    zonas: ["Pyramid Stage", "Other Stage", "West Holts Stage", "The Park Stage", "Acoustic Stage"],
    activo: true,
  },
  {
    nombre: "Ultra Miami",
    venue: "Bayfront Park",
    tema: "Electronic Music",
    latitud: 25.7825,
    longitud: -80.1856,
    radio_metros: 500,
    zonas: ["Main Stage", "Live Stage", "Worldwide Stage", "Resistance Megastructure", "UMF Radio"],
    activo: true,
  },
  {
    nombre: "Sónar Barcelona",
    venue: "Fira Montjuïc / Fira Gran Via",
    tema: "Music, Creativity & Technology",
    latitud: 41.3851,
    longitud: 2.1734,
    radio_metros: 600,
    zonas: ["SónarVillage", "SónarHall", "SónarComplex", "SónarClub", "SónarLab"],
    activo: true,
  },
  {
    nombre: "Lollapalooza Chicago",
    venue: "Grant Park",
    tema: "Alternative Rock, Heavy Metal, Punk Rock, Hip Hop",
    latitud: 41.8708,
    longitud: -87.6236,
    radio_metros: 900,
    zonas: ["Bud Light Stage", "T-Mobile Stage", "Coinbase Stage", "Perry's Stage", "Kidzapalooza"],
    activo: true,
  },
];

const NEWS_TEMPLATES = [
  "Acceso cerrado temporalmente por exceso de aforo.",
  "Urgente: Se requiere personal médico en el escenario principal.",
  "Se informa de un colapso en las vías de evacuación secundarias.",
  "Retraso de 30 minutos en la actuación de los cabezas de cartel.",
  "El parking norte está completo. Por favor, usen el parking sur.",
  "¡Increíble ambiente en la zona de comida! Recomendamos los tacos.",
  "Recuerda hidratarte constantemente, hay puntos de agua gratuita.",
  "La puesta de sol desde el escenario principal está siendo épica.",
  "Objetos perdidos: Se ha encontrado una mochila negra cerca de la entrada.",
  "¿Alguien ha visto a un grupo con banderas amarillas? ¡Los buscamos!",
];

const HOT_KEYWORDS = ['colapso', 'retraso', 'completo', 'cerrado', 'urgente', '🔴', 'colapso', 'urgente', 'collapse'];
const BOT_USER_ID = "00000000-0000-0000-0000-000000000000";
const BOT_NAME = "Pulse News Bot";

export const fetchProximosEventos = async () => {
  console.log("[IntelligentBots] Seeding festivals...");
  try {
    const { error } = await supabase
      .from('eventos')
      .upsert(FESTIVALS, { onConflict: 'nombre' });

    if (error) {
      console.error("[IntelligentBots] Error seeding festivals:", error);
    } else {
      console.log("[IntelligentBots] Festivals seeded successfully.");
    }
  } catch (err) {
    console.error("[IntelligentBots] Unexpected error during seeding:", err);
  }
};

export const generateLiveNews = async () => {
  try {
    const { data: activeEvents, error } = await supabase
      .from('eventos')
      .select('*')
      .eq('activo', true);

    if (error || !activeEvents || activeEvents.length === 0) {
      return;
    }

    const event = activeEvents[Math.floor(Math.random() * activeEvents.length)];
    const zona = event.zonas[Math.floor(Math.random() * event.zonas.length)];
    const text = NEWS_TEMPLATES[Math.floor(Math.random() * NEWS_TEMPLATES.length)];
    
    const isHot = HOT_KEYWORDS.some(keyword => text.toLowerCase().includes(keyword));

    const { error: insertError } = await supabase
      .from('mensajes')
      .insert({
        evento_id: event.id,
        zona_recinto: zona,
        usuario_id: BOT_USER_ID,
        usuario_nombre: BOT_NAME,
        texto: text,
        hot: isHot,
      });

    if (insertError) {
      console.error("[IntelligentBots] Error inserting live news:", insertError);
    } else {
      console.log(`[IntelligentBots] News generated for ${event.nombre}: ${text} (Hot: ${isHot})`);
    }
  } catch (err) {
    console.error("[IntelligentBots] Unexpected error generating news:", err);
  }
};

/**
 * Initializes the system in development mode.
 * Upserts major festivals and starts a loop to generate contextual news messages.
 */
export function startIntelligentBots() {
  let timeoutId: ReturnType<typeof setTimeout>;
  let isRunning = true;

  // Initial seed
  fetchProximosEventos();

  const loop = async () => {
    if (!isRunning) return;
    await generateLiveNews();
    
    // Periodically generate news every 20-30 seconds
    const nextInterval = 20000 + Math.random() * 10000;
    timeoutId = setTimeout(loop, nextInterval);
  };

  // Start the loop after a short delay to allow seeding to settle
  timeoutId = setTimeout(loop, 5000);

  return () => {
    isRunning = false;
    clearTimeout(timeoutId);
    console.log("[IntelligentBots] System stopped.");
  };
}
