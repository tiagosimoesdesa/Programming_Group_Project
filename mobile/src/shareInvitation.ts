import { Platform, Share } from "react-native";

export async function shareInvitation(message: string) {
  if (Platform.OS === "web" && !navigator.share) {
    try {
      await navigator.clipboard.writeText(message);
      return true;
    } catch {
      throw new Error("Select and copy the invitation code to share it.");
    }
  }
  try {
    await Share.share({ message });
    return false;
  } catch (error) {
    if (Platform.OS === "web" && (error as Error).name === "AbortError")
      return false;
    throw error;
  }
}
