import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "./ui";

export function Wordmark() {
  return (
    <Text
      accessibilityRole="header"
      accessibilityLabel="BEERREAL"
      style={styles.wordmark}
    >
      BEER<Text style={{ color: colors.yellow }}>REAL</Text>
    </Text>
  );
}

export default function LoadingScreen() {
  const fill = useRef(new Animated.Value(0)).current;
  const bubbles = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(true);
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    const state = AppState.addEventListener("change", (value) =>
      setActive(value === "active"),
    );
    return () => {
      mounted = false;
      motion.remove();
      state.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion || !active) {
      fill.setValue(1);
      bubbles.setValue(0.5);
      return;
    }
    fill.setValue(0);
    bubbles.setValue(0);
    const pouring = Animated.timing(fill, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const fizz = Animated.loop(
      Animated.timing(bubbles, {
        toValue: 1,
        duration: 1700,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    pouring.start();
    fizz.start();
    return () => {
      pouring.stop();
      fizz.stop();
    };
  }, [active, reduceMotion, fill, bubbles]);
  return (
    <View
      style={styles.screen}
      accessibilityLabel="BEERREAL is loading"
      accessibilityState={{ busy: true }}
    >
      <View style={styles.center}>
        <View
          style={styles.cup}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.handle} />
          <View style={styles.glass}>
            <Animated.View
              style={[
                styles.beer,
                {
                  transform: [
                    {
                      translateY: fill.interpolate({
                        inputRange: [0, 1],
                        outputRange: [65, 0],
                      }),
                    },
                  ],
                },
              ]}
            />
            {[18, 37, 55].map((left, index) => (
              <Animated.View
                key={left}
                style={[
                  styles.bubble,
                  {
                    left,
                    bottom: 10 + index * 12,
                    opacity: bubbles.interpolate({
                      inputRange: [0, 0.2, 0.8, 1],
                      outputRange: [0, 0.65, 0.65, 0],
                    }),
                    transform: [
                      {
                        translateY: bubbles.interpolate({
                          inputRange: [0, 1],
                          outputRange: [12, -42],
                        }),
                      },
                    ],
                  },
                ]}
              />
            ))}
            <View style={styles.glint} />
          </View>
          <View style={styles.foam}>
            <View style={[styles.foamRound, { left: 0, top: 2 }]} />
            <View style={[styles.foamRound, { left: 22, top: -5 }]} />
            <View style={[styles.foamRound, { left: 45, top: 0 }]} />
          </View>
        </View>
        <Wordmark />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  center: { alignItems: "center", gap: 34 },
  wordmark: {
    fontSize: 33,
    fontWeight: "900",
    letterSpacing: -1.3,
    color: "#F5F5ED",
    textAlign: "center",
  },
  cup: { width: 108, height: 118 },
  handle: {
    position: "absolute",
    right: 1,
    top: 35,
    width: 33,
    height: 53,
    borderWidth: 7,
    borderColor: "#EAE7D9",
    borderRadius: 14,
  },
  glass: {
    position: "absolute",
    left: 7,
    top: 22,
    width: 78,
    height: 92,
    borderWidth: 4,
    borderColor: "#EAE7D9",
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: "hidden",
    backgroundColor: "#27291F",
  },
  beer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 75,
    backgroundColor: colors.yellow,
  },
  bubble: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#FFF7C6",
  },
  glint: {
    position: "absolute",
    top: 23,
    bottom: 14,
    left: 11,
    width: 5,
    borderRadius: 3,
    backgroundColor: "#FFFFFF45",
  },
  foam: {
    position: "absolute",
    left: 6,
    top: 16,
    width: 80,
    height: 24,
    borderRadius: 10,
    backgroundColor: "#F5F2E7",
  },
  foamRound: {
    position: "absolute",
    width: 34,
    height: 29,
    borderRadius: 18,
    backgroundColor: "#F5F2E7",
  },
});
