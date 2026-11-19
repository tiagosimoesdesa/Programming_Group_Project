import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { Detail, Party, request } from "./api";
import { Button, colors, ErrorText, s } from "./ui";

export default function PartyPanel({
  detail,
  me,
  onCapture,
}: {
  detail: Detail;
  me: string;
  onCapture: (roundId: string, prompt: string) => void;
}) {
  const event = detail.competition;
  const base = `/competitions/${event.id}/party`;
  const [data, setData] = useState<Party | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  async function refresh() {
    try {
      const value = await request<Party>(base);
      setData(value);
      setOffset(value.server_time * 1000 - Date.now());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, [base, detail]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function action(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const value = await request<Party>(`${base}${path}`, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      setData(value);
      setOffset(value.server_time * 1000 - Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const seconds = data?.active_round
    ? Math.max(
        0,
        data.active_round.ends_at - Math.floor((clock + offset) / 1000),
      )
    : 0;
  const countdown = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const myAttempt = useMemo(
    () =>
      data?.attempts.find(
        (attempt) =>
          attempt.round_id === data.active_round?.id &&
          attempt.photo.user.id === me,
      ),
    [data, me],
  );
  if (!data)
    return (
      <View style={{ gap: 16 }}>
        <ErrorText message={error} />
        {error ? (
          <Button title="Retry" secondary onPress={() => void refresh()} />
        ) : (
          <ActivityIndicator color={colors.yellow} />
        )}
      </View>
    );
  return (
    <View style={{ gap: 18 }}>
      <ErrorText message={error} />
      {data.status === "waiting" ? (
        <View style={s.card}>
          <Text style={s.eyebrow}>PARTY MODE</Text>
          <Text style={s.h2}>Ready when your people are.</Text>
          <Text style={s.body}>
            The host starts eight hours of photo challenges. A new challenge
            appears every 30 minutes.
          </Text>
          {event.host_id === me ? (
            <Button
              title={
                data.can_start
                  ? "Start Party Mode"
                  : "Waiting for another player"
              }
              loading={busy}
              disabled={!data.can_start}
              onPress={() => void action("/start")}
            />
          ) : (
            <Text style={s.small}>Waiting for the host to start.</Text>
          )}
        </View>
      ) : data.active_round ? (
        <View style={[s.card, { borderColor: colors.yellow }]}>
          <View style={s.between}>
            <Text style={s.eyebrow}>
              CHALLENGE {data.active_round.sequence + 1} / 16
            </Text>
            <Text style={[s.h3, { color: colors.yellow }]}>{countdown}</Text>
          </View>
          <Text style={s.h2}>{data.active_round.prompt}</Text>
          <Text style={s.small}>
            Everyone in the photo must agree. Complete it safely; no challenge
            requires extra drinking.
          </Text>
          {event.my_role === "spectator" ? (
            <Text style={s.small}>Spectators can watch and react.</Text>
          ) : myAttempt ? (
            <Text style={[s.label, { color: colors.yellow }]}>
              Attempt submitted
            </Text>
          ) : (
            <Button
              title="Capture challenge"
              icon="camera"
              onPress={() =>
                onCapture(data.active_round!.id, data.active_round!.prompt)
              }
            />
          )}
        </View>
      ) : data.status === "ended" ? (
        <View style={s.card}>
          <Text style={s.eyebrow}>PARTY FINISHED</Text>
          <Text style={s.h2}>The results are locked in.</Text>
          <Text style={s.body}>
            Approved challenges remain in the night’s story.
          </Text>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.eyebrow}>PARTY COMPLETE</Text>
          <Text style={s.h2}>All 16 challenges revealed.</Text>
          <Text style={s.body}>
            Normal photos remain open until the host finishes the night.
          </Text>
        </View>
      )}
      <Text style={s.h2}>Challenge attempts.</Text>
      {!data.attempts.length && (
        <Text style={s.small}>No challenge attempts yet.</Text>
      )}
      {data.attempts.map((attempt) => (
        <View key={attempt.id} style={s.card}>
          <Text style={s.eyebrow}>{attempt.prompt}</Text>
          <Text style={s.h3}>{attempt.photo.user.username}</Text>
          <View style={{ height: 280 }}>
            <Image
              source={{ uri: attempt.photo.rear_url }}
              resizeMode="cover"
              style={{ width: "100%", height: "100%", borderRadius: 16 }}
            />
            <Image
              source={{ uri: attempt.photo.front_url }}
              style={{
                position: "absolute",
                top: 10,
                left: 10,
                width: 76,
                height: 96,
                borderRadius: 12,
                borderWidth: 2,
                borderColor: colors.text,
              }}
            />
          </View>
          <Text
            style={[
              s.label,
              {
                color:
                  attempt.status === "approved" ? colors.yellow : colors.muted,
              },
            ]}
          >
            {attempt.status === "approved"
              ? "Approved · +2 Jols"
              : attempt.status === "pending"
                ? "Awaiting approval"
                : "Not approved"}{" "}
            · {attempt.approvals}/{attempt.required}
          </Text>
          {attempt.can_vote && (
            <View style={{ gap: 8 }}>
              <Button
                title={attempt.my_vote === true ? "✓ You approved" : "Approve"}
                secondary
                disabled={busy}
                onPress={() =>
                  void action(
                    `/attempts/${attempt.id}/vote`,
                    { approve: true },
                    "PUT",
                  )
                }
              />
              <Button
                title={
                  attempt.my_vote === false ? "✓ You voted no" : "Doesn’t match"
                }
                secondary
                disabled={busy}
                onPress={() =>
                  void action(
                    `/attempts/${attempt.id}/vote`,
                    { approve: false },
                    "PUT",
                  )
                }
              />
            </View>
          )}
        </View>
      ))}
    </View>
  );
}
