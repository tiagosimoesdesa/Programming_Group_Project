import React, { useEffect, useState } from "react";
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BeerGlass } from "./Brand";
import { Competition, DailyCelebration, Detail, request } from "./api";
import { Button, Icon, colors, s } from "./ui";

function friends(count: number) {
  return `${count} ${count === 1 ? "friend" : "friends"}`;
}

const modeLabels = { classic: "Classic", party: "Party", battle: "Battle" };

function CelebrationCard({ card }: { card: DailyCelebration }) {
  return (
    <View style={styles.celebration}>
      <View style={styles.celebrationHeader}>
        <View style={styles.celebrationLabel}>
          <Icon name="globe-outline" color={colors.yellow} size={20} />
          <Text style={[s.label, { color: colors.yellow, flexShrink: 1 }]}>
            Today's Reason to Celebrate
          </Text>
        </View>
        <Text style={[s.small, styles.celebrationDate]}>
          {card.display_date}
        </Text>
      </View>
      <Text style={styles.celebrationLead}>
        I was not going to drink today, but...
      </Text>
      <Text style={s.h3}>{card.title}</Text>
      <Text style={s.body}>{card.fact}</Text>
    </View>
  );
}

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
  onOptions,
}: {
  event: Competition;
  onOpen: () => void;
  onOptions?: () => void;
}) {
  return (
    <View style={[s.card, { padding: 0, gap: 0, flexDirection: "row" }]}>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [
          s.row,
          { flex: 1, padding: 20 },
          pressed && { opacity: 0.8 },
        ]}
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
        {!onOptions && (
          <Icon name="chevron-forward" color={colors.yellow} size={18} />
        )}
      </Pressable>
      {onOptions && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Options for ${event.name}`}
          onPress={onOptions}
          style={{
            minWidth: 54,
            alignItems: "center",
            justifyContent: "center",
            borderLeftWidth: 1,
            borderLeftColor: colors.line,
          }}
        >
          <Icon name="ellipsis-horizontal" color={colors.yellow} />
        </Pressable>
      )}
    </View>
  );
}

export default function TonightScreen({
  nights,
  onOpen,
  onStart,
  onJoin,
}: {
  nights: Competition[];
  onOpen: (id: string) => void;
  onStart: () => void;
  onJoin: () => void;
}) {
  const [featured, ...more] = nights;
  const [celebration, setCelebration] = useState<DailyCelebration | null>(null);
  const { height } = useWindowDimensions();
  useEffect(() => {
    let current = true;
    let loading = false;
    const loadCelebration = async () => {
      if (loading) return;
      loading = true;
      try {
        const card = await request<DailyCelebration>("/daily-celebration");
        if (current) setCelebration(card);
      } catch {
        // Tonight remains available if the daily fact request fails.
      } finally {
        loading = false;
      }
    };
    void loadCelebration();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void loadCelebration();
    });
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);
  return (
    <View style={{ gap: 16 }}>
      <Text accessibilityRole="header" style={s.h1}>
        Tonight
      </Text>
      {!featured && celebration && <CelebrationCard card={celebration} />}
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
          {celebration && <CelebrationCard card={celebration} />}
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
  celebration: {
    borderWidth: 2,
    borderColor: colors.yellow,
    borderRadius: 17,
    backgroundColor: "#2A1A0FD9",
    paddingHorizontal: 17,
    paddingVertical: 15,
    gap: 8,
    shadowColor: colors.yellow,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  celebrationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  celebrationLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  celebrationDate: { color: "#F5E5D6", fontWeight: "700" },
  celebrationLead: {
    color: colors.yellow,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  empty: { alignItems: "center", gap: 14, paddingBottom: 20 },
  emptyCopy: { textAlign: "center", maxWidth: 275 },
  emptyActions: {
    alignSelf: "stretch",
    gap: 12,
    marginHorizontal: 7,
    marginTop: 8,
  },
});
