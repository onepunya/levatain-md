import http from 'http';
import os from 'os';
import { logger, recentCommands, recentLogs } from './logger.js';
import { getLocalIps, getHostname, getCachedIpInfo, lookupPublicIp } from './iplookup.js';

const startTime = Date.now();

function formatUptime(ms) {
    const s   = Math.floor(ms / 1000);
    const d   = Math.floor(s / 86400);
    const h   = Math.floor((s % 86400) / 3600);
    const m   = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (d > 0 ? d + 'h ' : '') + h + 'j ' + m + 'm ' + sec + 'd';
}

function pluginBreakdown() {
    const plugins = global.plugins;
    if (!plugins || !plugins.size) return {};
    const byTag = {};
    const seen = new Set();
    for (const [, p] of plugins) {
        if (seen.has(p.run)) continue;
        seen.add(p.run);
        const tag = p.meta?.interface?.tag || 'lainnya';
        byTag[tag] = (byTag[tag] || 0) + 1;
    }
    return byTag;
}

function topUsers(db, limit = 5) {
    return Object.entries(db.users || {})
        .map(([id, u]) => ({ id: id.replace(/@.+/, ''), name: u.name || 'User', hit: u.hit || 0 }))
        .sort((a, b) => b.hit - a.hit)
        .filter(u => u.hit > 0)
        .slice(0, limit);
}

function getStatus() {
    const db = global.db || { users: {}, groups: {} };
    const totalCommands = Object.values(db.users || {}).reduce((sum, u) => sum + (u.hit || 0), 0);
    const ipInfo = getCachedIpInfo();
    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();

    return {
        botName:      global.botName || 'Bot',
        connected:    !!global.botConnected,
        uptime:       formatUptime(Date.now() - startTime),
        plugins:      global.plugins?.size || 0,
        pluginBreakdown: pluginBreakdown(),
        owner:        global.owner || '(belum diset)',
        memory:       (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
        memTotalMB:   Number((totalMem / 1024 / 1024).toFixed(0)),
        memFreeMB:    Number((freeMem / 1024 / 1024).toFixed(0)),
        memPct:       (((totalMem - freeMem) / totalMem) * 100).toFixed(1),
        totalUsers:   Object.keys(db.users || {}).length,
        totalGroups:  Object.keys(db.groups || {}).length,
        totalCommands,
        topUsers:     topUsers(db),
        recentCommands,
        recentLogs:   recentLogs.slice(0, 15),
        server: {
            hostname:  getHostname(),
            localIps:  getLocalIps(),
            publicIp:  ipInfo.publicIp,
            city:      ipInfo.city,
            country:   ipInfo.country,
            isp:       ipInfo.isp,
            platform:  `${os.platform()} ${os.release()}`,
            arch:      os.arch(),
            nodeVer:   process.version,
            pid:       process.pid,
            cpuModel:  os.cpus()?.[0]?.model || '-',
            cpuCores:  os.cpus()?.length || 0,
            loadavg:   load.map(n => n.toFixed(2)),
        },
    };
}

const CLIENT_JS = [
'function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]; }); }',
'',
'async function refresh() {',
'  try {',
'    const res = await fetch("/api/status");',
'    const d = await res.json();',
'',
'    document.getElementById("dot").className = "dot " + (d.connected ? "on" : "off");',
'',
'    const s = d.server;',
'    const localStr = (s.localIps && s.localIps.length) ? s.localIps.map(function(l){return l.address;}).join(", ") : "-";',
'    document.getElementById("serverline").innerHTML =',
'      s.hostname + " &middot; Publik: <b>" + (s.publicIp || "mendeteksi...") + (s.city ? " (" + s.city + ", " + s.country + ")" : "") + "</b> &middot; Lokal: " + localStr + " &middot; " + s.platform + " (" + s.arch + ") &middot; Node " + s.nodeVer + " &middot; PID " + s.pid;',
'',
'    document.getElementById("grid").innerHTML =',
'      \'<div class="card"><div class="label">Status</div><div class="value">\' + (d.connected ? "Connected" : "Disconnected") + \'</div></div>\' +',
'      \'<div class="card"><div class="label">Uptime</div><div class="value small">\' + d.uptime + \'</div></div>\' +',
'      \'<div class="card"><div class="label">Plugins</div><div class="value">\' + d.plugins + \'</div></div>\' +',
'      \'<div class="card"><div class="label">Users</div><div class="value">\' + d.totalUsers + \'</div></div>\' +',
'      \'<div class="card"><div class="label">Groups</div><div class="value">\' + d.totalGroups + \'</div></div>\' +',
'      \'<div class="card"><div class="label">Commands Run</div><div class="value">\' + d.totalCommands + \'</div></div>\' +',
'      \'<div class="card"><div class="label">Memory Proses</div><div class="value">\' + d.memory + \' MB</div></div>\' +',
'      \'<div class="card"><div class="label">Owner</div><div class="value small">\' + esc(d.owner) + \'</div></div>\';',
'',
'    document.getElementById("resources").innerHTML =',
'      \'<div class="bar-wrap"><div class="bar-row"><span>RAM Sistem</span><span>\' + d.memPct + "% (" + (d.memTotalMB - d.memFreeMB) + " / " + d.memTotalMB + \' MB)</span></div>\' +',
'      \'<div class="bar-track"><div class="bar-fill" style="width:\' + d.memPct + \'%"></div></div></div>\' +',
'      \'<div class="bar-wrap"><div class="bar-row"><span>CPU Load (1m/5m/15m)</span><span>\' + s.loadavg.join(" / ") + " &middot; " + s.cpuCores + \' core</span></div></div>\';',
'',
'    const tags = Object.entries(d.pluginBreakdown || {});',
'    document.getElementById("tags").innerHTML = tags.length',
'      ? tags.map(function(t){ return \'<div class="tag">\' + esc(t[0]) + \' <b>\' + t[1] + \'</b></div>\'; }).join("")',
'      : \'<div class="empty">Belum ada data</div>\';',
'',
'    const tbody = document.querySelector("#topusers tbody");',
'    tbody.innerHTML = (d.topUsers && d.topUsers.length)',
'      ? d.topUsers.map(function(u,i){ return "<tr><td>" + (i+1) + "</td><td>" + esc(u.id) + "</td><td>" + u.hit + "</td></tr>"; }).join("")',
'      : \'<tr><td colspan="3" class="empty">Belum ada aktivitas</td></tr>\';',
'',
'    document.getElementById("recentcmds").innerHTML = (d.recentCommands && d.recentCommands.length)',
'      ? d.recentCommands.map(function(c){ return \'<div class="log-row"><span class="time-txt">\' + c.time + "</span><span>" + esc(c.cmd) + " &middot; " + esc(c.sender) + "</span></div>"; }).join("")',
'      : \'<div class="empty">Belum ada command</div>\';',
'',
'    document.getElementById("recentlogs").innerHTML = (d.recentLogs && d.recentLogs.length)',
'      ? d.recentLogs.map(function(l){ return \'<div class="log-row"><span class="time-txt">\' + l.time + \'</span><span class="lvl \' + l.level + \'">\' + l.level + "</span><span>" + esc(l.msg) + "</span></div>"; }).join("")',
'      : \'<div class="empty">Belum ada log</div>\';',
'',
'  } catch (e) { console.error(e); }',
'}',
'refresh();',
'setInterval(refresh, 5000);',
].join('\n');

function renderHTML() {
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${global.botName || 'Bot'} Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #0f172a; color: #e2e8f0; padding: 20px; padding-bottom: 60px; }
  h1 { font-size: 20px; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
  .sub { font-size: 12px; color: #64748b; margin-bottom: 18px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; margin: 26px 0 10px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
  .card { background: #1e293b; border-radius: 12px; padding: 16px; }
  .card .label { font-size: 12px; color: #94a3b8; margin-bottom: 6px; }
  .card .value { font-size: 20px; font-weight: 600; word-break: break-all; }
  .card .value.small { font-size: 14px; font-weight: 500; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
  .dot.on { background: #22c55e; box-shadow: 0 0 8px #22c55e; } .dot.off { background: #ef4444; }
  .bar-wrap { background:#0f172a; border-radius:12px; padding:14px 16px; margin-bottom:8px; }
  .bar-row { display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px; }
  .bar-track { background:#1e293b; border-radius:6px; height:8px; overflow:hidden; }
  .bar-fill { height:100%; background:linear-gradient(90deg,#22c55e,#16a34a); border-radius:6px; }
  table { width:100%; border-collapse: collapse; background:#1e293b; border-radius:12px; overflow:hidden; }
  th, td { text-align:left; padding:10px 12px; font-size:13px; border-bottom:1px solid #0f172a; }
  th { color:#94a3b8; font-weight:500; font-size:11px; text-transform:uppercase; }
  tr:last-child td { border-bottom:none; }
  .tag-list { display:flex; flex-wrap:wrap; gap:8px; }
  .tag { background:#1e293b; border-radius:8px; padding:8px 12px; font-size:12px; display:flex; gap:6px; align-items:center; }
  .tag b { color:#4ade80; }
  .log-list { background:#1e293b; border-radius:12px; padding:4px 0; max-height: 320px; overflow-y:auto; }
  .log-row { padding:8px 14px; font-size:12px; font-family: ui-monospace, monospace; display:flex; gap:8px; border-bottom:1px solid #0f172a; }
  .log-row:last-child { border-bottom:none; }
  .lvl { flex-shrink:0; font-weight:700; width:60px; }
  .lvl.INFO{color:#38bdf8;} .lvl.SUCCESS{color:#4ade80;} .lvl.WARN{color:#facc15;} .lvl.ERROR{color:#f87171;} .lvl.CMD{color:#e879f9;} .lvl.CHAT{color:#93c5fd;}
  .time-txt { color:#64748b; flex-shrink:0; }
  .empty { color:#475569; font-size:12px; padding:14px; text-align:center; }
  footer { margin-top: 24px; font-size: 11px; color: #475569; }
</style>
</head>
<body>
  <h1><span id="dot" class="dot off"></span> <span id="name">${global.botName || 'Bot'}</span> Dashboard</h1>
  <div class="sub" id="serverline">memuat info server...</div>

  <h2>Ringkasan</h2>
  <div class="grid" id="grid"></div>

  <h2>Sumber Daya</h2>
  <div id="resources"></div>

  <h2>Plugin per Kategori</h2>
  <div class="tag-list" id="tags"></div>

  <h2>Top Users</h2>
  <table id="topusers"><thead><tr><th>#</th><th>User</th><th>Commands</th></tr></thead><tbody></tbody></table>

  <h2>Aktivitas Terbaru</h2>
  <div class="log-list" id="recentcmds"></div>

  <h2>Log Terbaru</h2>
  <div class="log-list" id="recentlogs"></div>

  <footer>Auto-refresh tiap 5 detik</footer>
  <script>
${CLIENT_JS}
  </script>
</body>
</html>`;
}

export function startDashboard(port) {
    const server = http.createServer((req, res) => {
        if (req.url === '/api/status') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(getStatus()));
            return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderHTML());
    });

    server.listen(port, () => {
        logger.success(`Dashboard jalan di port ${port}`);
        lookupPublicIp({ force: true }).catch(() => {});
    });

    return server;
}
