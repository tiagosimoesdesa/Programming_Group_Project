import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from "react-native";
import { authenticate } from "./api";
import { colors, ErrorText, Icon, s } from "./ui";
import { BeerGlass, Wordmark } from "./Brand";
import LoadingScreen from "./LoadingScreen";
import NightBackdrop from "./NightBackdrop";

export default function AuthScreen({
  onLogin,
  initialScreen = "login",
  submitOverride,
}: {
  onLogin: () => Promise<void>;
  initialScreen?: "welcome" | "login" | "register";
  submitOverride?: () => Promise<void>;
}) {
  const [loadingIntro, setLoadingIntro] = useState(initialScreen === "welcome");
  const [register, setRegister] = useState(initialScreen === "register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState<"username" | "password" | null>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const passwordLength = Array.from(password).length;
  const passwordLengthValid = passwordLength >= 7 && passwordLength <= 128;
  const passwordHasNumber = /\p{Number}/u.test(password);
  const passwordHasSpecial =
    /[^\p{Letter}\p{Number}\p{White_Space}\u001c-\u001f]/u.test(password);
  const passwordValid =
    passwordLengthValid &&
    (!register || (passwordHasNumber && passwordHasSpecial));
  const valid =
    /^[a-zA-Z0-9_]{3,24}$/.test(username.trim()) &&
    passwordValid &&
    (!register || adult);
  useEffect(() => {
    if (!loadingIntro) return;
    const timer = setTimeout(() => setLoadingIntro(false), 1200);
    return () => clearTimeout(timer);
  }, [loadingIntro]);
  function switchMode(create: boolean) {
    if (busy) return;
    setRegister(create);
    setError("");
    setShowPassword(false);
  }
  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      if (submitOverride) await submitOverride();
      else await authenticate(username, password, register);
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loadingIntro) return <LoadingScreen />;
  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <NightBackdrop />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={a.page}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={a.brand}>
          <BeerGlass height={78} />
          <Wordmark />
        </View>
        <View style={a.form}>
          <View accessibilityRole="tablist" style={a.tabs}>
            {[
              { label: "Log in", create: false },
              { label: "Sign up", create: true },
            ].map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="tab"
                accessibilityState={{ selected: register === item.create }}
                disabled={busy}
                onPress={() => switchMode(item.create)}
                style={[a.tab, register === item.create && a.selectedTab]}
              >
                <Text
                  style={[
                    a.tabText,
                    register === item.create && a.selectedText,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={a.fieldGroup}>
            <Text style={a.label}>Username</Text>
            <View style={[a.field, focused === "username" && a.focused]}>
              <TextInput
                accessibilityLabel="Username"
                accessibilityHint="3 to 24 letters, numbers, or underscores"
                value={username}
                onChangeText={setUsername}
                placeholder="Username"
                placeholderTextColor={colors.muted}
                selectionColor={colors.yellow}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={24}
                textContentType="username"
                autoComplete="username"
                editable={!busy}
                onFocus={() => setFocused("username")}
                onBlur={() => setFocused(null)}
                returnKeyType="next"
                onSubmitEditing={() => passwordInput.current?.focus()}
                style={a.input}
              />
            </View>
          </View>
          <View style={a.fieldGroup}>
            <Text style={a.label}>Password</Text>
            <View style={[a.field, focused === "password" && a.focused]}>
              <TextInput
                ref={passwordInput}
                accessibilityLabel="Password"
                accessibilityHint={
                  register
                    ? "At least 7 characters, including a number and a special character"
                    : undefined
                }
                value={password}
                onChangeText={setPassword}
                placeholder={register ? "At least 7 characters" : "Password"}
                placeholderTextColor={colors.muted}
                selectionColor={colors.yellow}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType={register ? "newPassword" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                editable={!busy}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                style={a.input}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                disabled={busy}
                onPress={() => setShowPassword(!showPassword)}
                style={a.reveal}
              >
                <Icon
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={colors.muted}
                />
              </Pressable>
            </View>
            {register && (
              <Text style={a.hint}>
                Use at least 7 characters, including a number and a special
                character.
              </Text>
            )}
          </View>
          {register && (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: adult, disabled: busy }}
              disabled={busy}
              onPress={() => setAdult(!adult)}
              style={a.ageRow}
            >
              <View style={[a.checkbox, adult && a.checked]}>
                {adult && <Icon name="checkmark" size={16} color={colors.bg} />}
              </View>
              <Text style={a.ageText}>
                I'm of legal drinking age where I live.
              </Text>
            </Pressable>
          )}
          <ErrorText message={error} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={register ? "Sign up" : "Log in"}
            accessibilityState={{ disabled: !valid || busy, busy }}
            disabled={!valid || busy}
            onPress={() => void submit()}
            style={({ pressed }) => [
              a.submit,
              (!valid || busy) && { opacity: 0.45 },
              pressed && { opacity: 0.8 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={a.submitText}>
                {register ? "Sign up" : "Log in"}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const a = StyleSheet.create({
  page: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 27,
    paddingBottom: 36,
  },
  brand: { alignItems: "center", gap: 14, marginBottom: 29 },
  form: { width: "100%", maxWidth: 390, alignSelf: "center", gap: 17 },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    marginBottom: 9,
  },
  tab: {
    flex: 1,
    minHeight: 49,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  },
  selectedTab: { borderBottomColor: colors.yellow },
  tabText: { color: colors.muted, fontSize: 16, fontWeight: "600" },
  selectedText: { color: colors.yellow },
  fieldGroup: { gap: 10 },
  label: { fontSize: 13, fontWeight: "500", color: colors.text },
  field: {
    minHeight: 55,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
  },
  focused: { borderColor: colors.yellow },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    fontSize: 15,
    color: colors.text,
  },
  reveal: {
    minWidth: 48,
    minHeight: 53,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  ageRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 1,
    borderColor: colors.muted,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: colors.yellow, borderColor: colors.yellow },
  ageText: { flex: 1, fontSize: 13, lineHeight: 20, color: colors.muted },
  submit: {
    minHeight: 55,
    padding: 16,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.yellow,
    marginTop: 3,
  },
  submitText: { fontSize: 16, fontWeight: "700", color: colors.bg },
});
