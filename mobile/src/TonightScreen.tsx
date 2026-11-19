import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BeerGlass } from "./Brand";
import { Competition, Detail, request } from "./api";
import { Button, Icon, colors, s } from "./ui";

function friends(count: number) {
  return `${count} ${count === 1 ? "friend" : "friends"}`;
}

const modeLabels = { classic: "Classic", party: "Party", battle: "Battle" };

function ActiveNight({
  event,
  onOpen,
}: {
  event: Competition;
  onOpen: () => void;
}) {
  const [cover, setCover] = useState<string | null>(null);
  const { height } = useWindowDimensions();
  useEffect(() => {
    let current = true;
    void request<Detail>(`/competitions/${event.id}`)
      .then(({ feed }) => {
        const photo = feed.find((entry) => entry.kind !== "challenge");
        if (current) setCover(photo?.front_url || photo?.rear_url || null);
      })
      .catch(() => {
        // The photo is optional. The night opens even if its cover cannot load.
      });
    return () => {
      current = false;
    };
  }, [event]);

  return (
    <View
      style={[
        styles.hero,
        {
          minHeight: cover ? Math.min(490, Math.max(300, height * 0.53)) : 211,
        },
      ]}
    >
      {cover && (
        <>
          <Image
            accessible={false}
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() =>
              setCover((current) => (current === cover ? null : current))
            }
          />
          <LinearGradient
            colors={["#0B09072B", "transparent", "#0B0907F5"]}
            locations={[0, 0.37, 1]}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      <View style={styles.live}>
        <View style={styles.liveDot} />
        <Text style={[s.label, { color: colors.yellow }]}>
          {event.mode === "battle" && !event.battle_started_at
            ? "Lobby"
            : "Live"}
        </Text>
      </View>
      <View style={{ alignItems: "flex-start", gap: 5 }}>
        <Text style={s.h2}>{event.name}</Text>
        <Text style={s.body}>
          {modeLabels[event.mode]} · {friends(event.participants)}
        </Text>
        <Button
          title="Open night"
          onPress={onOpen}
          compact
          style={{ marginTop: 6, paddingHorizontal: 17 }}
        />
      </View>
    </View>
  );
}

export function NightListItem({
  event,
  onOpen,
}: {
  event: Competition;
  onOpen: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onOpen}
      style={({ pressed }) => [s.card, s.row, pressed && { opacity: 0.8 }]}
    >
      <View style={s.iconButton}>
        <Icon
          name={event.ended_at ? "albums-outline" : "moon-outline"}
          color={colors.yellow}
        />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.h3}>{event.name}</Text>
        <Text style={s.small}>
          {modeLabels[event.mode]} · {friends(event.participants)} ·{" "}
          {new Date(event.created_at * 1000).toLocaleDateString([], {
            month: "short",
            day: "numeric",
          })}
        </Text>
      </View>
      <Icon name="chevron-forward" color={colors.yellow} size={18} />
    </Pressable>
  );
}

export default function TonightScreen({
  nights,
  onOpen,
  onStart,
  onJoin,
  onBattle,
}: {
  nights: Competition[];
  onOpen: (id: string) => void;
  onStart: () => void;
  onJoin: () => void;
  onBattle: () => void;
}) {
  const [featured, ...more] = nights;
  const { height } = useWindowDimensions();
  return (
    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={s.h1}>
        Tonight
      </Text>
      {featured ? (
        <>
          <ActiveNight
            key={featured.id}
            event={featured}
            onOpen={() => onOpen(featured.id)}
          />
          <View style={styles.actions}>
            <Button
              title="Start a night"
              icon="add"
              onPress={onStart}
              secondary
              compact
              style={styles.action}
            />
            <Button
              title="Join with a code"
              icon="ticket-outline"
              onPress={onJoin}
              secondary
              compact
              style={styles.action}
            />
          </View>
          {more.map((event) => (
            <NightListItem
              key={event.id}
              event={event}
              onOpen={() => onOpen(event.id)}
            />
          ))}
        </>
      ) : (
        <View style={[styles.empty, { paddingTop: height > 700 ? 45 : 24 }]}>
          <BeerGlass height={Math.min(148, Math.max(96, height * 0.17))} />
          <Text style={[s.h2, { textAlign: "center" }]}>No active nights</Text>
          <Text style={[s.body, styles.emptyCopy]}>
            Invite friends to a new night, or enter a code from your host.
          </Text>
          <View style={styles.emptyActions}>
            <Button title="Start a night" icon="add" onPress={onStart} />
            <Button
              title="Join with a code"
              icon="ticket-outline"
              onPress={onJoin}
              secondary
            />
          </View>
        </View>
      )}
      <Button
        title="Battle"
        icon="trophy-outline"
        onPress={onBattle}
        secondary
        compact
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: "hidden",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 17,
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 18,
  },
  live: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#15100DE8",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: {
    backgroundColor: colors.yellow,
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  actions: { flexDirection: "row", gap: 9 },
  action: { flex: 1 },
  empty: { alignItems: "center", gap: 14, paddingBottom: 20 },
  emptyCopy: { textAlign: "center", maxWidth: 275 },
  emptyActions: {
    alignSelf: "stretch",
    gap: 12,
    marginHorizontal: 7,
    marginTop: 8,
  },
});
