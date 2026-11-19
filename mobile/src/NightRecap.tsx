import React, { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Detail, Photo } from "./api";
import { Avatar, Empty, colors, s } from "./ui";

function Moment({
  photo,
  label,
  onOpen,
}: {
  photo: Photo;
  label: string;
  onOpen: () => void;
}) {
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const uri = [photo.front_url, photo.rear_url].find(
    (url) => url && !unavailable.includes(url),
  );
  const when = new Date(photo.created_at * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${photo.user.username}, ${label}, ${when}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.moment, pressed && { opacity: 0.8 }]}
    >
      {uri && (
        <Image
          source={{ uri }}
          resizeMode="cover"
          style={styles.photo}
          onError={() => setUnavailable((failed) => [...failed, uri])}
        />
      )}
      <View style={styles.caption}>
        <Text style={[s.label, { color: colors.yellow }]}>{label}</Text>
        <Text style={s.small}>{when}</Text>
      </View>
    </Pressable>
  );
}

export default function NightRecap({
  detail,
  onOpenPhoto,
}: {
  detail: Detail;
  onOpenPhoto: (photo: Photo) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const people = detail.recap ?? [];
  const person =
    people.find((entry) => entry.user.id === selectedId) ?? people[0];
  if (!person) {
    return (
      <Empty
        title="No night moments"
        body="No photos were posted during this night."
        icon="images-outline"
      />
    );
  }
  const { first, last, user } = person;
  return (
    <View style={{ gap: 17 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.people}
        accessibilityLabel="Choose a player"
      >
        {people.map(({ user: entry }) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            accessibilityLabel={entry.username}
            accessibilityState={{ selected: user.id === entry.id }}
            onPress={() => setSelectedId(entry.id)}
            style={[styles.chip, user.id === entry.id && styles.selected]}
          >
            <Avatar user={entry} size={35} fallback={false} />
            <Text
              style={[
                s.small,
                user.id === entry.id && { color: colors.yellow },
              ]}
            >
              {entry.username}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={s.h3}
      >
        {user.username}’s night
      </Text>
      {first ? (
        <View style={styles.pair}>
          <Moment
            key={first.id}
            photo={first}
            label="First beer"
            onOpen={() => onOpenPhoto(first)}
          />
          {last && last.id !== first.id && (
            <Moment
              key={last.id}
              photo={last}
              label="Last beer"
              onOpen={() => onOpenPhoto(last)}
            />
          )}
        </View>
      ) : (
        <Text style={s.body}>No photos posted.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  people: { gap: 6 },
  chip: {
    minWidth: 54,
    minHeight: 53,
    padding: 7,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  selected: { backgroundColor: colors.raised, borderColor: colors.goldLine },
  pair: { flexDirection: "row", gap: 9, alignItems: "flex-start" },
  moment: {
    flex: 1,
    maxWidth: "50%",
    minWidth: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.goldLine,
    borderRadius: 15,
    backgroundColor: colors.card,
  },
  photo: { width: "100%", aspectRatio: 3 / 4 },
  caption: { padding: 9, gap: 2 },
});
