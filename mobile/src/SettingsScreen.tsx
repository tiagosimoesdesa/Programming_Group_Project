import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { Profile } from "./api";
import { useCameraAccess } from "./CameraAccess";
import { LegalSections, TermsDocument } from "./TermsAndConditions";
import { PRIVACY_INTRO, PRIVACY_SECTIONS } from "./legal";
import { Avatar, Button, colors, ErrorText, Icon, Input, s } from "./ui";

type Props = {
  profile: Profile;
  page: "main" | "privacy" | "terms";
  busy: boolean;
  error: string;
  onBack: () => void;
  onPrivacy: () => void;
  onTerms: () => void;
  onChangeUsername: (username: string) => void;
  onChangeAvatar: () => void;
  onSignOut: () => void;
};

function UsernameForm({
  savedUsername,
  disabled,
  onSave,
}: {
  savedUsername: string;
  disabled: boolean;
  onSave: (username: string) => void;
}) {
  const [username, setUsername] = useState(savedUsername);
  const canSave =
    /^[A-Za-z0-9_]{3,24}$/.test(username) &&
    username.toLowerCase() !== savedUsername;

  return (
    <>
      <Input
        label="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={24}
        editable={!disabled}
        returnKeyType="done"
        onSubmitEditing={() => {
          if (!disabled && canSave) onSave(username);
        }}
      />
      <Text style={s.small}>
        Use 3–24 letters, numbers, or underscores. Use your new username next
        time you sign in.
      </Text>
      <Button
        title="Save username"
        disabled={disabled || !canSave}
        onPress={() => onSave(username)}
      />
    </>
  );
}

function Permissions() {
  const { permission, requesting, requestPermission } = useCameraAccess();
  const [error, setError] = useState("");
  const web = Platform.OS === "web";
  const enabled = permission?.granted;
  const openDeviceSettings = !web && (enabled || !permission?.canAskAgain);

  async function manageCamera() {
    setError("");
    try {
      if (openDeviceSettings) await Linking.openSettings();
      else await requestPermission();
    } catch {
      setError("Check camera access in your settings and try again.");
    }
  }

  return (
    <View style={s.card}>
      <Text accessibilityRole="header" style={s.h2}>
        Permissions
      </Text>
      <View style={s.between}>
        <Text style={s.h3}>Camera</Text>
        <Text accessibilityLiveRegion="polite" style={s.small}>
          {permission ? (enabled ? "Allowed" : "Not allowed") : "Checking…"}
        </Text>
      </View>
      <Text style={s.body}>
        Camera access lets you take both check-in photos.
      </Text>
      {web && (
        <Text style={s.small}>
          Manage camera access in your browser’s site settings, then reload the
          app to see the updated status.
        </Text>
      )}
      <ErrorText message={error} />
      {permission && (!web || !enabled) && (
        <Button
          title={openDeviceSettings ? "Open device settings" : "Allow camera"}
          secondary
          loading={requesting}
          onPress={() => void manageCamera()}
        />
      )}
      <View style={s.divider} />
      <Text style={s.h3}>Photo library</Text>
      <Text style={s.body}>
        The photo library is used when you choose a profile photo. Check-ins use
        the camera.
      </Text>
    </View>
  );
}

export default function SettingsScreen({
  profile,
  page,
  busy,
  error,
  onBack,
  onPrivacy,
  onTerms,
  onChangeUsername,
  onChangeAvatar,
  onSignOut,
}: Props) {
  const documentTitle =
    page === "privacy"
      ? "Privacy"
      : page === "terms"
        ? "Terms & Conditions"
        : "Settings";
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.root}
    >
      <ScrollView
        key={page}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              page === "main" ? "Back to profile" : "Back to settings"
            }
            disabled={busy}
            onPress={onBack}
            style={s.iconButton}
          >
            <Icon name="arrow-back" color={colors.yellow} />
          </Pressable>
          <Text accessibilityRole="header" style={s.h1}>
            {documentTitle}
          </Text>
        </View>
        {page === "privacy" ? (
          <View style={s.card}>
            <LegalSections intro={PRIVACY_INTRO} sections={PRIVACY_SECTIONS} />
          </View>
        ) : page === "terms" ? (
          <View style={s.card}>
            <TermsDocument />
          </View>
        ) : (
          <>
            <View style={s.card}>
              <Text accessibilityRole="header" style={s.h2}>
                Edit profile
              </Text>
              <View style={s.row}>
                <Avatar user={profile} size={56} />
                <Button
                  title="Change profile photo"
                  secondary
                  compact
                  disabled={busy}
                  onPress={onChangeAvatar}
                  style={{ flexShrink: 1 }}
                />
              </View>
              <View style={s.divider} />
              <ErrorText message={error} />
              <UsernameForm
                key={profile.username}
                savedUsername={profile.username}
                disabled={busy}
                onSave={onChangeUsername}
              />
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onPrivacy}
              style={({ pressed }) => [
                s.card,
                s.between,
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.h2}>Privacy</Text>
                <Text style={s.body}>Who can see my photos?</Text>
              </View>
              <Icon name="chevron-forward" color={colors.muted} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={onTerms}
              style={({ pressed }) => [
                s.card,
                s.between,
                pressed && { opacity: 0.8 },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.h2}>Terms & Conditions</Text>
                <Text style={s.body}>Read the current agreement</Text>
              </View>
              <Icon name="chevron-forward" color={colors.muted} />
            </Pressable>
            <Permissions />
            <View style={s.card}>
              <Text accessibilityRole="header" style={s.h2}>
                Account
              </Text>
              <Button
                title="Sign out"
                secondary
                disabled={busy}
                onPress={onSignOut}
              />
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
