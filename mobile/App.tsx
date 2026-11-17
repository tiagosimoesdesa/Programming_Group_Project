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
import { LinearGradient } from "expo-linear-gradient";
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
  const [sheet, setSheet] = useState<"create" | "join" | null>(null);
  const [value, setValue] = useState("");
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
      const result = await post<Competition>(
        sheet === "create" ? "/competitions" : "/competitions/join",
        sheet === "create"
          ? { name: value.trim() }
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
  function openSheet(mode: "create" | "join") {
    setSheet(mode);
    setValue("");
    setSheetError("");
  }
  function eventCard(event: Competition) {
    return (
      <Pressable
        key={event.id}
        accessibilityRole="button"
        onPress={() => setSelected(event.id)}
      >
        <View style={s.card}>
          <View style={s.between}>
            <View style={[s.iconButton, { backgroundColor: colors.raised }]}>
              <Icon
                name={event.ended_at ? "moon-outline" : "beer-outline"}
                color={colors.yellow}
              />
            </View>
            <View style={s.pill}>
              <Text style={s.pillText}>
                {event.ended_at ? "FINISHED" : "● LIVE"}
              </Text>
            </View>
          </View>
          <Text style={s.h3}>{event.name}</Text>
          <View style={s.between}>
            <Text style={s.small}>
              {event.participants} friends ·{" "}
              {new Date(event.created_at * 1000).toLocaleDateString([], {
                month: "short",
                day: "numeric",
              })}
            </Text>
            <Icon name="arrow-forward" color={colors.yellow} size={20} />
          </View>
        </View>
      </Pressable>
    );
  }
  if (boot) return <LoadingScreen />;
  if (bootError)
    return (
      <View style={[s.content, { flex: 1, justifyContent: "center" }]}>
        <Text style={s.brand}>
          BEER<Text style={{ color: colors.yellow }}>REAL.</Text>
        </Text>
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
        <View style={s.between}>
          <Text style={s.brand}>
            BEER<Text style={{ color: colors.yellow }}>REAL.</Text>
          </Text>
          <Pressable
            accessibilityLabel="Open profile"
            onPress={() => setTab("profile")}
          >
            <Avatar user={me} size={42} />
          </Pressable>
        </View>
        <ErrorText message={error} />
        <Entrance trigger={tab}>
          {tab === "home" ? (
            <View style={{ gap: 26 }}>
              <View style={{ gap: 8 }}>
                <Text style={s.eyebrow}>
                  HEY, {me.username.toUpperCase()} ✳
                </Text>
                <Text style={s.h1}>Good nights.{"\n"}Better stories.</Text>
                <Text style={s.body}>Bring your people. Be in the moment.</Text>
              </View>
              <LinearGradient
                colors={["#F5D56A", "#E6B634"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  padding: 24,
                  borderRadius: 28,
                  gap: 18,
                  overflow: "hidden",
                }}
              >
                <View style={s.between}>
                  <Text
                    style={{
                      color: "#47401F",
                      fontSize: 11,
                      fontWeight: "800",
                      letterSpacing: 2,
                    }}
                  >
                    MAKE TONIGHT A STORY
                  </Text>
                  <Icon name="sparkles-outline" color="#51441D" size={28} />
                </View>
                <Text
                  style={{
                    color: colors.bg,
                    fontSize: 30,
                    lineHeight: 33,
                    fontWeight: "900",
                    letterSpacing: -1,
                  }}
                >
                  Your friends.{"\n"}Your kind of night.
                </Text>
                <Text
                  style={{
                    color: "#454021",
                    fontSize: 14,
                    maxWidth: 240,
                    lineHeight: 21,
                  }}
                >
                  A private space for the group and the moments worth keeping.
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSheet("create")}
                  style={[
                    s.button,
                    { backgroundColor: colors.bg, alignSelf: "flex-start" },
                  ]}
                >
                  <Text style={[s.buttonText, { color: colors.text }]}>
                    Start a night
                  </Text>
                  <Icon name="arrow-forward" size={18} />
                </Pressable>
              </LinearGradient>
              <Button
                title="Have a code? Join your friends"
                secondary
                icon="ticket-outline"
                onPress={() => openSheet("join")}
              />
              <View style={s.between}>
                <Text style={s.h3}>Happening now</Text>
                <Text style={s.small}>{active.length} active</Text>
              </View>
              {active.length ? (
                active.map(eventCard)
              ) : (
                <Empty
                  title="The night is unwritten"
                  body="Start a competition or join your friends with their invitation code."
                  icon="moon-outline"
                />
              )}
              {history.length > 0 && (
                <>
                  <View style={s.between}>
                    <Text style={s.h3}>Last time, together</Text>
                    <Pressable onPress={() => setTab("history")}>
                      <Text style={{ color: colors.yellow, padding: 10 }}>
                        View all
                      </Text>
                    </Pressable>
                  </View>
                  {history.slice(0, 2).map(eventCard)}
                </>
              )}
            </View>
          ) : tab === "history" ? (
            <View style={{ gap: 24 }}>
              <Text style={s.eyebrow}>THE GOOD TIMES STAY</Text>
              <Text style={s.h1}>Your nights,{"\n"}remembered.</Text>
              <Text style={s.body}>
                Final standings, familiar faces, and every captured moment.
              </Text>
              {history.length ? (
                history.map(eventCard)
              ) : (
                <Empty
                  title="Memories in the making"
                  body="Once your host finishes a competition, you’ll find it here."
                  icon="albums-outline"
                />
              )}
            </View>
          ) : (
            <View style={{ gap: 24 }}>
              <Text style={s.eyebrow}>ONE OF THE GOOD ONES</Text>
              <View
                style={{ alignItems: "center", gap: 12, paddingVertical: 16 }}
              >
                <Avatar user={me} size={100} />
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
              <Text style={[s.small, { textAlign: "center" }]}>
                BEERREAL · First release{"\n"}Made for real moments.
              </Text>
            </View>
          )}
        </Entrance>
      </ScrollView>
      <View style={s.bottom}>
        {(["home", "history", "profile"] as const).map((item) => (
          <Pressable
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item }}
            onPress={() => setTab(item)}
            style={s.nav}
          >
            <Icon
              name={
                item === "home"
                  ? "grid-outline"
                  : item === "history"
                    ? "albums-outline"
                    : "person-outline"
              }
              color={tab === item ? colors.yellow : colors.muted}
            />
            <Text
              style={[
                s.small,
                { color: tab === item ? colors.yellow : colors.muted },
              ]}
            >
              {item === "home"
                ? "Tonight"
                : item === "history"
                  ? "Memories"
                  : "You"}
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
          <View
            style={{
              padding: 28,
              paddingBottom: 44,
              borderTopLeftRadius: 32,
              borderTopRightRadius: 32,
              backgroundColor: colors.bg,
              gap: 20,
            }}
          >
            <View style={s.between}>
              <Text style={s.eyebrow}>
                {sheet === "create" ? "ASSEMBLE YOUR PEOPLE" : "YOU’RE INVITED"}
              </Text>
              <Pressable
                disabled={busy}
                accessibilityLabel="Close"
                onPress={() => setSheet(null)}
                style={s.iconButton}
              >
                <Icon name="close" />
              </Pressable>
            </View>
            <Text style={s.h2}>
              {sheet === "create"
                ? "Give the night a name."
                : "Meet you in there."}
            </Text>
            <Text style={s.body}>
              {sheet === "create"
                ? "Your competition opens immediately. Share the code with friends to bring them in."
                : "Enter the 8-character invitation code from your host."}
            </Text>
            <Input
              label={
                sheet === "create" ? "Competition name" : "Invitation code"
              }
              placeholder={
                sheet === "create" ? "Friday with the usuals" : "ABCD2345"
              }
              value={value}
              onChangeText={setValue}
              maxLength={sheet === "create" ? 60 : 8}
              autoCapitalize={sheet === "create" ? "sentences" : "characters"}
              autoCorrect={false}
            />
            <ErrorText message={sheetError} />
            <Button
              title={sheet === "create" ? "Start the night" : "Join the night"}
              loading={busy}
              disabled={
                sheet === "create" ? !value.trim() : value.trim().length !== 8
              }
              onPress={() => void saveEvent()}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
