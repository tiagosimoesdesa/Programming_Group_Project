import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Profile } from "./api";

export const colors = {
  bg: "#101110",
  card: "#1D1F1B",
  raised: "#282B25",
  yellow: "#F5CB45",
  text: "#F5F5ED",
  muted: "#A5AA9C",
  line: "#34382E",
  green: "#BEDEA6",
  red: "#FFB6A8",
};
export function Icon({
  name,
  size = 22,
  color = colors.text,
}: {
  name: React.ComponentProps<typeof Ionicons>["name"];
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Button({
  title,
  onPress,
  secondary,
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Icon>["name"];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.text : colors.bg} />
      ) : (
        <>
          {icon && (
            <Icon name={icon} color={secondary ? colors.text : colors.bg} />
          )}
          <Text style={[s.buttonText, secondary && { color: colors.text }]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#818777"
        selectionColor={colors.yellow}
        {...props}
        style={[s.input, props.style]}
      />
    </View>
  );
}
export function Avatar({
  user,
  size = 44,
}: {
  user: Pick<Profile, "username" | "avatar_url">;
  size?: number;
}) {
  return user.avatar_url ? (
    <Image
      source={{ uri: user.avatar_url }}
      accessibilityLabel={`${user.username}'s avatar`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.raised,
      }}
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.raised,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.line,
      }}
    >
      <Text
        style={{
          color: colors.yellow,
          fontSize: size * 0.36,
          fontWeight: "800",
        }}
      >
        {user.username.slice(0, 2).toUpperCase()}
      </Text>
    </View>
  );
}
export function ErrorText({ message }: { message: string }) {
  return message ? (
    <View accessibilityLiveRegion="polite" style={s.error}>
      <Icon name="alert-circle-outline" color={colors.red} size={18} />
      <Text style={{ color: colors.red, flex: 1, lineHeight: 20 }}>
        {message}
      </Text>
    </View>
  ) : null;
}
export function Empty({
  title,
  body,
  icon = "sparkles-outline",
}: {
  title: string;
  body: string;
  icon?: React.ComponentProps<typeof Icon>["name"];
}) {
  return (
    <View style={s.empty}>
      <Icon name={icon} color={colors.yellow} size={36} />
      <Text style={s.h3}>{title}</Text>
      <Text style={[s.body, { textAlign: "center" }]}>{body}</Text>
    </View>
  );
}
export function Entrance({
  children,
  trigger,
}: {
  children: React.ReactNode;
  trigger?: unknown;
}) {
  const value = useRef(new Animated.Value(1)).current;
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reduce) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    Animated.timing(value, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [trigger, reduce, value]);
  return (
    <Animated.View
      style={{
        opacity: value,
        transform: [
          {
            translateY: value.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingBottom: 32, gap: 24 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1.2,
  },
  eyebrow: {
    color: colors.yellow,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2.2,
  },
  h1: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 44,
    fontWeight: "900",
    letterSpacing: -1.7,
  },
  h2: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "800",
    letterSpacing: -0.7,
  },
  h3: { color: colors.text, fontSize: 18, fontWeight: "700" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  small: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  label: { color: colors.text, fontSize: 13, fontWeight: "600" },
  button: {
    minHeight: 54,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 17,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  buttonText: { color: colors.bg, fontSize: 15, fontWeight: "800" },
  secondary: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    minHeight: 54,
  },
  card: {
    backgroundColor: colors.card,
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 16,
  },
  pill: {
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    backgroundColor: "#30351F",
  },
  pillText: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.card,
  },
  divider: { height: 1, backgroundColor: colors.line },
  error: {
    flexDirection: "row",
    gap: 9,
    backgroundColor: "#34231F",
    borderRadius: 14,
    padding: 14,
  },
  empty: {
    alignItems: "center",
    padding: 28,
    gap: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: "dashed",
    borderRadius: 24,
  },
  tabs: {
    flexDirection: "row",
    padding: 5,
    backgroundColor: colors.card,
    borderRadius: 16,
    gap: 4,
  },
  tab: { flex: 1, padding: 12, alignItems: "center", borderRadius: 12 },
  activeTab: { backgroundColor: colors.raised },
  bottom: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  nav: { alignItems: "center", gap: 4, paddingHorizontal: 26, minHeight: 44 },
});
