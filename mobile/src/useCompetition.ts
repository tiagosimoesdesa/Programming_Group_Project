import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { BASE, Detail, liveToken, Photo, request } from "./api";

export function useCompetition(id: string, player?: string) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const latest = useRef<Detail | null>(null);
  const sequence = useRef(0);
  const query = useMemo(
    () => ({
      controller: new AbortController(),
      flight: null as Promise<void> | null,
      pending: false,
    }),
    [id, player],
  );
  const refresh = useCallback(
    (afterChange = true) => {
      const signal = query.controller.signal;
      if (signal.aborted) return Promise.resolve();
      if (query.flight) {
        query.pending ||= afterChange;
        return query.flight;
      }
      const path = `/competitions/${id}${player ? `?player=${encodeURIComponent(player)}` : ""}`;
      query.flight = (async () => {
        do {
          query.pending = false;
          sequence.current++;
          try {
            const value = await request<Detail>(path, { signal });
            if (!signal.aborted) {
              latest.current = value;
              setDetail(value);
              setError("");
            }
          } catch (e) {
            if (!signal.aborted) setError((e as Error).message);
          }
        } while (query.pending && !signal.aborted);
      })().finally(() => {
        if (signal === query.controller.signal) query.flight = null;
      });
      return query.flight;
    },
    [id, player, query],
  );
  const refreshCurrent = useRef(refresh);
  useEffect(() => {
    refreshCurrent.current = refresh;
    const controller = new AbortController();
    query.controller = controller;
    query.flight = null;
    void refresh(false);
    return () => controller.abort();
  }, [query, refresh]);
  function replacePhoto(photo: Photo) {
    // Keep any older pages already loaded while the next live refresh runs.
    sequence.current++;
    setDetail(
      (current) =>
        current && {
          ...current,
          feed: current.feed.map((item) =>
            item.id === photo.id ? photo : item,
          ),
        },
    );
  }
  async function loadMore() {
    if (!detail?.next_cursor || loading) return;
    const signal = query.controller.signal;
    setLoading(true);
    const revision = detail.competition.revision;
    const generation = sequence.current;
    try {
      const page = await request<Detail>(
        `/competitions/${id}?before=${detail.next_cursor}${player ? `&player=${encodeURIComponent(player)}` : ""}`,
        { signal },
      );
      if (!signal.aborted && sequence.current === generation)
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
      if (!signal.aborted) setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = AppState.currentState === "active";
    let disposed = false;
    let socket: WebSocket | null = null;
    let connecting = false;
    let generation = 0;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let online = false;
    let lastRefresh = Date.now();
    let lastHeartbeat = 0;
    let revision: string | undefined;
    let attempts = 0;
    async function connect(verify = false) {
      if (disposed || !active || connecting || socket) return;
      connecting = true;
      const attempt = generation;
      try {
        const token = await liveToken(verify);
        if (disposed || !active || attempt !== generation) return;
        const socketBase =
          (Platform.OS === "web"
            ? process.env.EXPO_PUBLIC_WEB_SOCKET_URL
            : undefined) || BASE.replace(/^http/, "ws");
        const current = new WebSocket(
          `${socketBase.replace(/^http/, "ws")}/ws/competitions/${id}`,
        );
        socket = current;
        current.onopen = () => {
          if (socket === current) current.send(JSON.stringify({ token }));
        };
        current.onmessage = (event) => {
          if (disposed || !active || socket !== current) return;
          online = true;
          lastHeartbeat = Date.now();
          attempts = 0;
          setConnected(true);
          try {
            const message = JSON.parse(event.data);
            if (
              message.type === "changed" &&
              typeof message.revision === "string" &&
              message.revision !== revision
            ) {
              const first = revision === undefined;
              revision = message.revision;
              const [number, , phase] = message.revision.split(":");
              const caughtUp = () => {
                const loaded = latest.current?.competition;
                return (
                  loaded?.id === id &&
                  loaded.revision >= Number(number) &&
                  (!phase || Boolean(loaded.ended_at))
                );
              };
              lastRefresh = Date.now();
              if (!first) {
                void refreshCurrent.current();
              } else if (!caughtUp()) {
                void refreshCurrent.current(false).then(() => {
                  if (
                    socket === current &&
                    latest.current &&
                    !caughtUp() &&
                    revision === message.revision
                  )
                    void refreshCurrent.current();
                });
              }
            }
          } catch {
            /* Ignore malformed network frames. */
          }
        };
        current.onerror = () => current.close();
        current.onclose = (event) => {
          if (socket !== current) return;
          socket = null;
          online = false;
          if (disposed) return;
          setConnected(false);
          if (active)
            reconnect = setTimeout(
              () => void connect(event.code === 4401),
              Math.min(30000, 1500 * 2 ** attempts++) *
                (0.8 + Math.random() * 0.4),
            );
        };
      } catch {
        if (!disposed && active && attempt === generation)
          reconnect = setTimeout(
            () => void connect(verify),
            8000 + Math.random() * 4000,
          );
      } finally {
        if (attempt === generation) connecting = false;
      }
    }
    function disconnect() {
      generation++;
      connecting = false;
      online = false;
      clearTimeout(reconnect);
      const current = socket;
      socket = null;
      current?.close();
    }
    void connect();
    const poll = setInterval(() => {
      if (active && online && Date.now() - lastHeartbeat > 12000) {
        online = false;
        setConnected(false);
        socket?.close();
      }
      if (active && (!online || Date.now() - lastRefresh > 240000)) {
        lastRefresh = Date.now();
        void refreshCurrent.current(false);
      }
    }, 8000);
    const listener = AppState.addEventListener("change", (state) => {
      const wasActive = active;
      active = state === "active";
      if (!active) {
        disconnect();
        setConnected(false);
      } else if (!wasActive) {
        void refreshCurrent.current();
        void connect();
      }
    });
    return () => {
      disposed = true;
      disconnect();
      clearInterval(poll);
      listener.remove();
    };
  }, [id]);
  return { detail, error, connected, refresh, loadMore, loading, replacePhoto };
}
