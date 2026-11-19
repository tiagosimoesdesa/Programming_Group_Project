import { showAlert } from "./src/confirm";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import {
  ApiError,
  Competition,
  imagePart,
  logout,
  onAuthLost,
  post,
  Profile,
  request,
  restoreSession,
} from "./src/api";
import AuthScreen from "./src/AuthScreen";
import LoadingScreen from "./src/LoadingScreen";
import { BrandHeader } from "./src/Brand";
import NightBackdrop from "./src/NightBackdrop";
import TonightScreen, { NightListItem } from "./src/TonightScreen";
import CompetitionScreen from "./src/CompetitionScreen";
import { Capture } from "./src/CameraScreen";
import {
  Avatar,
  Button,
  colors,
  Empty,
  Entrance,
  ErrorText,
  Icon,
  Input,
  s,
} from "./src/ui";

const BATTLE_DURATIONS = [
  [600, "10 min"],
  [1800, "30 min"],
  [2700, "45 min"],
  [3600, "1 hour"],
  [5400, "1.5 hours"],
  [7200, "2 hours"],
  [10800, "3 hours"],
  [14400, "4 hours"],
  [18000, "5 hours"],
  [21600, "6 hours"],
  [25200, "7 hours"],
  [32400, "9 hours"],
  [36000, "10 hours"],
] as const;

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.root}>
        <Root />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Root() {
  const [me, setMe] = useState<Profile | null>(null);
  const [events, setEvents] = useState<Competition[]>([]);
  const [boot, setBoot] = useState(true);
  const [bootError, setBootError] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"home" | "history" | "profile">("home");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    "create" | "join" | "battle-menu" | "battle-create" | "battle-join" | null
  >(null);
  const [value, setValue] = useState("");
  const [selectedMode, setSelectedMode] = useState<"classic" | "party" | null>(
    null,
  );
  const [battleDuration, setBattleDuration] = useState<number | null>(null);
  const [battlePointsVisible, setBattlePointsVisible] = useState<
    boolean | null
  >(null);
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [sheetError, setSheetError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, Capture | null>>({});
  const load = useCallback(async () => {
    const [person, nights] = await Promise.all([
      request<Profile>("/me"),
      request<Competition[]>("/competitions"),
    ]);
    setMe(person);
    setEvents(nights);
    setError("");
  }, []);
  const bootUp = useCallback(async () => {
    const startedAt = Date.now();
    setBoot(true);
    setBootError("");
    try {
      if (await restoreSession()) await load();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401))
        setBootError((e as Error).message);
    } finally {
      // Keep the opening animation readable without delaying slower loads.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 1200 - (Date.now() - startedAt))),
      );
      setBoot(false);
    }
  }, [load]);
  useEffect(() => {
    onAuthLost(() => {
      setMe(null);
      setSelected(null);
      setEvents([]);
      setPending({});
    });
    void bootUp();
  }, [bootUp]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && me)
        void load().catch((e) => setError(e.message));
    });
    return () => subscription.remove();
  }, [me?.id, load]);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (selected) return false;
      if (tab !== "home") {
        setTab("home");
        return true;
      }
      return false;
    });
    return () => back.remove();
  }, [selected, tab]);
  async function reload() {
    setRefreshing(true);
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }
  async function saveEvent() {
    setBusy(true);
    setSheetError("");
    try {
      const creatingBattle = sheet === "battle-create";
      const creatingNight = sheet === "create";
      const result = await post<Competition>(
        creatingBattle || creatingNight
          ? "/competitions"
          : "/competitions/join",
        creatingBattle
          ? {
              name: `${teamA.trim()} vs ${teamB.trim()}`,
              mode: "battle",
              battle_duration_seconds: battleDuration,
              battle_points_visible: battlePointsVisible,
              battle_team_a_name: teamA.trim(),
              battle_team_b_name: teamB.trim(),
            }
          : creatingNight
            ? { name: value.trim(), mode: selectedMode }
            : { code: value.trim().toUpperCase() },
      );
      setSheet(null);
      setSelected(result.id);
      await load();
    } catch (e) {
      setSheetError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changeAvatar() {
    setBusy(true);
    setError("");
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted)
        throw new Error(
          "Allow photo library access in your phone settings to choose a profile picture.",
        );
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled) return;
      const photo = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 500 } }],
        { compress: 0.8, format: SaveFormat.JPEG },
      );
      const form = new FormData();
      form.append("photo", await imagePart(photo.uri, "avatar.jpg"));
      setMe(
        await request<Profile>("/me/avatar", { method: "PUT", body: form }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function signOut() {
    showAlert(
      "Sign out?",
      "Unsubmitted captures on this device will be discarded.",
      [
        { text: "Stay here", style: "cancel" },
        {
          text: "Sign out",
          onPress: () => {
            setBusy(true);
            logout()
              .then(() => {
                setMe(null);
                setSelected(null);
                setPending({});
                setEvents([]);
                setTab("home");
              })
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  }
  function openSheet(
    mode: "create" | "join" | "battle-menu" | "battle-create" | "battle-join",
  ) {
    setSheet(mode);
    setValue("");
    setSelectedMode(null);
    setBattleDuration(null);
    setBattlePointsVisible(null);
    setTeamA("");
    setTeamB("");
    setSheetError("");
  }
  if (boot) return <LoadingScreen />;
  if (bootError)
    return (
      <View style={[s.root, s.content, { justifyContent: "center" }]}>
        <NightBackdrop />
        <BrandHeader />
        <ErrorText message={bootError} />
        <Button title="Reconnect" onPress={() => void bootUp()} />
      </View>
    );
  if (!me) return <AuthScreen onLogin={load} />;
  if (selected)
    return (
      <CompetitionScreen
        key={selected}
        id={selected}
        me={me}
        onBack={() => {
          setSelected(null);
          void reload();
        }}
        pending={pending[selected] ?? null}
        onPending={(capture) =>
          setPending((old) => ({ ...old, [selected]: capture }))
        }
      />
    );
  const active = events.filter((e) => !e.ended_at);
  const history = events.filter((e) => e.ended_at);
  return (
    <View style={s.root}>
      <NightBackdrop bubbles={tab === "home"} />
      <ScrollView
        contentContainerStyle={[s.content, { flexGrow: 1 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.yellow}
            onRefresh={() => void reload()}
          />
        }
      >
        <BrandHeader />
        <ErrorText message={error} />
        <Entrance trigger={tab}>
          {tab === "home" ? (
            <TonightScreen
              nights={active}
              onOpen={setSelected}
              onStart={() => openSheet("create")}
              onJoin={() => openSheet("join")}
              onBattle={() => openSheet("battle-menu")}
            />
          ) : tab === "history" ? (
            <View style={{ gap: 16 }}>
              <Text accessibilityRole="header" style={s.h1}>
                Memories
              </Text>
              {history.length ? (
                history.map((event) => (
                  <NightListItem
                    key={event.id}
                    event={event}
                    onOpen={() => setSelected(event.id)}
                  />
                ))
              ) : (
                <Empty
                  title="Memories in the making"
                  body="Once your host finishes a competition, you’ll find it here."
                  icon="albums-outline"
                />
              )}
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              <Text accessibilityRole="header" style={s.h1}>
                Profile
              </Text>
              <View
                style={{ alignItems: "center", gap: 12, paddingVertical: 16 }}
              >
                <Avatar user={me} size={84} />
                <Text style={s.h2}>@{me.username}</Text>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void changeAvatar()}
                  style={{ padding: 12 }}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.yellow} />
                  ) : (
                    <Text style={{ color: colors.yellow }}>
                      Edit profile photo
                    </Text>
                  )}
                </Pressable>
              </View>
              <View style={[s.card, { flexDirection: "row" }]}>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={s.h1}>{events.length}</Text>
                  <Text style={s.small}>NIGHTS JOINED</Text>
                </View>
                <View style={{ width: 1, backgroundColor: colors.line }} />
                <View style={{ flex: 1, paddingLeft: 16, gap: 8 }}>
                  <Text style={s.h1}>{history.length}</Text>
                  <Text style={s.small}>NIGHTS FINISHED</Text>
                </View>
              </View>
              <Button
                title="Your competition history"
                secondary
                icon="time-outline"
                onPress={() => setTab("history")}
              />
              <View style={s.card}>
                <Icon name="heart-outline" color={colors.green} />
                <Text style={s.h3}>Good company comes first.</Text>
                <Text style={s.body}>
                  Stay hydrated, respect your limits, and look out for your
                  friends. There’s no pressure to keep up.
                </Text>
              </View>
              <Button
                title="Sign out"
                secondary
                loading={busy}
                onPress={signOut}
              />
            </View>
          )}
        </Entrance>
      </ScrollView>
      <View accessibilityRole="tablist" style={s.bottom}>
        {(
          [
            { id: "home", label: "Tonight", icon: "home-outline" },
            { id: "history", label: "Memories", icon: "images-outline" },
            { id: "profile", label: "Profile", icon: "person-outline" },
          ] as const
        ).map(({ id, label, icon }) => (
          <Pressable
            key={id}
            accessibilityLabel={label}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === id }}
            onPress={() => setTab(id)}
            style={({ pressed }) => [
              s.nav,
              tab === id && { backgroundColor: colors.yellow },
              pressed && { opacity: 0.78 },
            ]}
          >
            {id === "profile" && me.avatar_url ? (
              <Avatar user={me} size={21} />
            ) : (
              <Icon
                name={icon}
                size={21}
                color={tab === id ? colors.bg : colors.text}
              />
            )}
            <Text
              style={[
                s.small,
                {
                  color: tab === id ? colors.bg : colors.text,
                  fontWeight: "800",
                },
              ]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Modal
        visible={!!sheet}
        transparent
        animationType="none"
        onRequestClose={() => {
          if (!busy) setSheet(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{
            flex: 1,
            backgroundColor: "#000000BB",
            justifyContent: "flex-end",
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{
              maxHeight: "92%",
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              backgroundColor: colors.card,
            }}
            contentContainerStyle={{
              flexGrow: 0,
              padding: 28,
              paddingBottom: 44,
              gap: 16,
            }}
          >
            <View style={s.between}>
              <Text accessibilityRole="header" style={s.h2}>
                {sheet === "battle-menu"
                  ? "Battle"
                  : sheet === "battle-create"
                    ? "Create a Battle"
                    : sheet === "battle-join"
                      ? "Join a Battle"
                      : sheet === "create"
                        ? "Start a night"
                        : "Join with a code"}
              </Text>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setSheet(null)}
                style={s.iconButton}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <Text style={s.body}>
              {sheet === "battle-menu"
                ? "Create a two-team battle or enter one with the host’s code."
                : sheet === "battle-create"
                  ? "Choose the rules and name both teams. You’ll receive a code to share after creation."
                  : sheet === "create"
                    ? "Your competition opens immediately. Share the code with friends to bring them in."
                    : "Enter the 8-character invitation code from your host."}
            </Text>
            {sheet === "battle-menu" && (
              <View style={{ gap: 12 }}>
                <Button
                  title="Create Battle"
                  icon="add-circle-outline"
                  onPress={() => openSheet("battle-create")}
                />
                <Button
                  title="Enter Battle"
                  secondary
                  icon="enter-outline"
                  onPress={() => openSheet("battle-join")}
                />
              </View>
            )}
            {(sheet === "create" ||
              sheet === "join" ||
              sheet === "battle-join") && (
              <Input
                label={
                  sheet === "create"
                    ? "Competition name"
                    : sheet === "battle-join"
                      ? "Battle code"
                      : "Invitation code"
                }
                placeholder={
                  sheet === "create" ? "Friday with the usuals" : "ABCD2345"
                }
                value={value}
                onChangeText={setValue}
                maxLength={sheet === "create" ? 60 : 10}
                autoCapitalize={sheet === "create" ? "sentences" : "characters"}
                autoCorrect={false}
              />
            )}
            {sheet === "battle-create" && (
              <View style={{ gap: 20 }}>
                <Input
                  label="Team one"
                  placeholder="Pens"
                  value={teamA}
                  onChangeText={setTeamA}
                  maxLength={40}
                />
                <Input
                  label="Team two"
                  placeholder="Balloons"
                  value={teamB}
                  onChangeText={setTeamB}
                  maxLength={40}
                />
                <View style={{ gap: 10 }}>
                  <Text style={s.label}>Duration</Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                  >
                    {BATTLE_DURATIONS.map(([seconds, label]) => (
                      <Pressable
                        key={seconds}
                        accessibilityRole="radio"
                        accessibilityState={{
                          selected: battleDuration === seconds,
                        }}
                        onPress={() => setBattleDuration(seconds)}
                        style={[
                          s.pill,
                          {
                            paddingHorizontal: 14,
                            paddingVertical: 11,
                            borderWidth: 1,
                            borderColor:
                              battleDuration === seconds
                                ? colors.yellow
                                : colors.line,
                          },
                        ]}
                      >
                        <Text style={s.label}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View style={{ gap: 10 }}>
                  <Text style={s.label}>During the battle</Text>
                  {[
                    {
                      value: true,
                      title: "Show Jols",
                      body: "Both teams can see every score and photo live.",
                    },
                    {
                      value: false,
                      title: "Hide Jols",
                      body: "Each team sees only its own score and photos until time is up.",
                    },
                  ].map((option) => (
                    <Pressable
                      key={String(option.value)}
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: battlePointsVisible === option.value,
                      }}
                      onPress={() => setBattlePointsVisible(option.value)}
                      style={[
                        s.card,
                        { padding: 16, gap: 5 },
                        battlePointsVisible === option.value && {
                          borderColor: colors.yellow,
                        },
                      ]}
                    >
                      <View style={s.between}>
                        <Text style={s.h3}>{option.title}</Text>
                        <Icon
                          name={
                            battlePointsVisible === option.value
                              ? "radio-button-on"
                              : "radio-button-off"
                          }
                          color={
                            battlePointsVisible === option.value
                              ? colors.yellow
                              : colors.muted
                          }
                        />
                      </View>
                      <Text style={s.small}>{option.body}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {sheet === "create" && (
              <View style={{ gap: 10 }}>
                <Text style={s.label}>Which mode do you want to play?</Text>
                {[
                  {
                    id: "classic" as const,
                    title: "Classic",
                    body: "Earn Jols for the regular beers and pints you check in.",
                  },
                  {
                    id: "party" as const,
                    title: "Party",
                    body: "Drink photos plus timed challenges. Approved challenges earn 2 bonus Jols.",
                  },
                ].map((mode) => (
                  <Pressable
                    key={mode.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedMode === mode.id }}
                    onPress={() => setSelectedMode(mode.id)}
                    style={[
                      s.card,
                      { padding: 16, gap: 5 },
                      selectedMode === mode.id && {
                        borderColor: colors.yellow,
                      },
                    ]}
                  >
                    <View style={s.between}>
                      <Text style={s.h3}>{mode.title}</Text>
                      <Icon
                        name={
                          selectedMode === mode.id
                            ? "radio-button-on"
                            : "radio-button-off"
                        }
                        color={
                          selectedMode === mode.id
                            ? colors.yellow
                            : colors.muted
                        }
                      />
                    </View>
                    <Text style={s.small}>{mode.body}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {sheet !== "battle-menu" && (
              <>
                <ErrorText message={sheetError} />
                <Button
                  title={
                    sheet === "battle-create"
                      ? "Create Battle"
                      : sheet === "battle-join"
                        ? "Enter Battle"
                        : sheet === "create"
                          ? "Start the night"
                          : "Join the night"
                  }
                  loading={busy}
                  disabled={
                    sheet === "battle-create"
                      ? !teamA.trim() ||
                        !teamB.trim() ||
                        teamA.trim().toLowerCase() ===
                          teamB.trim().toLowerCase() ||
                        !battleDuration ||
                        battlePointsVisible === null
                      : sheet === "create"
                        ? !value.trim() || !selectedMode
                        : ![8, 10].includes(value.trim().length)
                  }
                  onPress={() => void saveEvent()}
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
