import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { Profile } from "./api";
import { nativeAnimationDriver, useMotionAllowed } from "./motion";

export const colors = {
  bg: "#0B0907",
  card: "#17130F",
  raised: "#231C16",
  yellow: "#FFC43A",
  text: "#FAF3E7",
  muted: "#C1B4A5",
  line: "#544537",
  goldLine: "#946A26",
  green: "#CBDDAA",
  red: "#FFB6A8",
};
export function formatJols(score: number) {
  return `${score} ${score === 1 ? "Jol" : "Jols"}`;
}
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
  compact,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Icon>["name"];
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
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
        compact && {
          minHeight: 48,
          paddingHorizontal: 9,
          paddingVertical: 9,
          gap: 6,
        },
        style,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? colors.text : colors.bg} />
      ) : (
        <>
          {icon && (
            <Icon
              name={icon}
              size={compact ? 18 : 22}
              color={secondary ? colors.text : colors.bg}
            />
          )}
          <Text
            style={[
              s.buttonText,
              compact && { fontSize: 13 },
              secondary && { color: colors.text },
            ]}
          >
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
        placeholderTextColor={colors.muted}
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
  fallback = true,
}: {
  user: Pick<Profile, "username" | "avatar_url">;
  size?: number;
  fallback?: boolean;
}) {
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const uri = user.avatar_url;
  return uri && unavailable !== uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel={`${user.username}'s avatar`}
      onError={() => setUnavailable(uri)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.raised,
      }}
    />
  ) : fallback ? (
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
      <Icon name="person-outline" size={size * 0.5} color={colors.muted} />
    </View>
  ) : null;
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
  const motionAllowed = useMotionAllowed();
  useEffect(() => {
    if (!motionAllowed) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    const entrance = Animated.timing(value, {
      toValue: 1,
      duration: 350,
      useNativeDriver: nativeAnimationDriver,
    });
    entrance.start();
    return () => entrance.stop();
  }, [trigger, motionAllowed, value]);
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
  content: { padding: 18, paddingBottom: 24, gap: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: {
    color: colors.text,
    fontSize: 22,
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
    fontSize: 36,
    lineHeight: 40,
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
    borderRadius: 28,
    backgroundColor: colors.yellow,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
  },
  buttonText: {
    flexShrink: 1,
    textAlign: "center",
    color: colors.bg,
    fontSize: 15,
    fontWeight: "800",
  },
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
    backgroundColor: colors.raised,
  },
  pillText: {
    color: colors.yellow,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
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
    borderRadius: 24,
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  activeTab: { borderBottomColor: colors.yellow },
  bottom: {
    flexDirection: "row",
    marginHorizontal: "5%",
    marginTop: 5,
    marginBottom: 7,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 40,
    backgroundColor: colors.raised,
  },
  nav: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderRadius: 36,
    minHeight: 49,
    paddingVertical: 4,
  },
});
