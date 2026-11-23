import { showAlert } from "./confirm";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { APP_NAME } from "./Brand";
import { post, Profile, Photo } from "./api";
import {
  Avatar,
  Button,
  colors,
  Empty,
  Entrance,
  ErrorText,
  formatJols,
  Icon,
  Input,
  s,
} from "./ui";
import { useCompetition } from "./useCompetition";
import CameraScreen, { Capture } from "./CameraScreen";
import { imagePart, request } from "./api";
import NightRecap from "./NightRecap";
import NightPodium from "./NightPodium";
import NightBackdrop from "./NightBackdrop";
import SocialPanel from "./SocialPanel";
import PartyPanel from "./PartyPanel";
import BattlePanel from "./BattlePanel";
import { shareInvitation } from "./shareInvitation";

type LiveTab = "feed" | "ranks" | "social" | "party" | "battle";
type CompetitionTab = LiveTab | "podium";
const tabLabels = {
  podium: "Podium",
  feed: "Photos",
  ranks: "Ranks",
  social: "Group",
  party: "Party",
  battle: "Battle",
};
const reactions = [
  { emoji: "❤️", label: "Like", icon: "heart-outline" },
  { emoji: "😂", label: "Laugh", icon: "happy-outline" },
  { emoji: "🔥", label: "Fire", icon: "flame-outline" },
] as const;

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
  const [player, setPlayer] = useState<string | undefined>();
  const [expanded, setExpanded] = useState<Photo | null>(null);
  const {
    detail,
    error,
    connected,
    refresh,
    loadMore,
    loading,
    react,
    reactionFeedback,
  } = useCompetition(id, player);
  const [liveTab, setLiveTab] = useState<LiveTab | null>(null);
  const [closedTab, setClosedTab] = useState<CompetitionTab | "moments" | null>(
    null,
  );
  const [camera, setCamera] = useState(false);
  const [partyCapture, setPartyCapture] = useState<{
    roundId: string;
    prompt: string;
  } | null>(null);
  const [partyPending, setPartyPending] = useState<{
    roundId: string;
    photo: Capture;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [invitationCopied, setInvitationCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [battleClock, setBattleClock] = useState<number | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nightName, setNightName] = useState("");
  const [nameError, setNameError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const ended = !!detail?.competition.ended_at;
  const isBattle = detail?.competition.mode === "battle" && !!detail.battle;
  const resultsTab = isBattle ? "battle" : "podium";
  const tab = ended
    ? (closedTab ?? resultsTab)
    : (liveTab ?? (isBattle ? "battle" : "feed"));
  const showingMoments = tab === "moments";
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [tab]);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!busy) {
        if (partyCapture) setPartyCapture(null);
        else if (camera) setCamera(false);
        else if (showingMoments) setClosedTab(resultsTab);
        else onBack();
      }
      return true;
    });
    return () => back.remove();
  }, [camera, partyCapture, busy, showingMoments, resultsTab, onBack]);
  useEffect(() => {
    const battle = detail?.battle;
    if (battle?.status !== "active" || !battle.ends_at) return;
    const endsAt = battle.ends_at;
    const offset = battle.server_time - Math.floor(Date.now() / 1000);
    let refreshed = false;
    const tick = () => {
      const current = Math.floor(Date.now() / 1000) + offset;
      setBattleClock(current);
      if (current >= endsAt && !refreshed) {
        refreshed = true;
        void refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [
    detail?.battle?.status,
    detail?.battle?.server_time,
    detail?.battle?.ends_at,
    refresh,
  ]);
  async function submit(capture: Capture) {
    setBusy(true);
    setActionError("");
    try {
      const form = new FormData();
      form.append("rear", await imagePart(capture.rear, "rear.jpg"));
      form.append("front", await imagePart(capture.front, "front.jpg"));
      form.append("beer_count", String(capture.beerCount));
      form.append("pint_count", String(capture.pintCount));
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
  async function submitParty(capture: Capture) {
    if (!partyCapture) return;
    setBusy(true);
    setActionError("");
    try {
      const form = new FormData();
      form.append("rear", await imagePart(capture.rear, "rear.jpg"));
      form.append("front", await imagePart(capture.front, "front.jpg"));
      await request(
        `/competitions/${id}/party/rounds/${partyCapture.roundId}/attempts`,
        {
          method: "POST",
          headers: { "Idempotency-Key": capture.key },
          body: form,
        },
      );
      setPartyPending(null);
      setPartyCapture(null);
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
      "This closes photo submissions and challenge voting. Unapproved challenges receive no Jols. Photos and final standings stay available.",
      [
        { text: "Keep it open", style: "cancel" },
        {
          text: "Close the night",
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
  async function renameNight() {
    const name = nightName.trim();
    if (!name) {
      setNameError("Give your night a name.");
      return;
    }
    setRenaming(true);
    setNameError("");
    try {
      await request(`/competitions/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name }),
      });
      await refresh();
      setEditingName(false);
    } catch (e) {
      setNameError((e as Error).message);
    } finally {
      setRenaming(false);
    }
  }
  if (partyCapture && detail)
    return (
      <CameraScreen
        name={partyCapture.prompt}
        pending={partyPending?.photo ?? null}
        onPending={(value) => {
          setPartyPending(
            value ? { roundId: partyCapture.roundId, photo: value } : null,
          );
          setActionError("");
        }}
        onSubmit={(value) => void submitParty(value)}
        onClose={() => setPartyCapture(null)}
        busy={busy}
        error={actionError}
        countBeers={false}
      />
    );
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
      <View style={[s.root, s.content]}>
        <NightBackdrop />
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
  const tabs: CompetitionTab[] = isBattle
    ? detail.battle?.status === "waiting"
      ? ["battle"]
      : ["battle", "feed", "ranks"]
    : ended
      ? ["podium", "feed", "ranks"]
      : ["feed", "ranks"];
  if (!isBattle) {
    if (event.mode === "party") tabs.push("party");
    tabs.push("social");
  }
  const canCapture =
    !ended &&
    event.my_role !== "spectator" &&
    (!isBattle || detail.battle?.status === "active");
  const canShare =
    !ended &&
    event.my_role !== "spectator" &&
    (!isBattle || !event.battle_started_at);
  const battleNow = battleClock ?? detail.battle?.server_time ?? 0;
  const battleRemaining = Math.max(
    0,
    (detail.battle?.ends_at ?? battleNow) - battleNow,
  );
  const battleWarning =
    detail.battle?.status === "active" &&
    detail.battle.warning_at !== null &&
    battleNow >= detail.battle.warning_at;
  return (
    <View style={s.root}>
      <NightBackdrop bubbles={tab === "podium"} />
      <ScrollView
        ref={scroll}
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
            accessibilityRole="button"
            accessibilityLabel={
              showingMoments
                ? isBattle
                  ? "Back to Battle"
                  : "Back to podium"
                : "Back to nights"
            }
            style={[
              s.iconButton,
              showingMoments && {
                flexDirection: "row",
                gap: 6,
                paddingHorizontal: 12,
              },
            ]}
            onPress={showingMoments ? () => setClosedTab(resultsTab) : onBack}
          >
            <Icon name="arrow-back" />
            {showingMoments && (
              <Text style={s.label}>{isBattle ? "Battle" : "Podium"}</Text>
            )}
          </Pressable>
          {canShare && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share invitation code"
              style={s.iconButton}
              onPress={() => {
                setActionError("");
                setInvitationCopied(false);
                shareInvitation(
                  `Join “${event.name}” on ${APP_NAME}. Invitation code: ${event.code}`,
                )
                  .then(setInvitationCopied)
                  .catch((e) => setActionError(e.message));
              }}
            >
              <Icon name="share-outline" />
            </Pressable>
          )}
        </View>
        {showingMoments ? (
          <View style={{ alignItems: "center", gap: 5 }}>
            <Text style={s.body}>{event.name}</Text>
            <Text
              accessibilityRole="header"
              style={[s.h1, { color: colors.yellow, textAlign: "center" }]}
            >
              Night moments
            </Text>
          </View>
        ) : (
          <>
            {tab !== "podium" && (
              <View style={{ gap: 8 }}>
                <View style={s.row}>
                  <View style={s.pill}>
                    <Text style={s.pillText}>
                      {ended
                        ? "Finished"
                        : connected
                          ? "● Live"
                          : "Reconnecting"}
                    </Text>
                  </View>
                  <Text style={s.small}>
                    {event.participants}{" "}
                    {event.participants === 1 ? "friend" : "friends"}
                  </Text>
                  <Text style={s.small}>
                    {event.mode === "party"
                      ? "Party"
                      : isBattle
                        ? "Battle"
                        : "Classic"}
                  </Text>
                </View>
                <View style={[s.row, { alignItems: "flex-start" }]}>
                  <Text accessibilityRole="header" style={[s.h1, { flex: 1 }]}>
                    {event.name}
                  </Text>
                  {event.host_id === me.id && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Change night name"
                      style={s.iconButton}
                      onPress={() => {
                        setNightName(event.name);
                        setNameError("");
                        setEditingName(true);
                      }}
                    >
                      <Icon name="pencil-outline" />
                    </Pressable>
                  )}
                </View>
                {canShare && (
                  <Text selectable style={s.body}>
                    Invite code · {event.code}
                  </Text>
                )}
                {canShare && invitationCopied && (
                  <Text accessibilityLiveRegion="polite" style={s.small}>
                    Invitation copied.
                  </Text>
                )}
                {!ended && event.my_role === "spectator" && (
                  <Text style={s.body}>Watching with friends</Text>
                )}
              </View>
            )}
            <View accessibilityRole="tablist" style={s.tabs}>
              {tabs.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === option }}
                  onPress={() => {
                    if (ended || option === "podium") setClosedTab(option);
                    else setLiveTab(option);
                  }}
                  style={[s.tab, tab === option && s.activeTab]}
                >
                  <Text
                    style={[
                      s.label,
                      { color: tab === option ? colors.yellow : colors.muted },
                    ]}
                  >
                    {tabLabels[option]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <ErrorText message={actionError || error} />
        {battleWarning && tab !== "battle" && (
          <View style={s.error} accessibilityLiveRegion="polite">
            <Icon name="warning-outline" color={colors.red} />
            <Text style={{ color: colors.red, flex: 1, fontWeight: "800" }}>
              {battleRemaining >= 3600
                ? `${Math.ceil(battleRemaining / 3600)} hour${Math.ceil(battleRemaining / 3600) === 1 ? "" : "s"} left`
                : battleRemaining >= 60
                  ? `${Math.ceil(battleRemaining / 60)} minute${Math.ceil(battleRemaining / 60) === 1 ? "" : "s"} left`
                  : `${battleRemaining} second${battleRemaining === 1 ? "" : "s"} left`}
            </Text>
          </View>
        )}
        {tab === "feed" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {[{ id: undefined, username: "Everyone" }, ...detail.standings].map(
              (person) => (
                <Pressable
                  key={person.id ?? "all"}
                  accessibilityRole="button"
                  accessibilityState={{ selected: player === person.id }}
                  onPress={() => setPlayer(person.id)}
                  style={[
                    s.pill,
                    {
                      padding: 12,
                      borderWidth: 1,
                      borderColor:
                        player === person.id ? colors.yellow : colors.line,
                    },
                  ]}
                >
                  <Text style={s.label}>{person.username}</Text>
                </Pressable>
              ),
            )}
          </ScrollView>
        )}
        {tab === "battle" && detail.battle ? (
          <View style={{ gap: 16 }}>
            <BattlePanel
              detail={detail}
              me={me}
              refresh={refresh}
              remaining={battleRemaining}
              warning={battleWarning}
              onLeft={onBack}
              onError={setActionError}
            />
            {ended && (
              <Button
                title="Night moments"
                icon="images-outline"
                onPress={() => setClosedTab("moments")}
              />
            )}
          </View>
        ) : tab === "podium" ? (
          <NightPodium
            name={event.name}
            standings={detail.standings}
            onMoments={() => setClosedTab("moments")}
            onRanks={() => setClosedTab("ranks")}
          />
        ) : tab === "social" ? (
          <SocialPanel detail={detail} me={me.id} />
        ) : tab === "party" ? (
          <PartyPanel
            detail={detail}
            me={me.id}
            onCapture={(roundId, prompt) => {
              setActionError("");
              setPartyPending((saved) =>
                saved?.roundId === roundId ? saved : null,
              );
              setPartyCapture({ roundId, prompt });
            }}
          />
        ) : showingMoments ? (
          <NightRecap detail={detail} onOpenPhoto={setExpanded} />
        ) : tab === "ranks" ? (
          <View style={{ gap: 10 }}>
            {detail.standings.map((person) => (
              <Entrance key={person.id} trigger={person.rank}>
                <View
                  style={[
                    s.card,
                    s.row,
                    person.id === me.id && { borderColor: colors.goldLine },
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
                      {event.mode === "party" && person.challenge_points
                        ? ` · ${formatJols(person.challenge_points)} from challenges`
                        : ""}
                    </Text>
                  </View>
                  <Text style={[s.h3, { color: colors.yellow }]}>
                    {formatJols(person.points)}
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
                    {photo.kind === "challenge" && (
                      <Text style={[s.eyebrow, { color: colors.yellow }]}>
                        PARTY CHALLENGE · {photo.challenge_prompt}
                      </Text>
                    )}
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open photo from ${photo.user.username}`}
                  onPress={() => setExpanded(photo)}
                  style={{ aspectRatio: 3 / 4 }}
                >
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
                      {photo.kind === "challenge"
                        ? `+${formatJols(2)} · Challenge`
                        : `${photo.beer_count} ${photo.beer_count === 1 ? "beer" : "beers"} · +${formatJols(photo.beer_points)}`}
                    </Text>
                  </View>
                </Pressable>
                <View style={[s.row, { padding: 14 }]}>
                  {reactions.map(({ emoji, label, icon }) => (
                    <Pressable
                      key={emoji}
                      accessibilityRole="button"
                      accessibilityLabel={`${label}, ${photo.reactions?.[emoji] ?? 0} reactions`}
                      accessibilityState={{
                        selected: photo.my_reaction === emoji,
                      }}
                      onPress={() => void react(photo, emoji)}
                      style={[
                        s.row,
                        {
                          minHeight: 44,
                          paddingHorizontal: 11,
                          gap: 6,
                          borderRadius: 22,
                          backgroundColor:
                            photo.my_reaction === emoji
                              ? colors.raised
                              : "transparent",
                        },
                      ]}
                    >
                      <Icon
                        name={icon}
                        size={19}
                        color={
                          photo.my_reaction === emoji
                            ? colors.yellow
                            : colors.text
                        }
                      />
                      <Text style={s.label}>
                        {photo.reactions?.[emoji] ?? 0}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {reactionFeedback.get(photo.id)?.error && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
                    <ErrorText
                      message={reactionFeedback.get(photo.id)?.error ?? ""}
                    />
                  </View>
                )}
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
        {!ended && !isBattle && event.host_id === me.id && (
          <Button
            title="Close the night"
            secondary
            loading={busy}
            onPress={finish}
          />
        )}
      </ScrollView>
      <Modal
        visible={editingName}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!renaming) setEditingName(false);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "#000000BB",
          }}
        >
          <View
            style={{
              padding: 24,
              paddingBottom: 36,
              gap: 18,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              backgroundColor: colors.card,
            }}
          >
            <View style={s.between}>
              <Text accessibilityRole="header" style={s.h2}>
                Change night name
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close name editor"
                disabled={renaming}
                style={s.iconButton}
                onPress={() => setEditingName(false)}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <Input
              label="Night name"
              value={nightName}
              onChangeText={(value) => {
                setNightName(value);
                setNameError("");
              }}
              maxLength={60}
              autoFocus
              autoCapitalize="sentences"
              returnKeyType="done"
              onSubmitEditing={() => void renameNight()}
            />
            <ErrorText message={nameError} />
            <View style={s.row}>
              <Button
                title="Cancel"
                secondary
                disabled={renaming}
                style={{ flex: 1 }}
                onPress={() => setEditingName(false)}
              />
              <Button
                title="Save name"
                loading={renaming}
                disabled={!nightName.trim() || nightName.trim() === event.name}
                style={{ flex: 1 }}
                onPress={() => void renameNight()}
              />
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={!!expanded}
        onRequestClose={() => setExpanded(null)}
        animationType="fade"
      >
        <SafeAreaView
          edges={Platform.OS === "web" ? undefined : []}
          style={[s.root, { padding: 18, paddingTop: 55, gap: 14 }]}
        >
          <NightBackdrop />
          <Button
            title="Close photo"
            secondary
            onPress={() => setExpanded(null)}
          />
          {expanded && (
            <>
              <Text style={s.h3}>{expanded.user.username}</Text>
              <Text style={s.small}>
                {new Date(expanded.created_at * 1000).toLocaleString()}
              </Text>
              <Image
                source={{ uri: expanded.rear_url }}
                resizeMode="contain"
                style={{ flex: 1, width: "100%" }}
                accessibilityLabel="Full-size drink photo"
              />
              <Image
                source={{ uri: expanded.front_url }}
                resizeMode="contain"
                style={{ height: "25%", width: "100%" }}
                accessibilityLabel="Full-size selfie"
              />
            </>
          )}
        </SafeAreaView>
      </Modal>
      {canCapture && (
        <View
          style={{
            paddingHorizontal: 18,
            paddingVertical: 9,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.bg,
          }}
        >
          <Button
            title={pending ? "Finish your saved capture" : "Capture a moment"}
            icon="camera-outline"
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
