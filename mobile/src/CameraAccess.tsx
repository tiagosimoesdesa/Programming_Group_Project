import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Modal, ScrollView, Text, View } from "react-native";
import { Camera, type PermissionResponse, PermissionStatus } from "expo-camera";
import { Button, colors, Icon, s } from "./ui";

type CameraAccess = {
  permission: PermissionResponse | null;
  requesting: boolean;
  requestPermission: () => Promise<void>;
};

const CameraAccessContext = createContext<CameraAccess | null>(null);
const unknownPermission: PermissionResponse = {
  granted: false,
  status: PermissionStatus.UNDETERMINED,
  canAskAgain: true,
  expires: "never",
};

export function useCameraAccess() {
  const access = useContext(CameraAccessContext);
  if (!access) throw new Error("Camera access requires a signed-in session.");
  return access;
}

export function CameraAccessProvider({
  children,
  offerSetup,
}: {
  children: React.ReactNode;
  offerSetup: boolean;
}) {
  const [permission, setPermission] = useState<PermissionResponse | null>(null);
  const [showSetup, setShowSetup] = useState(offerSetup);
  const [requesting, setRequesting] = useState(false);
  const permissionRequest = useRef({ inProgress: false, revision: 0 });

  useEffect(() => {
    let mounted = true;
    async function refreshPermission() {
      const { inProgress, revision } = permissionRequest.current;
      if (inProgress) return;
      const current = await Camera.getCameraPermissionsAsync().catch(
        () => null,
      );
      if (!mounted || revision !== permissionRequest.current.revision) return;
      // Some browsers can grant camera access without supporting permission queries.
      setPermission((previous) => current ?? previous ?? unknownPermission);
      if (
        current &&
        (current.status !== PermissionStatus.UNDETERMINED ||
          !current.canAskAgain)
      )
        setShowSetup(false);
    }
    void refreshPermission();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPermission();
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  async function requestPermission() {
    if (permissionRequest.current.inProgress) return;
    permissionRequest.current.inProgress = true;
    permissionRequest.current.revision += 1;
    setRequesting(true);
    try {
      setPermission(await Camera.requestCameraPermissionsAsync());
    } finally {
      permissionRequest.current.inProgress = false;
      setRequesting(false);
    }
  }

  function dismissSetup() {
    if (!permissionRequest.current.inProgress) setShowSetup(false);
  }

  return (
    <CameraAccessContext.Provider
      value={{ permission, requesting, requestPermission }}
    >
      {children}
      {showSetup && permission?.status === PermissionStatus.UNDETERMINED && (
        <Modal transparent visible onRequestClose={dismissSetup}>
          <View
            style={{
              flex: 1,
              backgroundColor: "#000000BB",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <ScrollView
              style={[
                s.card,
                {
                  flexGrow: 0,
                  width: "100%",
                  maxWidth: 440,
                  alignSelf: "center",
                },
              ]}
              contentContainerStyle={{ gap: 16 }}
            >
              <Icon name="camera-outline" color={colors.yellow} size={36} />
              <Text accessibilityRole="header" style={s.h2}>
                Set up your camera
              </Text>
              <Text style={s.body}>
                Enable camera access for drink photos and selfies during
                check-ins. You can also do this when you take your first photo.
              </Text>
              <Button
                title="Enable camera"
                loading={requesting}
                onPress={() => {
                  void requestPermission().then(dismissSetup, dismissSetup);
                }}
              />
              <Button
                title="Later"
                secondary
                disabled={requesting}
                onPress={dismissSetup}
              />
            </ScrollView>
          </View>
        </Modal>
      )}
    </CameraAccessContext.Provider>
  );
}
