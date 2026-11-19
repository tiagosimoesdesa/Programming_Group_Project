import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  View,
} from "react-native";
import { APP_NAME, BeerGlass, Wordmark } from "./Brand";
import NightBackdrop from "./NightBackdrop";
import { useMotionAllowed, nativeAnimationDriver } from "./motion";
import { colors, s } from "./ui";

export default function LoadingScreen() {
  const entrance = useRef(new Animated.Value(1)).current;
  const motionAllowed = useMotionAllowed();
  useEffect(() => {
    if (!motionAllowed) {
      entrance.setValue(1);
      return;
    }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 610,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: nativeAnimationDriver,
    });
    animation.start();
    return () => animation.stop();
  }, [entrance, motionAllowed]);

  return (
    <View
      style={[s.root, styles.screen]}
      accessibilityLabel={`${APP_NAME} is loading`}
      accessibilityState={{ busy: true }}
    >
      <NightBackdrop bubbles />
      <Animated.View
        style={[
          styles.center,
          {
            opacity: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [0.65, 1],
            }),
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, 0],
                }),
              },
            ],
          },
        ]}
      >
        <BeerGlass height={142} />
        <Wordmark style={styles.wordmark} />
        <ActivityIndicator color={colors.yellow} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center", padding: 18 },
  center: { alignItems: "center", gap: 20 },
  wordmark: { fontSize: 29 },
});
