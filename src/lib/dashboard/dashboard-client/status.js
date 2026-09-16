



function pad(n) {
  return String(n).padStart(2, "0");
}

function formatClock(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

const EMPTY_SERVER = {
  hostname: "-",
  localIps: [],
  publicIp: "-",
  city: "",
  country: "",
  platform: "-",
  arch: "-",
  nodeVer: "-",
  pid: 0,
  cpuModel: "-",
  cpuCores: 0,
  loadavg: ["0.00", "0.00", "0.00"],
};

export function emptyStatus(now = Date.now()) {
  const date = new Date(now);
  return {
    botName: "Levatain",
    connected: false,
    uptime: "0j 00m 00d",
    plugins: 0,
    pluginBreakdown: {},
    owner: "-",
    memory: "0",
    memTotalMB: 0,
    memFreeMB: 0,
    memPct: "0",
    totalUsers: 0,
    totalGroups: 0,
    totalCommands: 0,
    topUsers: [],
    recentCommands: [],
    recentLogs: [],
    server: EMPTY_SERVER,
    clock: formatClock(date),
    dateLabel: formatDateLabel(date),
    activity: Array.from({ length: 24 }, () => 0),
  };
}

export function tickClock(prev, now = Date.now()) {
  const date = new Date(now);
  return { ...prev, clock: formatClock(date), dateLabel: formatDateLabel(date) };
}

export async function fetchDeckStatus(prev) {
  const date = new Date();
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();

    const totalCommands = d.totalCommands ?? 0;
    const delta = Math.max(0, totalCommands - (prev.totalCommands ?? 0));
    const activity = [...prev.activity.slice(1), Math.max(4, Math.min(100, delta * 10 + 4))];

    return {
      ...prev,
      botName: d.botName ?? "Levatain",
      connected: !!d.connected,
      uptime: d.uptime ?? "-",
      plugins: d.plugins ?? 0,
      pluginBreakdown: d.pluginBreakdown ?? {},
      owner: d.owner ?? "-",
      memory: d.memory ?? "0",
      memTotalMB: d.memTotalMB ?? 0,
      memFreeMB: d.memFreeMB ?? 0,
      memPct: d.memPct ?? "0",
      totalUsers: d.totalUsers ?? 0,
      totalGroups: d.totalGroups ?? 0,
      totalCommands,
      topUsers: d.topUsers ?? [],
      recentCommands: d.recentCommands ?? [],
      recentLogs: d.recentLogs ?? [],
      server: d.server ?? prev.server,
      clock: formatClock(date),
      dateLabel: formatDateLabel(date),
      activity,
    };
  } catch {
    return { ...prev, connected: false, clock: formatClock(date), dateLabel: formatDateLabel(date) };
  }
}
