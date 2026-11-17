import type { Alert } from "react-native";
export const showAlert: typeof Alert.alert = (title, message, buttons) => {
  if (window.confirm(`${title}\n\n${message || ""}`)) {
    buttons?.find((button) => button.style !== "cancel")?.onPress?.();
  }
};
