
import React from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import { CommandDeck } from "./command-deck.js";
import { WelcomeBoot } from "./welcome-boot.js";
import { useDeckStatus, useReducedMotion } from "./use-deck-status.js";

const { useCallback, useEffect, useState } = React;
const e = React.createElement;

const SEEN_KEY = "nexus-boot-seen";

function CommandApp() {
  const status = useDeckStatus();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState("boot");
  const [bootKey, setBootKey] = useState(0);

  useEffect(() => {
    document.title = `${status.botName} — Dek Komando`;
  }, [status.botName]);

  useEffect(() => {
    const seen = sessionStorage.getItem(SEEN_KEY) === "1";
    if (reduced || seen) setPhase("deck");
  }, [reduced]);

  useEffect(() => {
    const move = (ev) => {
      const t = ev.target.closest ? ev.target.closest(".card,.panel") : null;
      if (!t) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty("--mx", ev.clientX - r.left + "px");
      t.style.setProperty("--my", ev.clientY - r.top + "px");
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);

  const finishBoot = useCallback(() => {
    sessionStorage.setItem(SEEN_KEY, "1");
    setPhase("deck");
  }, []);

  const replay = useCallback(() => {
    sessionStorage.removeItem(SEEN_KEY);
    setBootKey((k) => k + 1);
    setPhase("boot");
  }, []);

  return e(
    React.Fragment,
    null,
    e(CommandDeck, { status, onReplay: replay, showReplay: !reduced }),
    phase === "boot" && !reduced ? e(WelcomeBoot, { key: bootKey, onDone: finishBoot }) : null,
  );
}

createRoot(document.getElementById("root")).render(e(CommandApp));
