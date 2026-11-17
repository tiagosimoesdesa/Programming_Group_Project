import React, { useEffect, useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { View } from "react-native";
import App from "./App";
import AuthScreen from "./src/AuthScreen";
import LoadingScreen from "./src/LoadingScreen";

type Screen = "welcome" | "login" | "register" | "app";
const screens: {
  id: Screen;
  title: string;
  subtitle: string;
  number: string;
}[] = [
  {
    id: "welcome",
    title: "Loading",
    subtitle: "Animated opening screen",
    number: "01",
  },
  { id: "login", title: "Log in", subtitle: "Login form", number: "02" },
  {
    id: "register",
    title: "Sign up",
    subtitle: "Registration form",
    number: "03",
  },
  {
    id: "app",
    title: "Live app",
    subtitle: "Use your real account",
    number: "↗",
  },
];
const devices = [
  { name: "iPhone", width: 390, height: 844 },
  { name: "Android", width: 412, height: 915 },
  { name: "Small phone", width: 320, height: 667 },
];

function ScreenPreview({
  screen,
  error,
}: {
  screen: Exclude<Screen, "app">;
  error: boolean;
}) {
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(false), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (screen === "welcome") return <LoadingScreen />;
  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: "#101110" }}>
        <AuthScreen
          initialScreen={screen}
          onLogin={async () => setNotice(true)}
          submitOverride={async () => {
            await new Promise((resolve) => setTimeout(resolve, 700));
            if (error)
              throw new Error(
                "Preview: something went wrong. Please try again.",
              );
          }}
        />
        {notice && (
          <div
            role="status"
            style={{
              position: "absolute",
              bottom: 16,
              left: 16,
              right: 16,
              padding: 16,
              background: "#c5b6ff",
              color: "#151612",
              borderRadius: 14,
              font: "600 13px system-ui",
              boxShadow: "0 6px 24px #0008",
            }}
          >
            Preview successful. No account or data was created.
          </div>
        )}
      </View>
    </SafeAreaProvider>
  );
}

export default function DesktopPreview() {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get("preview") === "phone";
  const initial = params.get("screen");
  const [screen, setScreen] = useState<Screen>(
    screens.some((s) => s.id === initial) ? (initial as Screen) : "welcome",
  );
  const [device, setDevice] = useState(0);
  const [fit, setFit] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState(false);
  const [size, setSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  useEffect(() => {
    const resize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    document.title = embedded
      ? "BEERREAL · Phone preview"
      : "BEERREAL · Design studio";
  }, [embedded]);
  if (embedded)
    return screen === "app" ? (
      <App />
    ) : (
      <ScreenPreview screen={screen} error={params.get("error") === "1"} />
    );
  const model = devices[device];
  const availableWidth = size.width > 900 ? size.width - 400 : size.width - 48;
  const scale = fit
    ? Math.max(
        0.25,
        Math.min(
          1,
          (size.height - 170) / (model.height + 20),
          availableWidth / (model.width + 24),
        ),
      )
    : 1;
  return (
    <div className="studio">
      <style>{css}</style>
      <header className="studio-header">
        <div className="studio-brand">
          BEER<span>REAL.</span>
          <b>DESIGN STUDIO</b>
        </div>
        <div className="studio-live">
          <i /> Local preview · auto-updates
        </div>
      </header>
      <div className="studio-layout">
        <aside className="studio-sidebar">
          <div className="studio-kicker">YOUR APP, UP CLOSE</div>
          <h1>
            Small screen.
            <br />
            <span>Big personality.</span>
          </h1>
          <p className="studio-description">
            The same screens as your phone, ready to explore on your desktop.
          </p>
          <label className="studio-label">SCREENS</label>
          <nav aria-label="Preview screen">
            {screens.map((item) => (
              <button
                key={item.id}
                className={`screen-link ${screen === item.id ? "selected" : ""}`}
                onClick={() => setScreen(item.id)}
              >
                <span className="screen-number">{item.number}</span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.subtitle}</small>
                </span>
                <span className="screen-arrow">→</span>
              </button>
            ))}
          </nav>
          <label className="studio-label" htmlFor="preview-device">
            PHONE SIZE
          </label>
          <select
            id="preview-device"
            value={device}
            onChange={(e) => setDevice(Number(e.target.value))}
          >
            {devices.map((d, i) => (
              <option value={i} key={d.name}>
                {d.name} · {d.width} × {d.height}
              </option>
            ))}
          </select>
          <div className="studio-options">
            <label>
              <input
                type="checkbox"
                checked={fit}
                onChange={(e) => setFit(e.target.checked)}
              />{" "}
              Fit to window
            </label>
            {screen !== "app" && (
              <label>
                <input
                  type="checkbox"
                  checked={error}
                  onChange={(e) => setError(e.target.checked)}
                />{" "}
                Simulate a form error
              </label>
            )}
          </div>
          <button
            className="studio-reset"
            onClick={() => setRefreshKey((n) => n + 1)}
          >
            ↻ Reset this screen
          </button>
          <div className="studio-note">
            <strong>
              {screen === "app"
                ? "Connected to your local backend"
                : "A safe space to experiment"}
            </strong>
            <p>
              {screen === "app"
                ? "Sign in to use real accounts and competitions. Refreshing clears this browser session. Webcam behavior differs from a phone."
                : "Buttons, forms, scrolling, and password visibility work. Preview submissions don’t create accounts. Choose Live app for real data."}
            </p>
          </div>
        </aside>
        <main className="studio-stage">
          <div className="stage-heading">
            <span>{screens.find((s) => s.id === screen)?.title}</span>
            <span>
              {model.width} × {model.height} · {Math.round(scale * 100)}%
            </span>
          </div>
          <div
            className="phone-space"
            style={{
              width: (model.width + 20) * scale,
              height: (model.height + 20) * scale,
            }}
          >
            <div
              className="phone-shell"
              style={{
                width: model.width,
                height: model.height,
                transform: `scale(${scale})`,
              }}
            >
              <div className="phone-status" aria-hidden="true">
                <span>9:41</span>
                <div className="phone-island" />
                <span>▴ ▰ ▰</span>
              </div>
              <iframe
                key={`${screen}-${refreshKey}-${error}`}
                title={`BEERREAL ${screen} mobile preview`}
                src={`/?preview=phone&screen=${screen}&error=${error ? "1" : "0"}`}
                allow="camera; microphone; clipboard-write"
                style={{ width: model.width, height: model.height - 54 }}
              />
              <div className="phone-home" aria-hidden="true">
                <span />
              </div>
            </div>
          </div>
          <p className="stage-caption">
            Click, type, and scroll inside the phone. Save a UI change to see it
            here.
          </p>
        </main>
      </div>
    </div>
  );
}

const css = `
html,body,#root{height:100%;margin:0}*{box-sizing:border-box}.studio{height:100%;overflow:auto;background:#171916;color:#f4f0e5;font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}.studio button,.studio select{font:inherit}.studio button{cursor:pointer}.studio button:focus-visible,.studio select:focus-visible{outline:2px solid #f5cb45;outline-offset:4px}.studio-header{height:76px;padding:0 32px;border-bottom:1px solid #30332b;display:flex;align-items:center;justify-content:space-between;gap:20px}.studio-brand{font-size:24px;font-weight:900;letter-spacing:-1px}.studio-brand>span{color:#f5cb45}.studio-brand b{font-size:10px;letter-spacing:2px;color:#a7ad9c;margin-left:25px;font-weight:600}.studio-live{font-size:12px;color:#adb39f;display:flex;gap:9px;align-items:center}.studio-live i{width:7px;height:7px;border-radius:50%;background:#b9d496}.studio-layout{display:flex;min-height:calc(100% - 76px)}.studio-sidebar{width:320px;flex-shrink:0;padding:32px 26px;border-right:1px solid #30332b}.studio-kicker{font-size:10px;letter-spacing:2px;color:#c5b6ff;font-weight:700}.studio h1{font-size:30px;line-height:1.15;letter-spacing:-1.2px;margin:14px 0}.studio h1 span{color:#f5cb45}.studio-description{font-size:13px;line-height:1.7;color:#a7ad9c;margin-bottom:27px}.studio-label{display:block;font-size:10px;letter-spacing:1.8px;color:#a7ad9c;margin:22px 0 11px;font-weight:700}.screen-link{width:100%;border:1px solid transparent;border-radius:13px;padding:12px;display:flex;text-align:left;align-items:center;gap:13px;background:transparent;color:#f4f0e5;margin-bottom:5px}.screen-link:hover{background:#22261e}.screen-link.selected{border-color:#605631;background:#302d1d}.screen-number{font-size:12px;color:#a1a68f}.selected .screen-number{color:#f5cb45}.screen-link strong{display:block;font-size:13px}.screen-link small{display:block;color:#a7ad9c;font-size:11px;margin-top:5px}.screen-arrow{margin-left:auto;color:#f5cb45}.studio select{width:100%;padding:12px;border:1px solid #414535;border-radius:10px;color:#f4f0e5;background:#20231d;font-size:12px}.studio-options{display:grid;gap:12px;margin:18px 0;font-size:12px;color:#bfc4b5}.studio-options label{display:flex;gap:8px;align-items:center}.studio input{accent-color:#f5cb45}.studio-reset{width:100%;background:#f5cb45;border:0;border-radius:11px;padding:12px;color:#171916;font-size:13px;font-weight:700!important}.studio-note{border-top:1px solid #30332b;margin-top:25px;padding-top:20px;font-size:11px;color:#a7ad9c;line-height:1.7}.studio-note strong{color:#c5b6ff;font-weight:600}.studio-note p{margin-bottom:0}.studio-stage{flex:1;min-width:0;display:flex;align-items:center;flex-direction:column;padding:20px 28px 24px;background:radial-gradient(ellipse at center,#30352644 0,transparent 65%),radial-gradient(#ffffff0c 1px,transparent 1px);background-size:auto,20px 20px}.stage-heading{display:flex;justify-content:space-between;width:100%;font-size:11px;color:#b0b5a5;margin-bottom:20px}.stage-heading span:first-child{font-size:12px;color:#f4f0e5;font-weight:600}.phone-space{flex-shrink:0;position:relative}.phone-shell{box-sizing:content-box;transform-origin:top left;border:10px solid #090a08;border-radius:48px;background:#101110;box-shadow:0 0 0 2px #45483d,0 24px 80px #0009;overflow:hidden}.phone-status{height:38px;display:flex;justify-content:space-between;align-items:center;padding:0 25px;position:relative;font-size:12px;font-weight:700;color:#f5f5ed}.phone-island{width:92px;height:23px;background:#030403;border-radius:30px;position:absolute;left:50%;transform:translateX(-50%);top:6px}.phone-shell iframe{display:block;border:0;background:#101110}.phone-home{height:16px;display:flex;align-items:center;justify-content:center}.phone-home span{width:108px;height:4px;border-radius:9px;background:#f4f0e5}.stage-caption{font-size:11px;color:#949c87;margin:18px 0 0;text-align:center;line-height:1.5}@media(max-width:900px){.studio-layout{flex-direction:column}.studio-sidebar{width:100%;border-right:0;border-bottom:1px solid #30332b;padding:20px}.studio-sidebar h1,.studio-description,.studio-kicker,.studio-note{display:none}.studio-sidebar nav{display:flex;flex-wrap:wrap;gap:6px}.screen-link{width:auto;flex:1;min-width:130px}.screen-link small,.screen-arrow{display:none}.studio-options{display:inline-flex;margin-right:20px}.studio-reset{width:auto}.studio-header{padding:0 20px}.studio-brand b,.studio-live{display:none}}
`;
