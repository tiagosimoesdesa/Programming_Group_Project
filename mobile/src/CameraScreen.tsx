import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { APP_NAME } from "./Brand";
import NightBackdrop from "./NightBackdrop";
import { Button, colors, ErrorText, Icon, s } from "./ui";

const regularBeerGlass = require("../assets/super-bock-regular.png");

export type Capture = {
  rear: string;
  front: string;
  key: string;
  beerCount: number;
  pintCount: number;
};
export default function CameraScreen({
  name,
  pending,
  onPending,
  onSubmit,
  onClose,
  busy,
  error,
  countBeers = true,
}: {
  name: string;
  pending: Capture | null;
  onPending: (capture: Capture | null) => void;
  onSubmit: (capture: Capture) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  countBeers?: boolean;
}) {
  const [permission, ask, getPermission] = useCameraPermissions();
  const [active, setActive] = useState(AppState.currentState === "active");
  const camera = useRef<CameraView>(null);
  const [rear, setRear] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);
  const [ready, setReady] = useState(false);
  const [localError, setLocalError] = useState("");
  const facing = rear ? "front" : "back";
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  function updateCounts(pints: boolean, reset = false) {
    const current = pendingRef.current;
    if (!current || busy || (!reset && current.beerCount >= 10)) return;
    const next = {
      ...current,
      beerCount: reset ? 0 : current.beerCount + 1,
      pintCount: reset ? 0 : current.pintCount + (pints ? 1 : 0),
    };
    pendingRef.current = next;
    onPending(next);
  }
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      setActive(state === "active");
      setReady(false);
      if (state === "active") void getPermission();
    });
    return () => listener.remove();
  }, [getPermission]);
  async function capture() {
    if (!camera.current || taking || !ready) return;
    setTaking(true);
    setLocalError("");
    try {
      const image = await camera.current.takePictureAsync({ quality: 0.85 });
      if (!image)
        throw new Error("Camera did not return a photo. Please retry.");
      const resized = await manipulateAsync(
        image.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.8, format: SaveFormat.JPEG },
      );
      if (!rear) {
        setReady(false);
        setRear(resized.uri);
      } else
        onPending({
          rear,
          front: resized.uri,
          key: Crypto.randomUUID(),
          beerCount: countBeers ? 0 : 1,
          pintCount: 0,
        });
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setTaking(false);
    }
  }
  return (
    <View style={s.root}>
      <NightBackdrop />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 18, gap: 13 }}>
        <View style={s.between}>
          <Pressable
            disabled={busy || taking}
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            onPress={onClose}
            style={s.iconButton}
          >
            <Icon name="close" />
          </Pressable>
          <Text style={s.eyebrow}>
            {pending ? "CHECK-IN" : rear ? "2 OF 2" : "1 OF 2"}
          </Text>
          <View style={{ width: 44 }} />
        </View>
        <View>
          <Text accessibilityRole="header" style={s.h2}>
            {pending
              ? "Review photos"
              : rear
                ? "Take a selfie"
                : "Photograph your drink"}
          </Text>
          <Text style={s.body}>
            {name} ·{" "}
            {pending
              ? "Both photos, one check-in."
              : rear
                ? "One selfie to complete the pair."
                : "Take a fresh photo of your drink."}
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: colors.line,
            overflow: "hidden",
            backgroundColor: colors.card,
            minHeight: 200,
          }}
        >
          {pending ? (
            <>
              <Image
                source={{ uri: pending.rear }}
                style={{ width: "100%", height: "100%" }}
              />
              <Image
                source={{ uri: pending.front }}
                style={{
                  position: "absolute",
                  top: 16,
                  left: 16,
                  width: 105,
                  height: 145,
                  borderRadius: 18,
                  borderWidth: 3,
                  borderColor: colors.text,
                }}
              />
            </>
          ) : !permission ? (
            <ActivityIndicator color={colors.yellow} />
          ) : !permission.granted ? (
            <View style={{ padding: 24, gap: 20, marginVertical: "auto" }}>
              <Icon name="camera-outline" size={40} color={colors.yellow} />
              <Text style={s.h3}>Camera access needed</Text>
              <Text style={s.body}>
                {APP_NAME} uses fresh camera photos. Your gallery is never used
                for check-ins.
              </Text>
              <Button
                title={
                  permission.canAskAgain ? "Allow camera" : "Open settings"
                }
                onPress={() => {
                  if (permission.canAskAgain) void ask();
                  else void Linking.openSettings();
                }}
              />
            </View>
          ) : !active ? null : (
            <CameraView
              key={facing}
              ref={camera}
              style={{ flex: 1 }}
              facing={facing}
              onCameraReady={() => setReady(true)}
              onMountError={() =>
                setLocalError(
                  "Unable to open the camera. Close this screen and try again.",
                )
              }
            />
          )}
          {!active && !pending && (
            <View
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: colors.card,
              }}
            />
          )}
          {!pending && rear && (
            <Image
              source={{ uri: rear }}
              style={{
                position: "absolute",
                top: 16,
                left: 16,
                width: 80,
                height: 110,
                borderRadius: 14,
                borderWidth: 2,
                borderColor: colors.text,
              }}
            />
          )}
        </View>
        {pending && countBeers && (
          <View style={[s.card, { padding: 14, gap: 8 }]}>
            <Text style={s.label}>Beers in this photo</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {[
                {
                  label: "Regular",
                  detail: "Below 0.5 L",
                  pints: false,
                  count: pending.beerCount - pending.pintCount,
                },
                {
                  label: "Pint",
                  detail: "Exactly 0.5 L",
                  pints: true,
                  count: pending.pintCount,
                },
              ].map(({ label, detail, pints, count }) => {
                const disabled = busy || pending.beerCount >= 10;
                return (
                  <Pressable
                    key={label}
                    accessibilityRole="button"
                    accessibilityLabel={`Add one ${label.toLowerCase()} beer. ${detail}. Current quantity: ${count}`}
                    accessibilityState={{ disabled }}
                    disabled={disabled}
                    onPress={() => updateCounts(pints)}
                    style={({ pressed }) => ({
                      flex: 1,
                      minWidth: 0,
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 22,
                      paddingVertical: 14,
                      paddingHorizontal: 6,
                      gap: 4,
                      backgroundColor: colors.yellow,
                      opacity: busy ? 0.6 : pressed ? 0.8 : 1,
                    })}
                  >
                    <View
                      style={{
                        height: 112,
                        width: "100%",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {pints ? (
                        <Text
                          style={{ fontSize: 82, lineHeight: 104 }}
                          accessibilityElementsHidden
                        >
                          🍺
                        </Text>
                      ) : (
                        <Image
                          source={regularBeerGlass}
                          resizeMode="contain"
                          style={{ width: 64, height: 96 }}
                          aria-hidden
                        />
                      )}
                    </View>
                    <Text
                      style={{
                        color: "#000",
                        fontSize: 23,
                        fontWeight: "900",
                        textAlign: "center",
                      }}
                    >
                      {label}
                    </Text>
                    <Text
                      style={{
                        color: "#000",
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      {detail}
                    </Text>
                    <Text
                      accessibilityLiveRegion="polite"
                      style={{ color: "#000", fontSize: 36, fontWeight: "900" }}
                    >
                      {count}
                    </Text>
                    <Text
                      style={{
                        color: "#000",
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      {pending.beerCount >= 10 ? "Limit reached" : "Tap to add"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text
              accessibilityLiveRegion="polite"
              style={[s.h3, { textAlign: "center", marginTop: 6 }]}
            >
              Total: {pending.beerCount} / 10 beers
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reset counts"
              accessibilityState={{ disabled: busy || pending.beerCount === 0 }}
              disabled={busy || pending.beerCount === 0}
              onPress={() => updateCounts(false, true)}
              style={{
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy || pending.beerCount === 0 ? 0.5 : 1,
              }}
            >
              <Text
                style={[
                  s.small,
                  { textDecorationLine: "underline", fontWeight: "700" },
                ]}
              >
                Reset counts
              </Text>
            </Pressable>
          </View>
        )}
        <ErrorText message={localError || error} />
        {pending ? (
          <View style={{ gap: 10 }}>
            <Button
              title="Post to the night"
              icon="arrow-up-outline"
              loading={busy}
              disabled={countBeers && pending.beerCount === 0}
              onPress={() => onSubmit(pending)}
            />
            <Button
              title="Retake both photos"
              secondary
              disabled={busy}
              onPress={() => {
                onPending(null);
                setRear(null);
                setReady(false);
              }}
            />
          </View>
        ) : (
          <Button
            title={rear ? "Take selfie" : "Take drink photo"}
            icon="camera-outline"
            disabled={!permission?.granted || !ready}
            loading={taking}
            onPress={() => void capture()}
          />
        )}
        <Text style={[s.small, { textAlign: "center" }]}>
          Enjoy your night. Go at your own pace.
        </Text>
      </ScrollView>
    </View>
  );
}
