import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { Button, colors, ErrorText, Icon, s } from "./ui";

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
          beerCount: 1,
          pintCount: 0,
        });
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setTaking(false);
    }
  }
  return (
    <View style={[s.root, { padding: 20, gap: 18 }]}>
      <View style={s.between}>
        <Pressable
          disabled={busy || taking}
          accessibilityLabel="Close camera"
          onPress={onClose}
          style={s.iconButton}
        >
          <Icon name="close" />
        </Pressable>
        <Text style={s.eyebrow}>
          {pending
            ? "YOUR MOMENT"
            : rear
              ? "02 / THE PERSON"
              : "01 / THE DRINK"}
        </Text>
        <View style={{ width: 44 }} />
      </View>
      <View>
        <Text style={s.h2}>
          {pending
            ? "Keep it real."
            : rear
              ? "Now, your side."
              : "Show the moment."}
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
          borderRadius: 28,
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
              BEERREAL uses fresh camera photos. Your gallery is never used for
              check-ins.
            </Text>
            <Button
              title={permission.canAskAgain ? "Allow camera" : "Open settings"}
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
          {[
            {
              label: "Regular · below 0.5 L",
              pints: false,
              count: pending.beerCount - pending.pintCount,
            },
            {
              label: "Pint · exactly 0.5 L",
              pints: true,
              count: pending.pintCount,
            },
          ].map(({ label, pints, count }) => (
            <View key={label} style={s.between}>
              <Text style={[s.small, { flex: 1 }]}>{label}</Text>
              <View style={[s.row, { gap: 12 }]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove one ${pints ? "pint" : "regular beer"}`}
                  disabled={busy || count === 0}
                  onPress={() =>
                    onPending({
                      ...pending,
                      beerCount: pending.beerCount - 1,
                      pintCount: pending.pintCount - (pints ? 1 : 0),
                    })
                  }
                  style={s.iconButton}
                >
                  <Icon name="remove" />
                </Pressable>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[s.h3, { minWidth: 24, textAlign: "center" }]}
                >
                  {count}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add one ${pints ? "pint" : "regular beer"}`}
                  disabled={busy || pending.beerCount >= 10}
                  onPress={() =>
                    onPending({
                      ...pending,
                      beerCount: pending.beerCount + 1,
                      pintCount: pending.pintCount + (pints ? 1 : 0),
                    })
                  }
                  style={s.iconButton}
                >
                  <Icon name="add" />
                </Pressable>
              </View>
            </View>
          ))}
          <Text style={s.small}>
            {pending.beerCount} beers total · Choose 1–10 beers.
          </Text>
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
    </View>
  );
}
