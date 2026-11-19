import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";

export const nativeAnimationDriver = Platform.OS !== "web";

export function useMotionAllowed() {
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let subscribed = true;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (subscribed) setReduceMotion(value);
    });
    return () => {
      subscribed = false;
      subscription?.remove();
    };
  }, []);
  return !reduceMotion;
}
