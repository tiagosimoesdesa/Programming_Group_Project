import React from "react";
import {
  Image,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from "react-native";
import { colors, s } from "./ui";

export const APP_NAME = "COUNT THE JOLS";
const glass = require("../assets/beer-glass.png");

export function BeerGlass({ height }: { height: number }) {
  return (
    <Image
      accessible={false}
      source={glass}
      resizeMode="contain"
      style={{ width: height * 0.35, height }}
    />
  );
}

export function Wordmark({ style }: { style?: StyleProp<TextStyle> }) {
  return (
    <Text
      accessibilityLabel={APP_NAME}
      style={[s.brand, styles.wordmark, style]}
    >
      COUNT THE <Text style={{ color: colors.yellow }}>JOLS</Text>
    </Text>
  );
}

export function BrandHeader() {
  return (
    <View style={styles.header}>
      <View style={styles.mark}>
        <BeerGlass height={46} />
      </View>
      <Wordmark />
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { textAlign: "center", letterSpacing: -0.5 },
  header: { minHeight: 54, justifyContent: "center", paddingHorizontal: 44 },
  mark: { position: "absolute", left: 7, top: 4 },
});
