
import React from "https://esm.sh/react@18";
import { emptyStatus, fetchDeckStatus, tickClock } from "./status.js";

const { useEffect, useRef, useState } = React;

const POLL_MS = 3000;

export function useDeckStatus() {
  const [status, setStatus] = useState(() => emptyStatus());
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const next = await fetchDeckStatus(statusRef.current);
      if (!cancelled) setStatus(next);
    }

    poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStatus((prev) => tickClock(prev));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return status;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return reduced;
}
