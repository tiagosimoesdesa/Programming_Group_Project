import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  DimensionValue,
  Easing,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMotionAllowed, nativeAnimationDriver } from "./motion";
import { colors } from "./ui";

const bubbles = Array.from({ length: 24 }, (_, index) => ({
  left: `${3 + ((index * 37) % 94)}%` as DimensionValue,
  size: 2 + ((index * 13) % 5),
  phase: (index * 0.38197) % 1,
}));

export default function NightBackdrop({
  bubbles: animated = false,
}: {
  bubbles?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      importantForAccessibility="no-hide-descendants"
    >
      <LinearGradient
        colors={["#231508", colors.bg, "#1D1006"]}
        locations={[0, 0.44, 1]}
        style={StyleSheet.absoluteFill}
      />
      {animated && <RisingBubbles />}
    </View>
  );
}

function RisingBubbles() {
  const progress = useRef(new Animated.Value(0)).current;
  const allowed = useMotionAllowed();
  const [active, setActive] = useState(AppState.currentState !== "background");
  const { height } = useWindowDimensions();
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active || !allowed) return;
    const motion = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 22000,
        easing: Easing.linear,
        isInteraction: false,
        useNativeDriver: nativeAnimationDriver,
      }),
    );
    progress.setValue(0);
    motion.start();
    return () => motion.stop();
  }, [active, allowed, progress]);

  if (!allowed || !active) return null;
  return bubbles.map(({ left, size, phase }) => {
    const position = Animated.modulo(Animated.add(progress, phase), 1);
    return (
      <Animated.View
        key={phase}
        style={{
          position: "absolute",
          left,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: "#E9AD50",
          backgroundColor: "#96601833",
          opacity: position.interpolate({
            inputRange: [0, 0.18, 0.8, 1],
            outputRange: [0, 0.58, 0.32, 0],
          }),
          transform: [
            {
              translateY: position.interpolate({
                inputRange: [0, 1],
                outputRange: [height + size, -size],
              }),
            },
            {
              translateX: position.interpolate({
                inputRange: [0, 0.33, 0.66, 1],
                outputRange: [0, 5, -3, 4],
              }),
            },
          ],
        }}
      />
    );
  });
}
