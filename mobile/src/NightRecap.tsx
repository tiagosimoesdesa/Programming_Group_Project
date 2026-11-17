import React from "react";
import { Image, Text, View } from "react-native";
import { Detail, Photo } from "./api";
import { Avatar, colors, Empty, s } from "./ui";

function Moment({ photo, label }: { photo: Photo; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <View style={{ aspectRatio: 3 / 4, borderRadius: 18, overflow: "hidden", backgroundColor: colors.bg }}>
        <Image source={{ uri: photo.rear_url }} accessibilityLabel={`${label}, ${photo.user.username}`} style={{ width: "100%", height: "100%" }} />
        <Image source={{ uri: photo.front_url }} accessibilityLabel={`Selfie, ${photo.user.username}`} style={{ position: "absolute", top: 8, left: 8, width: "32%", height: "32%", borderRadius: 10, borderWidth: 2, borderColor: colors.text }} />
      </View>
      <Text style={[s.label, { color: colors.yellow }]}>{label}</Text>
      <Text style={s.small}>{new Date(photo.created_at * 1000).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text>
    </View>
  );
}

export default function NightRecap({ detail }: { detail: Detail }) {
  const total = detail.standings.reduce((sum, person) => sum + person.count, 0);
  const photographers = detail.standings.filter(person => person.count > 0).length;
  return (
    <View style={{ gap: 24 }}>
      <View style={[s.card, s.row, { justifyContent: "space-around" }]}>
        {[{ value: total, label: "moments" }, { value: photographers, label: "contributors" }, { value: detail.competition.participants, label: "friends" }].map(item => (
          <View key={item.label} style={{ alignItems: "center", gap: 4 }}>
            <Text style={[s.h2, { color: colors.yellow }]}>{item.value}</Text>
            <Text style={s.small}>{item.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        <Text style={s.eyebrow}>FROM FIRST TO LAST</Text>
        <Text style={s.h2}>Every friend's story.</Text>
        <Text style={s.body}>The first and last moments you shared here.</Text>
      </View>
      {!total && <Empty title="A night off camera" body="No photos were posted. Your group and final standings are still saved." icon="images-outline" />}
      {(detail.recap ?? []).map(person => (
        <View key={person.user.id} style={[s.card, { gap: 16 }]}>
          <View style={s.row}>
            <Avatar user={person.user} size={36} />
            <Text style={[s.h3, { flex: 1 }]}>{person.user.username}</Text>
          </View>
          {person.first ? (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Moment photo={person.first} label={person.last ? "First moment" : "One to remember"} />
              {person.last && <Moment photo={person.last} label="Last moment" />}
            </View>
          ) : <Text style={s.small}>Here for the memories. No photos posted.</Text>}
        </View>
      ))}
    </View>
  );
}
