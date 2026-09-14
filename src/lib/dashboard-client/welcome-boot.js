
import React from "https://esm.sh/react@18";
import { HudMark } from "./hud-mark.js";

const { useEffect, useRef } = React;
const e = React.createElement;

const CHECKS = [
  { key: "kernel", label: "kernel", value: "ok" },
  { key: "uplink", label: "tautan", value: "ok" },
  { key: "plugins", label: "plugin", value: "47" },
  { key: "telemetry", label: "telemetri", value: "ok" },
];

export function WelcomeBoot({ onDone }) {
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  useEffect(() => {
    const t = setTimeout(finish, 3550);
    const onKey = (ev) => {
      if (ev.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return e(
    "div",
    { className: "boot", role: "dialog", "aria-label": "Animasi sambutan LEVATAIN", "aria-live": "polite" },
    e("p", { className: "kicker" }, "sys / boot"),
    e(HudMark, null),
    e(
      "h1",
      null,
      "LEVATAIN".split("").map((ch, i) => e("span", { key: `${ch}-${i}`, className: "boot-letter" }, ch)),
    ),
    e("p", { className: "sub" }, "dek komando"),
    e(
      "ul",
      { className: "checks" },
      CHECKS.map((row) => e("li", { key: row.key }, e("span", null, row.label), e("b", null, row.value))),
    ),
    e(
      "div",
      { className: "barwrap" },
      e("div", { className: "track" }, e("div", { className: "fill fillbar" })),
      e("span", { className: "pct" }, "100"),
    ),
    e("p", { className: "ready" }, "sistem siap"),
    e("button", { type: "button", className: "skip", onClick: finish }, "Lewati"),
  );
}
