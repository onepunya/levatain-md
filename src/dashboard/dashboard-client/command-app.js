
import React from "https://esm.sh/react@18";
import { createRoot } from "https://esm.sh/react-dom@18/client";
import { CommandDeck } from "./command-deck.js";
import { SpiderBuild } from "./spider-build.js";
import { useDeckStatus, useReducedMotion } from "./use-deck-status.js";

const { useCallback, useEffect, useState } = React;
const e = React.createElement;

function CommandApp() {
  const status = useDeckStatus();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState("build");
  const [buildKey, setBuildKey] = useState(0);

  useEffect(() => {
    document.title = `${status.botName} — Dek Komando`;
  }, [status.botName]);

  useEffect(() => {
    if (reduced) setPhase("deck");
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

  const finishBuild = useCallback(() => {
    setPhase("deck");
  }, []);

  const replay = useCallback(() => {
    window.scrollTo(0, 0);
    setBuildKey((k) => k + 1);
    setPhase("build");
  }, []);

  return e(
    React.Fragment,
    null,
    e(CommandDeck, { status, onReplay: replay, showReplay: !reduced }),
    phase === "build" && !reduced ? e(SpiderBuild, { key: buildKey, onDone: finishBuild }) : null,
  );
}

createRoot(document.getElementById("root")).render(e(CommandApp));
