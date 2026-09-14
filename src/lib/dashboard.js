import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger, recentCommands, recentLogs } from './logger.js';
import { getLocalIps, getHostname, getCachedIpInfo, lookupPublicIp } from './iplookup.js';
import { formatUptimeFull } from './utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, 'dashboard-client');

const startTime = Date.now();

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

export function getStatus() {
    const db = global.db || { users: {}, groups: {} };
    const totalCommands = Object.values(db.users || {}).reduce((sum, u) => sum + (u.hit || 0), 0);
    const ipInfo = getCachedIpInfo();
    const load = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();

    return {
        botName:      global.botName || 'Bot',
        connected:    !!global.botConnected,
        uptime:       formatUptimeFull(Date.now() - startTime),
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

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'text/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.svg':  'image/svg+xml',
};

function serveStatic(req, res) {

    const urlPath = req.url === '/' ? '/dashboard-client/index.html' : req.url.split('?')[0];
    if (!urlPath.startsWith('/dashboard-client/')) return false;

    const rel = urlPath.replace('/dashboard-client/', '');
    const full = path.join(CLIENT_DIR, rel);


    if (!full.startsWith(CLIENT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return true;
    }

    fs.readFile(full, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        const ext = path.extname(full);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
    return true;
}

export function startDashboard(port) {
    const server = http.createServer((req, res) => {
        if (req.url === '/api/status') {
            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(JSON.stringify(getStatus()));
            return;
        }

        if (serveStatic(req, res)) return;


        fs.readFile(path.join(CLIENT_DIR, 'index.html'), (err, data) => {
            res.writeHead(err ? 404 : 200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(err ? 'Not found' : data);
        });
    });

    server.listen(port, () => {
        logger.success(`Dashboard jalan di port ${port}`);
        lookupPublicIp({ force: true }).catch(() => {});
    });

    return server;
}
