import { useEffect, useRef, useState, useCallback } from "react";
import type { DataConnection, Peer as PeerType } from "peerjs";
import { supabase } from "@/integrations/supabase/client";
import { getPeerId } from "@/lib/pulse/session";

export interface P2PMessage {
  type: string;
  from: string;
  payload: unknown;
  ts: number;
}

interface Options {
  eventId: string;
  zone: string;
  userId: string;
  enabled?: boolean;
  onMessage?: (msg: P2PMessage) => void;
}

interface State {
  peerId: string | null;
  status: "idle" | "connecting" | "ready" | "error";
  connectedPeers: string[];
}

export function useWebRTC({ eventId, zone, userId, enabled = true, onMessage }: Options) {
  const [state, setState] = useState<State>({
    peerId: null,
    status: "idle",
    connectedPeers: [],
  });

  const peerRef = useRef<PeerType | null>(null);
  const connsRef = useRef<Map<string, DataConnection>>(new Map());
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const myPeerId = getPeerId();
  const myUserId = userId;
  const isDemo = !eventId || eventId.startsWith("demo-");

  const registerConn = useCallback((conn: DataConnection) => {
    const remote = conn.peer;
    conn.on("open", () => {
      connsRef.current.set(remote, conn);
      setState((s) =>
        s.connectedPeers.includes(remote)
          ? s
          : { ...s, connectedPeers: [...s.connectedPeers, remote] },
      );
    });
    conn.on("data", (data) => {
      const msg = data as P2PMessage;
      if (msg && typeof msg === "object" && "type" in msg) {
        onMessageRef.current?.(msg);
      }
    });
    const cleanup = () => {
      connsRef.current.delete(remote);
      setState((s) => ({
        ...s,
        connectedPeers: s.connectedPeers.filter((p) => p !== remote),
      }));
    };
    conn.on("close", cleanup);
    conn.on("error", cleanup);
  }, []);

  useEffect(() => {
    if (!enabled || isDemo) return;
    let cancelled = false;
    setState((s) => ({ ...s, status: "connecting" }));

    (async () => {
      const { Peer } = await import("peerjs");
      if (cancelled) return;

      const peer = new Peer(myPeerId, { debug: 1 });
      peerRef.current = peer;

      peer.on("open", async (id) => {
        setState((s) => ({ ...s, peerId: id, status: "ready" }));

        const { data: nodos } = await supabase
          .from("nodos_activos")
          .select("peer_id_webrtc, usuario_id")
          .eq("evento_id", eventId)
          .eq("zona_recinto", zone);

        nodos?.forEach((n) => {
          if (!n.peer_id_webrtc || n.peer_id_webrtc === id) return;
          if (n.usuario_id === myUserId) return;
          if (connsRef.current.has(n.peer_id_webrtc)) return;
          try {
            const conn = peer.connect(n.peer_id_webrtc, { reliable: true });
            registerConn(conn);
          } catch (e) {
            console.warn("[WebRTC] connect failed", n.peer_id_webrtc, e);
          }
        });
      });

      peer.on("connection", (conn) => registerConn(conn));
      peer.on("error", (err) => {
        console.warn("[WebRTC] peer error:", err.type, err.message);
        if (err.type === "network" || err.type === "server-error") {
          setState((s) => ({ ...s, status: "error" }));
        }
      });
    })();

    return () => {
      cancelled = true;
      connsRef.current.forEach((c) => c.close());
      connsRef.current.clear();
      peerRef.current?.destroy();
      peerRef.current = null;
    };
  }, [enabled, isDemo, eventId, zone, myPeerId, myUserId, registerConn]);

  useEffect(() => {
    if (!enabled || isDemo) return;
    const channel = supabase
      .channel(`webrtc-discovery-${eventId}-${zone}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "nodos_activos",
          filter: `evento_id=eq.${eventId}`,
        },
        (payload) => {
          const n = payload.new as {
            peer_id_webrtc: string;
            zona_recinto: string;
            usuario_id: string;
          };
          if (n.zona_recinto !== zone) return;
          if (n.usuario_id === myUserId) return;
          const peer = peerRef.current;
          if (!peer || !n.peer_id_webrtc) return;
          if (connsRef.current.has(n.peer_id_webrtc)) return;
          try {
            const conn = peer.connect(n.peer_id_webrtc, { reliable: true });
            registerConn(conn);
          } catch (e) {
            console.warn("[WebRTC] auto-connect failed", e);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, isDemo, eventId, zone, myUserId, registerConn]);

  const broadcast = useCallback((type: string, payload: unknown) => {
    const msg: P2PMessage = {
      type,
      from: myPeerId,
      payload,
      ts: Date.now(),
    };
    connsRef.current.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(msg);
        } catch (e) {
          console.warn("[WebRTC] send failed", e);
        }
      }
    });
    return msg;
  }, [myPeerId]);

  return {
    peerId: state.peerId ?? myPeerId,
    status: state.status,
    connectedPeers: state.connectedPeers,
    peerCount: state.connectedPeers.length,
    broadcast,
  };
}
