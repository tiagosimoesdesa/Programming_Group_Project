import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Share,
  Text,
  View,
} from "react-native";
import { Detail, Photo, request } from "./api";
import type { components } from "./generated/api";
import { Button, colors, ErrorText, s } from "./ui";

type Social = components["schemas"]["SocialOut"];
export default function SocialPanel({
  detail,
  me,
}: {
  detail: Detail;
  me: string;
}) {
  const event = detail.competition;
  const base = `/competitions/${event.id}`;
  const [data, setData] = useState<Social | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const ended = !!event.ended_at;
  const player = event.my_role !== "spectator";
  async function refresh() {
    setError("");
    try {
      setData(await request<Social>(`${base}/social`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    request<Social>(`${base}/social`)
      .then((value) => {
        if (active) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base, detail]);
  useEffect(() => {
    let active = true;
    if (player && !ended)
      request<Detail>(`${base}?player=${me}`)
        .then((value) => {
          if (active) {
            setPhotos(value.feed);
            setCursor(value.next_cursor);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [base, me, player, ended, event.revision]);
  async function action(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      setData(
        await request<Social>(`${base}${path}`, {
          method,
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: 18 }}>
      <ErrorText message={error} />
      {error && (
        <Button title="Retry" secondary onPress={() => void refresh()} />
      )}
      {!data ? (
        <ActivityIndicator color={colors.yellow} />
      ) : (
        <>
          <View style={s.card}>
            <Text style={s.eyebrow}>YOUR PRIVATE GROUP</Text>
            <Text style={s.h3}>
              {data.spectators} watching · {event.participants} playing
            </Text>
            <Text style={s.small}>
              {player
                ? "Invite another group's friends to watch with a spectator code. Your night stays private."
                : "You're watching this night. You can view photos and react, but cannot post, vote, or score."}
            </Text>
            {event.host_id === me && !ended && (
              <>
                {data.spectator_code ? (
                  <>
                    <Text selectable style={[s.h2, { color: colors.yellow }]}>
                      {data.spectator_code}
                    </Text>
                    <Button
                      title="Share spectator invitation"
                      secondary
                      onPress={() => {
                        Share.share({
                          message: `Watch “${event.name}” on BEERREAL. Enter spectator code ${data.spectator_code}. This gives access to this night's photos and results.`,
                        }).catch((e) => setError(e.message));
                      }}
                    />
                  </>
                ) : (
                  <Button
                    title="Create spectator invitation"
                    secondary
                    loading={busy}
                    onPress={() => void action("/spectator-invite")}
                  />
                )}
                <Text style={s.small}>
                  Anyone you give this code can watch until the night ends, and
                  revisit its history afterward.
                </Text>
              </>
            )}
          </View>
          <Text style={s.h2}>Side quests.</Text>
          <Text style={s.body}>
            Optional photo challenges. One approved challenge = one challenge
            point, separate from drink counts.
          </Text>
          {!data.enabled ? (
            <>
              <Text style={s.small}>Challenges are off for this night.</Text>
              {event.host_id === me && !ended && (
                <Button
                  title="Enable challenges"
                  loading={busy}
                  onPress={() => void action("/social/enable")}
                />
              )}
            </>
          ) : (
            <>
              <Text style={s.small}>
                A majority of the other players present when you submit must
                approve. No self-votes. Votes can change until the host finishes
                the night; unapproved claims receive no points.
              </Text>
              <View style={s.card}>
                <Text style={s.eyebrow}>CHALLENGE POINTS</Text>
                {[...detail.standings]
                  .sort(
                    (a, b) =>
                      (data.scores[b.id] ?? 0) - (data.scores[a.id] ?? 0),
                  )
                  .map((person) => (
                    <View key={person.id} style={s.between}>
                      <Text style={s.label}>{person.username}</Text>
                      <Text style={[s.h3, { color: colors.yellow }]}>
                        {data.scores[person.id] ?? 0}
                      </Text>
                    </View>
                  ))}
              </View>
              {player && !ended && (
                <View style={s.card}>
                  <Text style={s.h3}>Choose your photo</Text>
                  <Text style={s.small}>
                    Use a moment you've already posted, then choose a challenge
                    below.
                  </Text>
                  {!photos.length && (
                    <Text style={s.small}>
                      Post your first photo pair to get started.
                    </Text>
                  )}
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {photos.map((photo) => (
                      <Pressable
                        key={photo.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Select photo from ${new Date(photo.created_at * 1000).toLocaleTimeString()}`}
                        accessibilityState={{ selected: selected === photo.id }}
                        onPress={() => setSelected(photo.id)}
                        style={{
                          borderWidth: 3,
                          borderColor:
                            selected === photo.id ? colors.yellow : colors.line,
                          borderRadius: 12,
                          overflow: "hidden",
                        }}
                      >
                        <Image
                          source={{ uri: photo.rear_url }}
                          style={{ width: 76, height: 96 }}
                        />
                      </Pressable>
                    ))}
                  </View>
                  {cursor && (
                    <Button
                      title="Earlier photos"
                      secondary
                      loading={busy}
                      onPress={async () => {
                        setBusy(true);
                        try {
                          const page = await request<Detail>(
                            `${base}?player=${me}&before=${cursor}`,
                          );
                          setPhotos((old) => [
                            ...old,
                            ...page.feed.filter(
                              (p) => !old.some((o) => o.id === p.id),
                            ),
                          ]);
                          setCursor(page.next_cursor);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  )}
                  {Object.entries(data.prompts).map(([key, title]) => {
                    const claimed = data.claims.some(
                      (c) => c.prompt === key && c.photo.user.id === me,
                    );
                    return (
                      <Button
                        key={key}
                        title={claimed ? `${title} · Submitted` : title}
                        secondary
                        disabled={!selected || claimed || busy}
                        onPress={() =>
                          void action("/claims", {
                            prompt: key,
                            submission_id: selected,
                          })
                        }
                      />
                    );
                  })}
                </View>
              )}
              {!data.claims.length && (
                <Text style={s.small}>No challenges submitted yet.</Text>
              )}
              {data.claims.map((claim) => (
                <View key={claim.id} style={s.card}>
                  <Text style={s.h3}>{claim.photo.user.username}</Text>
                  <Text style={s.body}>{data.prompts[claim.prompt]}</Text>
                  <View style={{ height: 260 }}>
                    <Image
                      source={{ uri: claim.photo.rear_url }}
                      resizeMode="contain"
                      style={{ width: "100%", height: "100%" }}
                    />
                    <Image
                      source={{ uri: claim.photo.front_url }}
                      style={{
                        position: "absolute",
                        top: 8,
                        left: 8,
                        width: 70,
                        height: 90,
                        borderRadius: 12,
                      }}
                    />
                  </View>
                  <Text
                    style={[
                      s.label,
                      {
                        color:
                          claim.status === "approved"
                            ? colors.yellow
                            : colors.muted,
                      },
                    ]}
                  >
                    {claim.status === "approved"
                      ? "Approved · 1 point"
                      : claim.status === "pending"
                        ? "Awaiting approval"
                        : "Not approved"}{" "}
                    · {claim.approvals}/{claim.required} approvals
                  </Text>
                  {claim.can_vote && (
                    <>
                      <Button
                        title={
                          claim.my_vote === true ? "✓ You approved" : "Approve"
                        }
                        secondary
                        disabled={busy}
                        onPress={() =>
                          void action(
                            `/claims/${claim.id}/vote`,
                            { approve: true },
                            "PUT",
                          )
                        }
                      />
                      <Button
                        title={
                          claim.my_vote === false
                            ? "✓ You voted no"
                            : "Doesn't match"
                        }
                        secondary
                        disabled={busy}
                        onPress={() =>
                          void action(
                            `/claims/${claim.id}/vote`,
                            { approve: false },
                            "PUT",
                          )
                        }
                      />
                    </>
                  )}
                </View>
              ))}
            </>
          )}
        </>
      )}
    </View>
  );
}
