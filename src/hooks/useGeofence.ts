/**
 * useGeofence
 *
 * - Observa la posición GPS del usuario (watchPosition, no getCurrentPosition)
 * - Solo re-consulta Supabase si el usuario se movió más de MOVE_THRESHOLD_METERS
 * - Devuelve los eventos cercanos y el primer evento cuyo radio_metros cubre al usuario
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { distanceMeters } from "@/lib/pulse/session";
import type { PulseEvent } from "@/components/pulse/RadarView";

export type GeoStatus =
  | "idle"
  | "requesting"
  | "watching"
  | "denied"
  | "unavailable"
  | "error";

export interface GeofenceState {
  position: GeolocationCoordinates | null;
  nearbyEvents: PulseEvent[];
  activeEvent: PulseEvent | null;
  status: GeoStatus;
  accuracy: number | null;
  lastQueryAt: number | null;
}

/** Mínimo de metros que el usuario debe moverse para disparar una nueva consulta a Supabase */
const MOVE_THRESHOLD_METERS = 50;

/** Transform a raw eventos DB row into a PulseEvent */
export function toPulseEvent(row: {
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
    theme: row.tema === "sport" ? "sport" : "festival",
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

/** Tiempo mínimo entre consultas (ms), aunque el usuario se haya movido suficiente */
const MIN_QUERY_INTERVAL_MS = 15_000;

export function useGeofence(): GeofenceState {
  const [position, setPosition] = useState<GeolocationCoordinates | null>(null);
  const [nearbyEvents, setNearbyEvents] = useState<PulseEvent[]>([]);
  const [activeEvent, setActiveEvent] = useState<PulseEvent | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [lastQueryAt, setLastQueryAt] = useState<number | null>(null);

  // Última posición en la que se hizo una consulta a Supabase
  const lastQueriedPos = useRef<{ lat: number; lng: number } | null>(null);
  const lastQueryTime = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);

  const queryEvents = useCallback(async (lat: number, lng: number) => {
    const now = Date.now();

    // Debounce: no consultar si no se ha movido suficiente y no ha pasado suficiente tiempo
    if (lastQueriedPos.current) {
      const moved = distanceMeters(lastQueriedPos.current, { lat, lng });
      const elapsed = now - lastQueryTime.current;
      if (moved < MOVE_THRESHOLD_METERS && elapsed < MIN_QUERY_INTERVAL_MS) return;
    }

    lastQueriedPos.current = { lat, lng };
    lastQueryTime.current = now;

    const { data: eventos, error } = await supabase
      .from("eventos")
      .select("id, nombre, venue, tema, latitud, longitud, radio_metros, zonas")
      .eq("activo", true);

    if (error || !eventos) return;

    const pulseEvents = eventos.map(toPulseEvent);

    // Enriquecer con conteo de nodos activos
    const ids = pulseEvents.map((e) => e.id);
    if (ids.length) {
      const { data: nodos } = await supabase
        .from("nodos_activos")
        .select("evento_id")
        .in("evento_id", ids);
      if (nodos) {
        const counts = nodos.reduce<Record<string, number>>((acc, n) => {
          acc[n.evento_id] = (acc[n.evento_id] ?? 0) + 1;
          return acc;
        }, {});
        pulseEvents.forEach((e) => { e.liveUsers = counts[e.id] ?? 0; });
      }
    }

    // Clasificar: dentro del radio (activeEvent) vs. en catálogo (nearby)
    const userCoords = { lat, lng };
    const inRange = pulseEvents.filter(
      (e) =>
        e.lat !== undefined &&
        e.lng !== undefined &&
        e.radio !== undefined &&
        distanceMeters(userCoords, { lat: e.lat, lng: e.lng }) <= e.radio,
    );
    const sorted = [...pulseEvents].sort((a, b) => {
      if (!a.lat || !a.lng) return 1;
      if (!b.lat || !b.lng) return -1;
      return (
        distanceMeters(userCoords, { lat: a.lat, lng: a.lng }) -
        distanceMeters(userCoords, { lat: b.lat, lng: b.lng })
      );
    });

    setNearbyEvents(sorted);
    setActiveEvent(inRange[0] ?? sorted[0] ?? null);
    setLastQueryAt(Date.now());
  }, []);

  useEffect(() => {
    if (!navigator?.geolocation) {
      setStatus("unavailable");
      return;
    }

    setStatus("requesting");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("watching");
        setPosition(pos.coords);
        setAccuracy(pos.coords.accuracy);
        queryEvents(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus("denied");
        } else {
          setStatus("error");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 30_000,
      },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [queryEvents]);

  return { position, nearbyEvents, activeEvent, status, accuracy, lastQueryAt };
}
