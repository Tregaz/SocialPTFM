const KEY_PEER = "pulse.peer_id";

export function getPeerId(): string {
  if (typeof window === "undefined") return `peer_${crypto.randomUUID().slice(0, 8)}`;
  let v = window.localStorage.getItem(KEY_PEER);
  if (!v) {
    v = `peer_${crypto.randomUUID().slice(0, 8)}`;
    window.localStorage.setItem(KEY_PEER, v);
  }
  return v;
}

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function getCurrentPosition(timeout = 5000): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { timeout, enableHighAccuracy: false, maximumAge: 60000 },
    );
  });
}
