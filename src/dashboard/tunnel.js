import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { logger } from '../util/logger.js';

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const GH_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

let child = null;
let tunnelUrl = null;
let lastError = null;
let starting = false;
let installing = false;
let restartTimer = null;
let restartAttempt = 0;
let targetPort = null;

function archAsset() {
    const a = process.arch;
    if (a === 'arm64' || a === 'aarch64') return 'cloudflared-linux-arm64';
    if (a === 'arm') return 'cloudflared-linux-arm';
    return 'cloudflared-linux-amd64';
}

function binDir() {
    const base = fs.existsSync('/home/container') ? '/home/container' : process.cwd();
    return path.join(base, '.bin');
}

function isFile(p) {
    try { return fs.statSync(p).isFile(); } catch { return false; }
}

function findBinary() {
    try {
        const r = spawnSync('cloudflared', ['--version'], { stdio: 'ignore', timeout: 5000 });
        if (r.status === 0) return 'cloudflared';
    } catch {}

    const candidates = [
        path.join(binDir(), 'cloudflared'),
        path.join(process.cwd(), 'cloudflared'),
        '/home/container/cloudflared',
    ];
    for (const p of candidates) {
        if (isFile(p)) {
            try { fs.chmodSync(p, 0o755); } catch {}
            return p;
        }
    }
    return null;
}

function downloadFile(url, dest, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 8) return reject(new Error('too many redirects'));
        const req = https.get(url, {
            headers: { 'User-Agent': 'levatain-md-tunnel' },
            timeout: 120_000,
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                const next = new URL(res.headers.location, url).href;
                return downloadFile(next, dest, redirects + 1).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`download HTTP ${res.statusCode}`));
            }
            const tmp = dest + '.part';
            const out = fs.createWriteStream(tmp);
            res.pipe(out);
            out.on('error', reject);
            out.on('finish', () => {
                out.close(() => {
                    try {
                        fs.renameSync(tmp, dest);
                        fs.chmodSync(dest, 0o755);
                        resolve(dest);
                    } catch (e) {
                        reject(e);
                    }
                });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('download timeout'));
        });
    });
}

async function ensureBinary() {
    const existing = findBinary();
    if (existing) return existing;

    if (process.env.CLOUDFLARE_TUNNEL_DOWNLOAD === 'false') {
        throw new Error('cloudflared missing and auto-download disabled');
    }
    if (installing) throw new Error('cloudflared download already in progress');

    installing = true;
    try {
        fs.mkdirSync(binDir(), { recursive: true });
        const dest = path.join(binDir(), 'cloudflared');
        logger.info(`Downloading cloudflared (${archAsset()})…`);
        await downloadFile(`${GH_BASE}/${archAsset()}`, dest);
        logger.success(`cloudflared installed → ${dest}`);
        return dest;
    } finally {
        installing = false;
    }
}

function ingest(chunk) {
    const text = chunk.toString();
    const m = text.match(URL_RE);
    if (m && m[0] !== tunnelUrl) {
        tunnelUrl = m[0];
        lastError = null;
        restartAttempt = 0;
        logger.success(`Tunnel public: ${tunnelUrl}`);
    }
    if (/failed to request quick Tunnel|Unable to reach|connection refused|context canceled/i.test(text)) {
        lastError = text.split('\n').map(s => s.trim()).filter(Boolean).pop() || 'tunnel error';
    }
}

function scheduleRestart() {
    if (restartTimer) return;
    const delay = Math.min(60_000, 5_000 * Math.max(1, restartAttempt));
    restartAttempt += 1;
    restartTimer = setTimeout(() => {
        restartTimer = null;
        if (targetPort) startCloudflaredTunnel(targetPort, { force: true });
    }, delay);
}

export function getTunnelStatus() {
    return {
        url: tunnelUrl,
        running: !!(child && !child.killed),
        error: lastError,
        pid: child?.pid || null,
        installing,
    };
}

export function getTunnelUrl() {
    return tunnelUrl;
}

export async function startCloudflaredTunnel(port, { force = false } = {}) {
    const enabled = process.env.CLOUDFLARE_TUNNEL !== 'false' && process.env.TUNNEL_ENABLED !== 'false';
    if (!enabled) {
        logger.info('Cloudflare tunnel disabled (CLOUDFLARE_TUNNEL=false)');
        return;
    }

    targetPort = Number(port) || targetPort;
    if (!targetPort) return;
    if (starting || installing) return;
    if (child && !child.killed && !force) return;

    if (child && !child.killed) {
        try { child.kill('SIGTERM'); } catch {}
        child = null;
    }

    starting = true;
    tunnelUrl = null;
    lastError = null;

    let bin;
    try {
        bin = await ensureBinary();
    } catch (e) {
        starting = false;
        lastError = e.message;
        logger.warn(`Tunnel binary: ${e.message}`);
        scheduleRestart();
        return;
    }

    try {
        child = spawn(bin, [
            'tunnel',
            '--url', `http://127.0.0.1:${targetPort}`,
            '--no-autoupdate',
            '--protocol', 'http2',
            '--edge-ip-version', '4',
        ], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    } catch (e) {
        starting = false;
        lastError = e.message;
        logger.warn(`Tunnel spawn failed: ${e.message}`);
        scheduleRestart();
        return;
    }

    starting = false;
    logger.info(`Tunnel starting via ${bin} → 127.0.0.1:${targetPort}`);

    child.stdout.on('data', ingest);
    child.stderr.on('data', ingest);
    child.on('error', (e) => {
        lastError = e.message;
        logger.warn(`Tunnel process error: ${e.message}`);
    });
    child.on('exit', (code, signal) => {
        logger.warn(`Tunnel exited code=${code} signal=${signal || '-'}`);
        child = null;
        tunnelUrl = null;
        scheduleRestart();
    });
}

export function stopCloudflaredTunnel() {
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }
    if (child && !child.killed) {
        try { child.kill('SIGTERM'); } catch {}
    }
    child = null;
}
