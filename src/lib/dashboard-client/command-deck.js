
import React from "https://esm.sh/react@18";
import { HudMark } from "./hud-mark.js";

const { useMemo } = React;
const e = React.createElement;

function fmt(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

function SectionLabel({ children }) {
  return e("h2", { className: "label" }, children);
}

function LiveBadge({ connected }) {
  return e(
    "span",
    { className: "badge " + (connected ? "on" : "off") },
    e("span", { className: "dot " + (connected ? "on" : "off") }),
    connected ? "Live" : "Off",
  );
}

function MetricCard({ label, value, hint, small }) {
  return e(
    "article",
    { className: "card" },
    e("p", { className: "lbl" }, label),
    e("p", { className: "val" + (small ? " small" : "") }, value),
    hint ? e("p", { className: "hint" }, hint) : null,
  );
}

function BarRow({ label, value, pct }) {
  const width = Math.max(2, Math.min(100, pct));
  return e(
    "div",
    null,
    e("div", { className: "barlbl" }, e("span", null, label), e("b", null, value)),
    e("div", { className: "track" }, e("div", { className: "fill", style: { width: width + "%" } })),
  );
}

function Sparkline({ values }) {
  const w = 240;
  const h = 64;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(1, max - min);
  const pts = values
    .map((v, i) => {
      const x = values.length === 1 ? 0 : (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastY = values.length ? h - ((values[values.length - 1] - min) / span) * (h - 8) - 4 : h;

  return e(
    "svg",
    { viewBox: `0 0 ${w} ${h}`, className: "sparkline" },
    e("polygon", { fill: "currentColor", opacity: 0.12, points: `0,${h} ${pts} ${w},${h}` }),
    e("polyline", {
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.5,
      strokeLinejoin: "round",
      strokeLinecap: "round",
      points: pts,
    }),
    e("circle", { cx: w, cy: lastY, r: 2.4, fill: "currentColor" }),
  );
}

function LogPanel({ title, empty, rows }) {
  return e(
    "section",
    null,
    e(SectionLabel, null, title),
    e(
      "div",
      { className: "panel loglist" },
      rows.length ? rows : e("p", { className: "empty" }, empty),
    ),
  );
}

export function CommandDeck({ status, onReplay, showReplay = true }) {
  const s = status.server;
  const localStr = (s.localIps || []).map((l) => l.address).join(" · ") || "—";
  const pluginEntries = useMemo(
    () => Object.entries(status.pluginBreakdown || {}).sort((a, b) => b[1] - a[1]),
    [status.pluginBreakdown],
  );
  const pluginMax = pluginEntries[0]?.[1] ?? 1;

  return e(
    "div",
    { className: "page mono" },
    e(
      "header",
      { className: "top" },
      e(
        "div",
        null,
        e(
          "div",
          { className: "brand" },
          e("h1", null, status.botName),
          e(LiveBadge, { connected: status.connected }),
        ),
        e(
          "p",
          { className: "serverline" },
          e("b", null, s.hostname),
          " · Publik ",
          e("b", null, s.publicIp || "mendeteksi..."),
          s.city ? ` (${s.city}, ${s.country})` : "",
          " · Lokal ",
          localStr,
          " · ",
          s.platform,
          " (",
          s.arch,
          ") · Node ",
          s.nodeVer,
          " · PID ",
          s.pid,
        ),
      ),
      e(
        "div",
        { style: { display: "flex", alignItems: "center" } },
        e(
          "div",
          { className: "clockbox" },
          e("p", { className: "clock" }, status.clock),
          e("p", { className: "date" }, status.dateLabel, " · WIB"),
        ),
        showReplay
          ? e(
              "button",
              { type: "button", className: "replay", onClick: onReplay },
              "Intro",
            )
          : null,
      ),
    ),

    e(SectionLabel, null, "Ringkasan"),
    e(
      "div",
      { className: "grid-metrics" },
      e(MetricCard, { label: "Status", value: status.connected ? "Terhubung" : "Terputus", hint: "tautan utama" }),
      e(MetricCard, { label: "Uptime", value: status.uptime, hint: "sejak boot" }),
      e(MetricCard, { label: "Plugin", value: String(status.plugins), hint: "modul aktif" }),
      e(MetricCard, { label: "Pengguna", value: fmt(status.totalUsers), hint: "tercatat" }),
      e(MetricCard, { label: "Grup", value: String(status.totalGroups), hint: "ruang aktif" }),
      e(MetricCard, { label: "Perintah", value: fmt(status.totalCommands), hint: "total dijalankan" }),
      e(MetricCard, { label: "Memori proses", value: `${status.memory} MB`, hint: "RSS" }),
      e(MetricCard, { label: "Pemilik", value: status.owner, hint: "nomor owner", small: true }),
    ),

    e(SectionLabel, null, "Sumber daya"),
    e(
      "div",
      { className: "res-grid" },
      e(
        "div",
        { className: "panel" },
        e(BarRow, {
          label: "RAM sistem",
          value: `${status.memPct}% (${status.memTotalMB - status.memFreeMB} / ${status.memTotalMB} MB)`,
          pct: Number(status.memPct),
        }),
        e(
          "div",
          { className: "cpurow" },
          e("span", null, "Beban CPU"),
          e("span", null, (s.loadavg || []).join(" / "), " · ", s.cpuCores, " core"),
        ),
        e("p", { className: "cpumodel" }, s.cpuModel),
      ),
      e(
        "div",
        { className: "panel" },
        e("div", { className: "barlbl" }, e("span", null, "Aktivitas")),
        e(Sparkline, { values: status.activity }),
        e(
          "p",
          { className: "barlbl", style: { marginTop: 8 } },
          e("span", null, "volume perintah · 24 tick"),
          e("b", null, status.activity[status.activity.length - 1]),
        ),
      ),
    ),

    e(
      "div",
      { className: "cols2" },
      e(
        "section",
        null,
        e(SectionLabel, null, "Plugin per kategori"),
        e(
          "div",
          { className: "panel taglist" },
          pluginEntries.length
            ? pluginEntries.map(([tag, count]) =>
                e(
                  "div",
                  { className: "tagrow", key: tag },
                  e("div", { className: "th" }, e("span", null, tag), e("span", null, count)),
                  e("div", { className: "track" }, e("div", { className: "fill", style: { width: (count / pluginMax) * 100 + "%" } })),
                ),
              )
            : e("p", { className: "empty" }, "Belum ada data"),
        ),
      ),
      e(
        "section",
        null,
        e(SectionLabel, null, "Pengguna teratas"),
        e(
          "div",
          { className: "panel" },
          e(
            "table",
            null,
            e(
              "thead",
              null,
              e(
                "tr",
                null,
                e("th", null, "#"),
                e("th", null, "User"),
                e("th", { style: { textAlign: "right" } }, "Perintah"),
              ),
            ),
            e(
              "tbody",
              null,
              status.topUsers.length
                ? status.topUsers.map((u, i) =>
                    e(
                      "tr",
                      { key: u.id },
                      e("td", null, i + 1),
                      e("td", null, e("p", { className: "uid" }, u.id), e("p", { className: "uname" }, u.name)),
                      e("td", { className: "hit" }, fmt(u.hit)),
                    ),
                  )
                : e("tr", null, e("td", { colSpan: 3, className: "empty" }, "Belum ada aktivitas")),
            ),
          ),
        ),
      ),
    ),

    e(
      "div",
      { className: "cols2" },
      e(LogPanel, {
        title: "Aktivitas terbaru",
        empty: "Belum ada perintah",
        rows: status.recentCommands.map((c, i) =>
          e(
            "div",
            { className: "logrow", key: `${c.time}-${c.cmd}-${i}` },
            e("span", { className: "t" }, c.time),
            e("span", null, c.cmd, e("span", { style: { color: "var(--muted)" } }, " · ", c.sender)),
          ),
        ),
      }),
      e(LogPanel, {
        title: "Log terbaru",
        empty: "Belum ada log",
        rows: status.recentLogs.map((l, i) =>
          e(
            "div",
            { className: "logrow", key: `${l.time}-${l.msg}-${i}` },
            e("span", { className: "t" }, l.time),
            e("span", { className: "lvl " + l.level }, l.level),
            e("span", null, l.msg),
          ),
        ),
      }),
    ),

    e(
      "footer",
      { className: "bottom" },
      e("span", null, s.hostname, " · sinkron tiap 3 detik"),
      e("span", null, "LEVATAIN dek komando"),
    ),
  );
}
