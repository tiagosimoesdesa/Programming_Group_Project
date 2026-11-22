import React, { useEffect, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BrandHeader } from "./Brand";
import LoadingScreen from "./LoadingScreen";
import NightBackdrop from "./NightBackdrop";
import {
  LegalSection,
  TERMS_EFFECTIVE_DATE,
  TERMS_INTRO,
  TERMS_SECTIONS,
  TERMS_VERSION,
} from "./legal";
import {
  hasAcceptedCurrentTerms,
  readTermsDecision,
  saveTermsDecision,
} from "./legalStorage";
import { Button, colors, ErrorText, Icon, s } from "./ui";

export function LegalSections({
  intro,
  sections,
}: {
  intro: string;
  sections: readonly LegalSection[];
}) {
  return (
    <View style={l.document}>
      <Text style={[s.body, l.intro]}>{intro}</Text>
      {sections.map((section) => (
        <View key={section.title} style={l.section}>
          <Text accessibilityRole="header" style={s.h2}>
            {section.title}
          </Text>
          {section.paragraphs?.map((paragraph) => (
            <Text key={paragraph} style={s.body}>
              {paragraph}
            </Text>
          ))}
          {section.bullets?.map((bullet) => (
            <View key={bullet} style={l.bulletRow}>
              <Text accessibilityElementsHidden style={l.bullet}>
                •
              </Text>
              <Text style={[s.body, l.bulletText]}>{bullet}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function TermsDocument() {
  return (
    <View style={l.document}>
      <View style={l.metaCard}>
        <Text style={s.eyebrow}>CURRENT DOCUMENT</Text>
        <Text style={s.h3}>Version {TERMS_VERSION}</Text>
        <Text style={s.small}>Effective {TERMS_EFFECTIVE_DATE}</Text>
      </View>
      <LegalSections intro={TERMS_INTRO} sections={TERMS_SECTIONS} />
    </View>
  );
}

function TermsReview({
  busy,
  error,
  onAccept,
  onDecline,
}: {
  busy: boolean;
  error: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [reachedEnd, setReachedEnd] = useState(false);

  function trackEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 24)
      setReachedEnd(true);
  }

  return (
    <View style={s.root}>
      <NightBackdrop />
      <View style={l.gateHeader}>
        <BrandHeader />
        <View style={l.titleBlock}>
          <Text style={s.eyebrow}>BEFORE YOU CONTINUE</Text>
          <Text accessibilityRole="header" style={s.h1}>
            Terms & Conditions
          </Text>
          <Text style={s.body}>
            Read the complete document and scroll to the end before accepting.
          </Text>
        </View>
      </View>
      <ScrollView
        accessibilityLabel="Terms and Conditions document"
        contentContainerStyle={l.scrollContent}
        onScroll={trackEnd}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
      >
        <View style={s.card}>
          <TermsDocument />
          <View style={l.endMarker}>
            <Icon name="checkmark-circle-outline" color={colors.green} />
            <Text style={s.small}>You have reached the end.</Text>
          </View>
        </View>
      </ScrollView>
      <View style={l.actions}>
        <Text accessibilityLiveRegion="polite" style={s.small}>
          {reachedEnd
            ? "You can now accept the current Terms & Conditions."
            : "Accept becomes available at the end of the document."}
        </Text>
        <ErrorText message={error} />
        <View style={l.actionRow}>
          <Button
            title="Decline"
            secondary
            disabled={busy}
            onPress={onDecline}
            style={l.actionButton}
          />
          <Button
            title="Accept"
            loading={busy}
            disabled={!reachedEnd}
            onPress={onAccept}
            style={l.actionButton}
          />
        </View>
      </View>
    </View>
  );
}

function Declined({
  warning,
  onReview,
}: {
  warning: string;
  onReview: () => void;
}) {
  return (
    <View style={s.root}>
      <NightBackdrop bubbles />
      <ScrollView contentContainerStyle={l.declined}>
        <BrandHeader />
        <View style={l.declinedCard}>
          <View style={l.declinedIcon}>
            <Icon name="heart-outline" size={34} color={colors.yellow} />
          </View>
          <Text accessibilityRole="header" style={[s.h1, l.center]}>
            We Understand Your Decision
          </Text>
          <Text style={[s.body, l.center]}>
            To use this app, you need to accept our Terms & Conditions. You can
            review them again whenever you&apos;re ready.
          </Text>
          <Text style={[s.h3, l.center]}>
            Thank you for your time. Have a great day!
          </Text>
          <ErrorText message={warning} />
          <Button title="Review Terms & Conditions" onPress={onReview} />
        </View>
      </ScrollView>
    </View>
  );
}

type GateState = "loading" | "terms" | "declined" | "accepted";

export default function TermsGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    readTermsDecision()
      .then((decision) => {
        if (!mounted) return;
        if (hasAcceptedCurrentTerms(decision)) setState("accepted");
        else if (
          decision?.status === "declined" &&
          decision.version === TERMS_VERSION
        )
          setState("declined");
        else setState("terms");
      })
      .catch(() => {
        if (!mounted) return;
        setError(
          "We could not read persistent storage. You can review the terms, but access stays blocked until acceptance can be saved.",
        );
        setState("terms");
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveTermsDecision("accepted");
      setState("accepted");
    } catch {
      setError(
        "We could not save your acceptance. Check that persistent storage is available and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await saveTermsDecision("declined");
    } catch {
      setError(
        "Your decision could not be saved on this device. Access remains blocked.",
      );
    } finally {
      setBusy(false);
      setState("declined");
    }
  }

  if (state === "loading") return <LoadingScreen />;
  if (state === "accepted") return <>{children}</>;
  if (state === "declined")
    return <Declined warning={error} onReview={() => setState("terms")} />;
  return (
    <TermsReview
      busy={busy}
      error={error}
      onAccept={() => void accept()}
      onDecline={() => void decline()}
    />
  );
}

const l = StyleSheet.create({
  document: { gap: 18 },
  intro: { fontWeight: "700" },
  section: { gap: 10 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  bullet: { color: colors.yellow, fontSize: 19, lineHeight: 24 },
  bulletText: { flex: 1 },
  metaCard: {
    gap: 5,
    borderLeftWidth: 3,
    borderLeftColor: colors.yellow,
    paddingLeft: 14,
  },
  gateHeader: { paddingHorizontal: 18, paddingTop: 12, gap: 16 },
  titleBlock: { gap: 7 },
  scrollContent: { padding: 18, paddingBottom: 28 },
  endMarker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actions: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  actionRow: { flexDirection: "row", gap: 10 },
  actionButton: { flex: 1 },
  declined: {
    flexGrow: 1,
    padding: 18,
    justifyContent: "center",
    gap: 26,
  },
  declinedCard: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderWidth: 1,
    borderColor: colors.goldLine,
    borderRadius: 24,
    backgroundColor: colors.card,
    padding: 24,
    gap: 20,
  },
  declinedIcon: {
    width: 68,
    height: 68,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 34,
    backgroundColor: colors.raised,
  },
  center: { textAlign: "center" },
});
