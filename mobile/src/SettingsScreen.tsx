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
import { Avatar, Button, colors, ErrorText, Icon, Input, s } from "./ui";

type Props = {
  profile: Profile;
  privacy: boolean;
  busy: boolean;
  error: string;
  onBack: () => void;
  onPrivacy: () => void;
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
  privacy,
  busy,
  error,
  onBack,
  onPrivacy,
  onChangeUsername,
  onChangeAvatar,
  onSignOut,
}: Props) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={s.root}
    >
      <ScrollView
        key={privacy ? "privacy" : "settings"}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.row}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              privacy ? "Back to settings" : "Back to profile"
            }
            disabled={busy}
            onPress={onBack}
            style={s.iconButton}
          >
            <Icon name="arrow-back" color={colors.yellow} />
          </Pressable>
          <Text accessibilityRole="header" style={s.h1}>
            {privacy ? "Privacy" : "Settings"}
          </Text>
        </View>
        {privacy ? (
          <View style={s.card}>
            <Text accessibilityRole="header" style={s.h2}>
              Who can see my photos?
            </Text>
            <Text style={s.h3}>Invite-only nights</Text>
            <Text style={s.body}>
              People who join a night can see the photos shared in that night.
              Finished nights and their photos are available to members in their
              history.
            </Text>
            <Text style={s.h3}>Invited spectators</Text>
            <Text style={s.body}>
              Where spectator invites are available, spectators can see and
              react to photos in the night they join. Posting and scoring are
              for players.
            </Text>
            <Text style={s.h3}>Battle visibility</Text>
            <Text style={s.body}>
              The host can hide opposing teams’ scores and photos during a
              Battle. When the Battle ends, both teams can see the results and
              photos.
            </Text>
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
