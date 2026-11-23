import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import { BASE, Detail, liveToken, Photo, request } from "./api";

type Reaction = string | null;
type ReactionFeedback = { emoji: Reaction; error?: never } | { error: string };

function previewReaction(photo: Photo, emoji: Reaction): Photo {
  const previous = photo.my_reaction ?? null;
  if (previous === emoji) return photo;
  const reactions = { ...photo.reactions };
  if (previous) {
    const count = (reactions[previous] ?? 0) - 1;
    if (count > 0) reactions[previous] = count;
    else delete reactions[previous];
  }
  if (emoji) reactions[emoji] = (reactions[emoji] ?? 0) + 1;
  return { ...photo, my_reaction: emoji, reactions };
}

export function useCompetition(id: string, player?: string) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const latest = useRef<Detail | null>(null);
  const reactionVersion = useRef(0);
  const reactionWrites = useRef(new Map<string, { desired: Reaction }>());
  const [reactionFeedback, setReactionFeedback] = useState(
    () => new Map<string, ReactionFeedback>(),
  );
  const query = useMemo(() => {
    const path = `/competitions/${id}${player ? `?player=${encodeURIComponent(player)}` : ""}`;
    return {
      path,
      pagePath: `${path}${player ? "&" : "?"}before=`,
      controller: new AbortController(),
      flight: null as Promise<void> | null,
      pending: false,
      pages: 0,
    };
  }, [id, player]);
  const refresh = useCallback(
    (afterChange = true) => {
      const signal = query.controller.signal;
      if (signal.aborted) return Promise.resolve();
      if (query.flight) {
        query.pending ||= afterChange;
        return query.flight;
      }
      query.flight = (async () => {
        do {
          query.pending = false;
          const version = reactionVersion.current;
          try {
            const value = await request<Detail>(query.path, { signal });
            let phaseChanged = false;
            // Keep earlier photos on screen when a live reaction refreshes the feed.
            for (
              let page = 1;
              page < query.pages && value.next_cursor;
              page++
            ) {
              const older = await request<Detail>(
                query.pagePath + value.next_cursor,
                { signal },
              );
              if (value.battle?.status !== older.battle?.status) {
                phaseChanged = true;
                break;
              }
              value.feed.push(...older.feed);
              value.next_cursor = older.next_cursor;
            }
            if (!signal.aborted) {
              // Retry a snapshot that predates a completed write or spans a Battle phase change.
              if (phaseChanged || version !== reactionVersion.current) {
                query.pending = true;
                continue;
              }
              if (!query.pages) query.pages = 1;
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
    [query],
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
  function showReactionFeedback(photoId: string, feedback?: ReactionFeedback) {
    setReactionFeedback((current) => {
      const next = new Map(current);
      if (feedback) next.set(photoId, feedback);
      else next.delete(photoId);
      return next;
    });
  }
  async function react(photo: Photo, emoji: string) {
    const pending = reactionWrites.current.get(photo.id);
    const selected = pending ? pending.desired : photo.my_reaction;
    const desired = selected === emoji ? null : emoji;
    showReactionFeedback(photo.id, { emoji: desired });
    if (pending) {
      pending.desired = desired;
      return;
    }

    // Each photo has one write in flight. New taps replace its queued choice.
    const write = { desired };
    reactionWrites.current.set(photo.id, write);
    for (;;) {
      const sent = write.desired;
      const base = latest.current;
      let failure: ReactionFeedback | undefined;
      let needsRefresh = !connected;
      try {
        const updated = await request<Photo>(
          `/competitions/${id}/photos/${photo.id}/reaction`,
          { method: "PUT", body: JSON.stringify({ emoji: sent }) },
        );
        reactionVersion.current++;
        // The refresh may already include reactions saved after this write.
        const refreshed = latest.current !== base;
        needsRefresh ||= refreshed;
        setDetail(
          (current) =>
            current && {
              ...current,
              feed: current.feed.map((item) => {
                if (item.id !== updated.id) return item;
                if (refreshed)
                  return previewReaction(item, updated.my_reaction ?? null);
                return {
                  ...item,
                  my_reaction: updated.my_reaction,
                  reactions: updated.reactions,
                };
              }),
            },
        );
      } catch {
        failure = { error: "Couldn't save your reaction. Tap to try again." };
      }
      if (write.desired !== sent) continue;
      reactionWrites.current.delete(photo.id);
      showReactionFeedback(photo.id, failure);
      if (failure || needsRefresh) void refreshCurrent.current();
      return;
    }
  }
  async function loadMore() {
    if (!detail?.next_cursor || loading || !query.pages) return;
    const signal = query.controller.signal;
    setLoading(true);
    const base = latest.current;
    const cursor = detail.next_cursor;
    try {
      const page = await request<Detail>(query.pagePath + cursor, { signal });
      if (!signal.aborted && latest.current === base) {
        if (base?.battle?.status !== page.battle?.status) {
          void refresh();
          return;
        }
        query.pages++;
        setDetail((current) =>
          current && current.next_cursor === cursor
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
      }
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
  const visibleDetail = useMemo(() => {
    if (!detail || reactionFeedback.size === 0) return detail;
    return {
      ...detail,
      feed: detail.feed.map((photo) => {
        const feedback = reactionFeedback.get(photo.id);
        return feedback && "emoji" in feedback
          ? previewReaction(photo, feedback.emoji)
          : photo;
      }),
    };
  }, [detail, reactionFeedback]);
  return {
    detail: visibleDetail,
    error,
    connected,
    refresh,
    loadMore,
    loading,
    react,
    reactionFeedback,
  };
}
