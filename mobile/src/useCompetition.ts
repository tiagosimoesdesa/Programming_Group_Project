import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { BASE, Detail, liveToken, request } from "./api";

export function useCompetition(id: string, player?: string) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const n = ++sequence.current;
    try {
      const value = await request<Detail>(
        `/competitions/${id}${player ? `?player=${encodeURIComponent(player)}` : ""}`,
      );
      if (mounted.current && n === sequence.current) {
        setDetail(value);
        setError("");
      }
    } catch (e) {
      if (mounted.current && n === sequence.current)
        setError((e as Error).message);
    }
  }, [id, player]);
  async function loadMore() {
    if (!detail?.next_cursor || loading) return;
    setLoading(true);
    const revision = detail.competition.revision;
    const generation = sequence.current;
    try {
      const page = await request<Detail>(
        `/competitions/${id}?before=${detail.next_cursor}${player ? `&player=${encodeURIComponent(player)}` : ""}`,
      );
      if (mounted.current && sequence.current === generation)
        setDetail((current) =>
          current && current.competition.revision === revision
            ? {
                ...current,
                feed: [
                  ...current.feed,
                  ...page.feed.filter(
                    (p) => !current.feed.some((old) => old.id === p.id),
                  ),
                ],
                next_cursor: page.next_cursor,
              }
            : current,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    let active = AppState.currentState === "active";
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let online = false;
    let lastRefresh = 0;
    let lastHeartbeat = 0;
    let attempts = 0;
    async function connect() {
      if (disposed || !active) return;
      try {
        const token = await liveToken();
        if (disposed || !active) return;
        const socketBase =
          (Platform.OS === "web"
            ? process.env.EXPO_PUBLIC_WEB_SOCKET_URL
            : undefined) || BASE.replace(/^http/, "ws");
        socket = new WebSocket(
          `${socketBase.replace(/^http/, "ws")}/ws/competitions/${id}`,
        );
        socket.onopen = () => socket?.send(JSON.stringify({ token }));
        socket.onmessage = (event) => {
          if (disposed || !active) return;
          online = true;
          lastHeartbeat = Date.now();
          attempts = 0;
          setConnected(true);
          try {
            const message = JSON.parse(event.data);
            if (message.type === "changed") {
              lastRefresh = Date.now();
              void refresh();
            }
          } catch {
            /* Ignore malformed network frames. */
          }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => {
          online = false;
          if (disposed) return;
          setConnected(false);
          if (active)
            reconnect = setTimeout(
              () => void connect(),
              Math.min(30000, 1500 * 2 ** attempts++),
            );
        };
      } catch {
        if (!disposed && active)
          reconnect = setTimeout(() => void connect(), 10000);
      }
    }
    void refresh();
    void connect();
    const poll = setInterval(() => {
      if (active && online && Date.now() - lastHeartbeat > 12000) {
        online = false;
        setConnected(false);
        socket?.close();
      }
      if (active && (!online || Date.now() - lastRefresh > 240000)) {
        lastRefresh = Date.now();
        void refresh();
      }
    }, 8000);
    const listener = AppState.addEventListener("change", (state) => {
      const wasActive = active;
      active = state === "active";
      if (!active) {
        clearTimeout(reconnect);
        socket?.close();
      } else if (!wasActive) {
        void refresh();
        void connect();
      }
    });
    return () => {
      disposed = true;
      mounted.current = false;
      sequence.current++;
      clearInterval(poll);
      clearTimeout(reconnect);
      listener.remove();
      socket?.close();
    };
  }, [id, refresh]);
  return { detail, error, connected, refresh, loadMore, loading };
}
