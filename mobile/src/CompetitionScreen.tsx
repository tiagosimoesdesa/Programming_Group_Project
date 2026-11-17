import { showAlert } from "./confirm";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { post, Profile } from "./api";
import {
  Avatar,
  Button,
  colors,
  Empty,
  Entrance,
  ErrorText,
  Icon,
  s,
} from "./ui";
import { useCompetition } from "./useCompetition";
import CameraScreen, { Capture } from "./CameraScreen";
import { imagePart, request } from "./api";

export default function CompetitionScreen({
  id,
  me,
  onBack,
  pending,
  onPending,
}: {
  id: string;
  me: Profile;
  onBack: () => void;
  pending: Capture | null;
  onPending: (v: Capture | null) => void;
}) {
  const { detail, error, connected, refresh, loadMore, loading } =
    useCompetition(id);
  const [tab, setTab] = useState<"feed" | "ranks">("feed");
  const [camera, setCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busy) {
        if (camera) setCamera(false);
        else onBack();
      }
      return true;
    });
    return () => back.remove();
  }, [camera, busy, onBack]);
  async function submit(capture: Capture) {
    setBusy(true);
    setActionError("");
    try {
      const form = new FormData();
      form.append("rear", await imagePart(capture.rear, "rear.jpg"));
      form.append("front", await imagePart(capture.front, "front.jpg"));
      await request(`/competitions/${id}/submissions`, {
        method: "POST",
        headers: { "Idempotency-Key": capture.key },
        body: form,
      });
      onPending(null);
      setCamera(false);
      await refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function finish() {
    showAlert(
      "Call it a night?",
      "This closes submissions for everyone. Your photos and final standings stay available.",
      [
        { text: "Keep it open", style: "cancel" },
        {
          text: "Finish competition",
          onPress: () => {
            setBusy(true);
            setActionError("");
            post(`/competitions/${id}/end`)
              .then(() => refresh())
              .catch((e) => setActionError(e.message))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }
  if (camera && detail)
    return (
      <CameraScreen
        name={detail.competition.name}
        pending={pending}
        onPending={(value) => {
          onPending(value);
          setActionError("");
        }}
        onSubmit={(value) => void submit(value)}
        onClose={() => setCamera(false)}
        busy={busy}
        error={actionError}
      />
    );
  if (!detail)
    return (
      <View style={[s.content, { flex: 1 }]}>
        <Button title="Back to nights" secondary onPress={onBack} />
        <ErrorText message={error} />
        {error ? (
          <Button title="Try again" onPress={() => void refresh()} />
        ) : (
          <ActivityIndicator color={colors.yellow} />
        )}
      </View>
    );
  const event = detail.competition;
  const ended = !!event.ended_at;
  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.yellow}
            onRefresh={() => {
              setRefreshing(true);
              refresh().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <View style={s.between}>
          <Pressable
            accessibilityLabel="Back to nights"
            style={s.iconButton}
            onPress={onBack}
          >
            <Icon name="arrow-back" />
          </Pressable>
          <Text style={s.eyebrow}>
            {ended ? "ONE FOR THE MEMORIES" : "THE NIGHT IS YOURS"}
          </Text>
          <Pressable
            accessibilityLabel="Share invitation code"
            style={s.iconButton}
            onPress={() => {
              Share.share({
                message: `Join “${event.name}” on BEERREAL. Invitation code: ${event.code}`,
              }).catch((e) => setActionError(e.message));
            }}
          >
            <Icon name="share-outline" />
          </Pressable>
        </View>
        <View style={{ gap: 10 }}>
          <View style={s.row}>
            <View style={s.pill}>
              <Text style={s.pillText}>
                {ended
                  ? "FINISHED"
                  : connected
                    ? "● LIVE NOW"
                    : "↻ RECONNECTING"}
              </Text>
            </View>
            <Text style={s.small}>{event.participants} friends</Text>
          </View>
          <Text style={s.h1}>{event.name}</Text>
          <Text style={s.body}>
            {ended
              ? "The night ends. The stories don’t."
              : `Invite your people · ${event.code}`}
          </Text>
        </View>
        <ErrorText message={actionError || error} />
        {ended ? (
          <Entrance trigger="podium">
            <LinearGradient
              colors={["#3D3D23", "#22251B"]}
              style={[s.card, { borderColor: "#62603B" }]}
            >
              <View style={s.between}>
                <Text style={s.eyebrow}>THE FINAL LINEUP</Text>
                <Icon name="trophy-outline" color={colors.yellow} />
              </View>
              {[1, 2, 3].map((rank) => {
                const group = detail.standings.filter((p) => p.rank === rank);
                return group.length ? (
                  <View
                    key={rank}
                    style={[s.row, { alignItems: "flex-start" }]}
                  >
                    <Text
                      style={{
                        width: 40,
                        color: rank === 1 ? colors.yellow : colors.muted,
                        fontSize: 32,
                        fontWeight: "900",
                      }}
                    >
                      {String(rank).padStart(2, "0")}
                    </Text>
                    <View style={{ flex: 1, gap: 10 }}>
                      {group.map((p) => (
                        <View key={p.id} style={s.row}>
                          <Avatar user={p} size={34} />
                          <Text style={[s.h3, { flex: 1 }]}>{p.username}</Text>
                          <Text style={s.label}>{p.points} pts</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null;
              })}
            </LinearGradient>
          </Entrance>
        ) : (
          <View
            style={[
              s.card,
              {
                flexDirection: "row",
                alignItems: "center",
                borderColor: "#514C2B",
              },
            ]}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.h3}>Be here. Be real.</Text>
              <Text style={s.small}>A drink. A selfie. A shared memory.</Text>
            </View>
            <Icon name="camera-outline" size={34} color={colors.yellow} />
          </View>
        )}
        <View style={s.tabs}>
          {(["feed", "ranks"] as const).map((t) => (
            <Pressable
              key={t}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t }}
              onPress={() => setTab(t)}
              style={[s.tab, tab === t && s.activeTab]}
            >
              <Text
                style={[
                  s.label,
                  { color: tab === t ? colors.yellow : colors.muted },
                ]}
              >
                {t === "feed" ? "The moments" : "Leaderboard"}
              </Text>
            </Pressable>
          ))}
        </View>
        {tab === "ranks" ? (
          <View style={{ gap: 10 }}>
            {detail.standings.map((person) => (
              <Entrance key={person.id} trigger={person.rank}>
                <View
                  style={[
                    s.card,
                    s.row,
                    person.id === me.id && { borderColor: "#716132" },
                  ]}
                >
                  <Text
                    style={{
                      color: person.rank === 1 ? colors.yellow : colors.muted,
                      fontWeight: "800",
                      fontSize: 20,
                      width: 26,
                    }}
                  >
                    {person.rank}
                  </Text>
                  <Avatar user={person} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>
                      {person.username}
                      {person.id === me.id ? " (you)" : ""}
                    </Text>
                    <Text style={s.small}>
                      {person.count} {person.count === 1 ? "beer" : "beers"}
                    </Text>
                  </View>
                  <Text style={[s.h3, { color: colors.yellow }]}>
                    {person.points}
                    <Text style={s.small}> pts</Text>
                  </Text>
                </View>
              </Entrance>
            ))}
          </View>
        ) : detail.feed.length ? (
          <View style={{ gap: 22 }}>
            {detail.feed.map((photo) => (
              <View
                key={photo.id}
                style={[s.card, { padding: 0, overflow: "hidden" }]}
              >
                <View style={[s.row, { padding: 16 }]}>
                  <Avatar user={photo.user} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>{photo.user.username}</Text>
                    <Text style={s.small}>
                      {new Date(photo.created_at * 1000).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                  <Icon
                    name="checkmark-circle"
                    color={colors.green}
                    size={20}
                  />
                </View>
                <View style={{ aspectRatio: 3 / 4, marginTop: -16 }}>
                  <Image
                    accessibilityLabel={`Drink photo from ${photo.user.username}`}
                    source={{ uri: photo.rear_url }}
                    style={{ width: "100%", height: "100%" }}
                  />
                  <Image
                    accessibilityLabel={`Selfie from ${photo.user.username}`}
                    source={{ uri: photo.front_url }}
                    style={{
                      position: "absolute",
                      top: 14,
                      left: 14,
                      width: "29%",
                      height: "32%",
                      borderRadius: 15,
                      borderWidth: 2,
                      borderColor: colors.text,
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      bottom: 14,
                      right: 14,
                      backgroundColor: colors.yellow,
                      paddingHorizontal: 13,
                      paddingVertical: 8,
                      borderRadius: 12,
                    }}
                  >
                    <Text style={{ color: colors.bg, fontWeight: "800" }}>
                      +1 MOMENT
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            {detail.next_cursor && (
              <Button
                title="Earlier moments"
                secondary
                loading={loading}
                onPress={() => void loadMore()}
              />
            )}
          </View>
        ) : (
          <Empty
            title="Your story starts here"
            body={
              ended
                ? "No photos were posted during this night."
                : "The feed is ready for your first moment. Capture a drink and a selfie to check in."
            }
            icon="images-outline"
          />
        )}
        <Text style={[s.small, { textAlign: "center" }]}>
          Keep it social. Drink water, know your limits, and look after your
          friends.
        </Text>
        {!ended && event.host_id === me.id && (
          <Button
            title="Finish competition"
            secondary
            loading={busy}
            onPress={finish}
          />
        )}
      </ScrollView>
      {!ended && (
        <View
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          <Button
            title={pending ? "Finish your saved capture" : "Capture a moment"}
            icon="camera"
            onPress={() => {
              setActionError("");
              setCamera(true);
            }}
          />
        </View>
      )}
    </View>
  );
}
