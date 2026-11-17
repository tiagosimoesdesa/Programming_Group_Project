import { Alert } from "react-native";
export const showAlert: typeof Alert.alert = (...args) => Alert.alert(...args);
