import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Detail, Profile } from "./api";
import { post, request } from "./api";
import { showAlert } from "./confirm";
import { Avatar, Button, colors, formatJols, Icon, s } from "./ui";

function timeLeft(seconds: number) {
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours && minutes) return `${hours}h ${minutes}m left`;
  if (hours) return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  if (minutes && secs) return `${minutes}m ${secs}s left`;
  if (minutes) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} left`;
  return `${secs} ${secs === 1 ? "second" : "seconds"} left`;
}

export default function BattlePanel({
  detail,
  me,
  refresh,
  remaining,
  warning,
  onLeft,
  onError,
}: {
  detail: Detail;
  me: Profile;
  refresh: () => Promise<void>;
  remaining: number;
  warning: boolean;
  onLeft: () => void;
  onError: (message: string) => void;
}) {
  const battle = detail.battle!;
  const event = detail.competition;
  const [busy, setBusy] = useState(false);
  const winner = useMemo(
    () => battle.teams.find((team) => team.key === battle.winner),
    [battle],
  );

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    onError("");
    try {
      await action();
      await refresh();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    const host = event.host_id === me.id;
    showAlert(
      host ? "Cancel this battle?" : "Leave this battle?",
      host
        ? "The lobby will close for everyone."
        : "You can re-enter with the code while the battle is still in the lobby.",
      [
        { text: "Stay", style: "cancel" },
        {
          text: host ? "Cancel battle" : "Leave battle",
          onPress: () => {
            setBusy(true);
            post(`/competitions/${event.id}/battle/leave`)
              .then(onLeft)
              .catch((error) => onError(error.message))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }

  return (
    <View style={{ gap: 18 }}>
      {battle.status === "waiting" && (
        <View style={[s.card, { borderColor: "#655B2F" }]}>
          <View style={s.between}>
            <Text style={s.eyebrow}>BATTLE LOBBY</Text>
            <Icon name="people-outline" color={colors.yellow} />
          </View>
          <Text style={s.h2}>Choose your side.</Text>
          <Text style={s.body}>
            Players may switch teams or leave until the host starts the battle.
            After that, teams are locked. Duration:{" "}
            {timeLeft(battle.duration_seconds).replace(" left", "")}.
          </Text>
          <View style={s.pill}>
            <Text style={s.pillText}>
              {battle.points_visible
                ? "JOLS SHOWN LIVE"
                : "JOLS HIDDEN UNTIL THE END"}
            </Text>
          </View>
        </View>
      )}
      {battle.status === "active" && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            s.card,
            {
              alignItems: "center",
              borderColor: warning ? colors.red : colors.yellow,
            },
          ]}
        >
          <Text style={[s.eyebrow, warning && { color: colors.red }]}>
            {warning ? "FINAL STRETCH" : "BATTLE IN PROGRESS"}
          </Text>
          <Text style={[s.h1, { color: warning ? colors.red : colors.yellow }]}>
            {timeLeft(remaining)}
          </Text>
          {warning && (
            <Text style={s.body}>Only 10% of the battle remains.</Text>
          )}
        </View>
      )}
      {(battle.status === "complete" || battle.status === "cancelled") && (
        <View
          style={[s.card, { alignItems: "center", borderColor: colors.yellow }]}
        >
          <Icon
            name={
              battle.status === "complete" ? "trophy" : "close-circle-outline"
            }
            color={colors.yellow}
            size={42}
          />
          <Text style={s.eyebrow}>BATTLE COMPLETE</Text>
          <Text style={[s.h2, { textAlign: "center" }]}>
            {battle.status === "cancelled"
              ? "The host cancelled the battle."
              : battle.winner === "tie"
                ? "It’s a tie!"
                : `${winner?.name} win!`}
          </Text>
          {battle.status === "complete" && (
            <Text style={s.body}>All scores and photos are now visible.</Text>
          )}
        </View>
      )}

      {battle.teams.map((team) => {
        const selected = battle.my_team === team.key;
        return (
          <View
            key={team.key}
            style={[s.card, selected && { borderColor: colors.yellow }]}
          >
            <View style={s.between}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.h2}>{team.name}</Text>
                <Text style={s.small}>
                  {team.members.length}{" "}
                  {team.members.length === 1 ? "player" : "players"}
                  {selected ? " · your team" : ""}
                </Text>
              </View>
              <Text style={[s.h2, { color: colors.yellow }]}>
                {team.score === null ? "Hidden" : formatJols(team.score)}
              </Text>
            </View>
            {team.members.length ? (
              team.members.map((member) => (
                <View key={member.id} style={s.row}>
                  {member.rank !== null && (
                    <Text
                      style={{
                        color: member.rank === 1 ? colors.yellow : colors.muted,
                        width: 20,
                        fontWeight: "800",
                      }}
                    >
                      {member.rank}
                    </Text>
                  )}
                  <Avatar user={member} size={36} />
                  <Text style={[s.label, { flex: 1 }]}>
                    {member.username}
                    {member.id === me.id ? " (you)" : ""}
                  </Text>
                  <Text style={s.label}>
                    {member.points == null
                      ? "—"
                      : `${formatJols(member.points)} · ${member.count} ${member.count === 1 ? "beer" : "beers"}`}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={s.body}>No players yet.</Text>
            )}
            {battle.can_change_team && (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: busy }}
                disabled={busy || selected}
                onPress={() =>
                  void act(() =>
                    request(`/competitions/${event.id}/battle/team`, {
                      method: "PUT",
                      body: JSON.stringify({ team: team.key }),
                    }),
                  )
                }
                style={[
                  s.button,
                  selected && s.secondary,
                  (busy || selected) && { opacity: 0.65 },
                ]}
              >
                <Text
                  style={[s.buttonText, selected && { color: colors.text }]}
                >
                  {selected ? "Your team" : `Join ${team.name}`}
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}

      {battle.status === "waiting" && event.host_id === me.id && (
        <View style={{ gap: 8 }}>
          {!battle.can_start && (
            <Text style={[s.small, { textAlign: "center" }]}>
              Every player must choose a team, and both teams need at least one
              player.
            </Text>
          )}
          <Button
            title="Start Battle"
            icon="flash-outline"
            loading={busy}
            disabled={!battle.can_start}
            onPress={() =>
              void act(() => post(`/competitions/${event.id}/battle/start`))
            }
          />
        </View>
      )}
      {battle.can_leave && (
        <Button
          title={event.host_id === me.id ? "Cancel Battle" : "Leave Battle"}
          secondary
          loading={busy}
          onPress={leave}
        />
      )}
    </View>
  );
}
