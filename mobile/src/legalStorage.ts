import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { TERMS_VERSION } from "./legal";

export const TERMS_DECISION_KEY = "count-the-jols.terms-decision";

export type TermsDecision = {
  status: "accepted" | "declined";
  version: string;
  decidedAt: number;
};

function parseDecision(value: string | null): TermsDecision | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "status" in parsed &&
      (parsed.status === "accepted" || parsed.status === "declined") &&
      "version" in parsed &&
      typeof parsed.version === "string" &&
      "decidedAt" in parsed &&
      typeof parsed.decidedAt === "number" &&
      Number.isFinite(parsed.decidedAt)
    ) {
      return parsed as TermsDecision;
    }
  } catch {
    // Treat corrupt or legacy values as no decision so access remains gated.
  }
  return null;
}

function browserStorage() {
  const storage = globalThis.localStorage;
  if (!storage) throw new Error("Persistent browser storage is unavailable.");
  return storage;
}

export async function readTermsDecision(): Promise<TermsDecision | null> {
  const value =
    Platform.OS === "web"
      ? browserStorage().getItem(TERMS_DECISION_KEY)
      : await SecureStore.getItemAsync(TERMS_DECISION_KEY);
  return parseDecision(value);
}

export async function saveTermsDecision(
  status: TermsDecision["status"],
): Promise<TermsDecision> {
  const decision: TermsDecision = {
    status,
    version: TERMS_VERSION,
    decidedAt: Date.now(),
  };
  const value = JSON.stringify(decision);
  if (Platform.OS === "web")
    browserStorage().setItem(TERMS_DECISION_KEY, value);
  else await SecureStore.setItemAsync(TERMS_DECISION_KEY, value);
  return decision;
}

export function hasAcceptedCurrentTerms(decision: TermsDecision | null) {
  return decision?.status === "accepted" && decision.version === TERMS_VERSION;
}
