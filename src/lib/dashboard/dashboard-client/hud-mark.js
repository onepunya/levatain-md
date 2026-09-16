
import React from "https://esm.sh/react@18";

const e = React.createElement;

export function HudMark({ size = 64 } = {}) {
  return e(
    "svg",
    { viewBox: "0 0 64 64", style: { width: size, height: size, color: "var(--accent)" } },
    e("circle", { cx: 32, cy: 32, r: 26, fill: "none", stroke: "currentColor", strokeWidth: 1.7 }),
    e("circle", { cx: 32, cy: 32, r: 15, fill: "none", stroke: "currentColor", strokeWidth: 1.15, opacity: 0.5 }),
    e("circle", { cx: 32, cy: 32, r: 4.2, fill: "currentColor" }),
  );
}
