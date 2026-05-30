import { createContext, useContext, useCallback, useRef, type ReactNode } from "react";
import type { DataConnection, Peer as PeerType } from "peerjs";
import { supabase } from "@/integrations/supabase/client";
import { getPeerId } from "@/lib/pulse/session";
import type { P2PMessage } from "@/hooks/useWebRTC";

interface WebRTCContextValue {
  broadcast: (type: string, payload: unknown) => void;
  peerId: string;
  status: string;
  connectedPeers: number;
  connectToZone: (eventId: string, zone: string, userId: string, onMessage?: (msg: P2PMessage) => void) => void;
  disconnectZone: () => void;
}

const WebRTCContext = createContext<WebRTCContextValue>({
  broadcast: () => {},
  peerId: "",
  status: "idle",
  connectedPeers: 0,
  connectToZone: () => {},
  disconnectZone: () => {},
});

export function useWebRTCContext() {
  return useContext(WebRTCContext);
}

interface WebRTCProviderProps {
  children: ReactNode;
}

export function WebRTCProvider({ children }: WebRTCProviderProps) {
  const peerRef = useRef<PeerType | null>(null);
  const connsRef = useRef<Map<string, DataConnection>>(new Map());
  const onMessageRef = useRef<((msg: P2PMessage) => void) | null>(null);
  const statusRef = useRef<string>("idle");
  const connectedPeersRef = useRef<number>(0);
  const peerIdRef = useRef<string>(getPeerId());

  const registerConn = useCallback((conn: DataConnection) => {
    const remote = conn.peer;
    conn.on("open", () => {
      connsRef.current.set(remote, conn);
      connectedPeersRef.current = connsRef.current.size;
    });
    conn.on("data", (data) => {
      const msg = data as P2PMessage;
      if (msg && typeof msg === "object" && "type" in msg) {
        onMessageRef.current?.(msg);
      }
    });
    const cleanup = () => {
      connsRef.current.delete(remote);
      connectedPeersRef.current = connsRef.current.size;
    };
    conn.on("close", cleanup);
    conn.on("error", cleanup);
  }, []);

  const disconnectZone = useCallback(() => {
    connsRef.current.forEach((c) => c.close());
    connsRef.current.clear();
    connectedPeersRef.current = 0;
    peerRef.current?.destroy();
    peerRef.current = null;
    statusRef.current = "idle";
  }, []);

  const connectToZone = useCallback(
    async (eventId: string, zone: string, userId: string, onMessage?: (msg: P2PMessage) => void) => {
      disconnectZone();
      onMessageRef.current = onMessage ?? null;

      if (!eventId || eventId.startsWith("demo-")) return;

      statusRef.current = "connecting";

      const myPeerId = peerIdRef.current;

      const { Peer } = await import("peerjs");
      const peer = new Peer(myPeerId, { debug: 1 });
      peerRef.current = peer;

      peer.on("open", async (id) => {
        peerIdRef.current = id;
        statusRef.current = "ready";

        const { data: nodos } = await supabase
          .from("nodos_activos")
          .select("peer_id_webrtc, usuario_id")
          .eq("evento_id", eventId)
          .eq("zona_recinto", zone);

        nodos?.forEach((n) => {
          if (!n.peer_id_webrtc || n.peer_id_webrtc === id) return;
          if (n.usuario_id === userId) return;
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
          statusRef.current = "error";
        }
      });

      // Subscribe to new nodos
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
            if (n.usuario_id === userId) return;
            const p = peerRef.current;
            if (!p || !n.peer_id_webrtc) return;
            if (connsRef.current.has(n.peer_id_webrtc)) return;
            try {
              const conn = p.connect(n.peer_id_webrtc, { reliable: true });
              registerConn(conn);
            } catch (e) {
              console.warn("[WebRTC] auto-connect failed", e);
            }
          },
        )
        .subscribe();

      // Store channel for cleanup
      const ch = channel;
      const origDisconnect = disconnectZone;
      const cleanup = () => {
        supabase.removeChannel(ch);
        origDisconnect();
      };
      // Override disconnectZone to include channel cleanup
      (peer as any).__cleanup = cleanup;
    },
    [disconnectZone, registerConn],
  );

  const broadcast = useCallback((type: string, payload: unknown) => {
    const msg: P2PMessage = {
      type,
      from: peerIdRef.current,
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
  }, []);

  return (
    <WebRTCContext.Provider
      value={{
        broadcast,
        peerId: peerIdRef.current,
        status: statusRef.current,
        connectedPeers: connectedPeersRef.current,
        connectToZone,
        disconnectZone,
      }}
    >
      {children}
    </WebRTCContext.Provider>
  );
}