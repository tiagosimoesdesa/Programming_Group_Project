import React, { useEffect, useRef } from "react";
import {
  Animated,
  DimensionValue,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Standing } from "./api";
import { useMotionAllowed, nativeAnimationDriver } from "./motion";
import { Avatar, Button, Empty, colors, formatJols, s } from "./ui";

const tiers = [
  {
    rank: 1,
    label: "First place",
    start: 0.22,
    size: 68,
    gradient: ["#FFDD69", "#E9AA29"],
  },
  {
    rank: 2,
    label: "Second place",
    start: 0.13,
    size: 52,
    gradient: ["#E8E1D5", "#ABA295"],
  },
  {
    rank: 3,
    label: "Third place",
    start: 0.035,
    size: 43,
    gradient: ["#E0A472", "#A46035"],
  },
] as const;

const confetti = Array.from({ length: 45 }, (_, index) => {
  const left = index % 2 === 0;
  return {
    left: (left ? "6%" : "94%") as DimensionValue,
    start: 0.37 + ((index * 17) % 9) * 0.009,
    side: left ? 1 : -1,
    spread: 0.15 + ((index * 31) % 55) / 100,
    height: 0.14 + ((index * 23) % 25) / 100,
    size: 3 + ((index * 3) % 4),
    color: ["#FFCA44", "#FFF4D5", "#FFA844", "#FFE491"][
      (index + Math.floor(index / 4)) % 4
    ],
  };
});

export default function NightPodium({
  name,
  standings,
  onMoments,
  onRanks,
}: {
  name: string;
  standings: Standing[];
  onMoments: () => void;
  onRanks: () => void;
}) {
  const progress = useRef(new Animated.Value(1)).current;
  const motionAllowed = useMotionAllowed();
  const hasStandings = standings.length > 0;
  const { width, height } = useWindowDimensions();
  useEffect(() => {
    if (!motionAllowed || !hasStandings) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const reveal = Animated.timing(progress, {
      toValue: 1,
      duration: 3700,
      easing: Easing.linear,
      isInteraction: false,
      useNativeDriver: nativeAnimationDriver,
    });
    reveal.start();
    return () => reveal.stop();
  }, [hasStandings, motionAllowed, progress]);

  return (
    <View style={styles.screen}>
      <View style={styles.heading}>
        <Text style={s.body}>{name}</Text>
        <Text accessibilityRole="header" style={[s.h1, styles.title]}>
          End of the night
        </Text>
      </View>
      {hasStandings ? (
        <View style={{ gap: 15 }}>
          {tiers.map(({ rank, label, start, size, gradient }) => {
            const players = standings.filter((person) => person.rank === rank);
            if (!players.length) return null;
            const reveal = progress.interpolate({
              inputRange: [start, start + 0.14],
              outputRange: [0, 1],
              extrapolate: "clamp",
            });
            return (
              <Animated.View
                key={rank}
                style={[
                  styles.rankRow,
                  {
                    opacity: reveal,
                    transform: [
                      {
                        translateY: reveal.interpolate({
                          inputRange: [0, 1],
                          outputRange: [16, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {players.map((person) => (
                  <View
                    key={person.id}
                    accessible
                    accessibilityLabel={`${players.length > 1 ? "Tied for " : ""}${label.toLowerCase()}, ${person.username}, ${formatJols(person.points)}`}
                    style={[
                      styles.player,
                      { width: rank === 3 ? "30%" : "44%" },
                    ]}
                  >
                    {rank === 1 && (
                      <MaterialCommunityIcons
                        name="crown"
                        color={colors.yellow}
                        size={47}
                      />
                    )}
                    {person.avatar_url && (
                      <Avatar user={person} size={size} fallback={false} />
                    )}
                    <Text
                      style={[
                        s.label,
                        styles.name,
                        rank === 1 && { fontSize: 18 },
                      ]}
                    >
                      {person.username}
                    </Text>
                    <LinearGradient
                      colors={gradient}
                      style={[
                        styles.plinth,
                        { minHeight: rank === 1 ? 66 : rank === 2 ? 54 : 47 },
                      ]}
                    >
                      <Text
                        style={[styles.place, rank === 1 && { fontSize: 33 }]}
                      >
                        {rank}
                      </Text>
                      <Text style={styles.score}>
                        {formatJols(person.points)}
                      </Text>
                    </LinearGradient>
                  </View>
                ))}
              </Animated.View>
            );
          })}
        </View>
      ) : (
        <Empty
          title="No standings yet"
          body="This night ended without any players."
          icon="trophy-outline"
        />
      )}
      <Button title="Night moments" icon="images-outline" onPress={onMoments} />
      {standings.some((person) => person.rank > 3) && (
        <Button title="View full standings" secondary onPress={onRanks} />
      )}
      {motionAllowed && hasStandings && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.confetti]}
          importantForAccessibility="no-hide-descendants"
        >
          {confetti.map(
            (
              { left, start, side, spread, height: rise, size, color },
              index,
            ) => {
              const range = [start, start + 0.035, start + 0.19, start + 0.44];
              return (
                <Animated.View
                  key={index}
                  style={{
                    position: "absolute",
                    top: "56%",
                    left,
                    width: size,
                    height: size * (index % 4 === 0 ? 1 : 1.6),
                    borderRadius: index % 4 === 0 ? size / 2 : 1,
                    backgroundColor: color,
                    opacity: progress.interpolate({
                      inputRange: range,
                      outputRange: [0, 1, 0.92, 0],
                      extrapolate: "clamp",
                    }),
                    transform: [
                      {
                        translateX: progress.interpolate({
                          inputRange: range,
                          outputRange: [
                            0,
                            width * spread * side * 0.12,
                            width * spread * side * 0.56,
                            width * spread * side,
                          ],
                          extrapolate: "clamp",
                        }),
                      },
                      {
                        translateY: progress.interpolate({
                          inputRange: range,
                          outputRange: [
                            0,
                            -height * rise * 0.22,
                            -height * rise,
                            height * 0.28,
                          ],
                          extrapolate: "clamp",
                        }),
                      },
                      {
                        rotate: progress.interpolate({
                          inputRange: range,
                          outputRange: [
                            "0deg",
                            `${45 * side}deg`,
                            `${220 * side}deg`,
                            `${650 * side}deg`,
                          ],
                          extrapolate: "clamp",
                        }),
                      },
                    ],
                  }}
                />
              );
            },
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: 16 },
  heading: { alignItems: "center", gap: 5, marginBottom: 2 },
  title: { color: colors.yellow, textAlign: "center" },
  rankRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "center",
    columnGap: "3%",
    rowGap: 13,
  },
  player: { alignItems: "center", gap: 5, minWidth: 0 },
  name: { textAlign: "center", fontWeight: "800" },
  plinth: {
    width: "100%",
    paddingHorizontal: 3,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    borderTopLeftRadius: 13,
    borderTopRightRadius: 13,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  place: { color: colors.bg, fontSize: 24, fontWeight: "900" },
  score: {
    color: colors.bg,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
  },
  confetti: { overflow: "hidden" },
});
