import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SANDBOX_ROOT } from './sandbox.js';
import { ensureBinary } from '../dashboard/tunnel.js';
import { logger } from '../util/logger.js';

export const SITES_ROOT = path.join(SANDBOX_ROOT, 'sites');

const NAME_RX = /^[a-z0-9][a-z0-9-]{0,30}$/;
const URL_RX = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const MAX_SITES = Math.max(1, Number(process.env.SITE_MAX) || 3);
const DEFAULT_TTL_MIN = Math.max(1, Number(process.env.SITE_TTL_MIN) || 60);
const MAX_TTL_MIN = 360;
const TUNNEL_TIMEOUT_MS = 60_000;
const REGISTER_GRACE_MS = 10_000;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.xml': 'application/xml; charset=utf-8',
};

const sites = new Map();

function plain(res, code, text, extra = {}) {
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff', ...extra });
    res.end(text);
}

export function createStaticServer(root) {
    const base = path.resolve(root);
    let realBase;
    try { realBase = fs.realpathSync(base); } catch { realBase = base; }

    return http.createServer((req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return plain(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });

        let rel;
        try { rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
        catch { return plain(res, 400, 'Bad Request'); }
        if (rel.includes('\0')) return plain(res, 400, 'Bad Request');
        if (rel.split('/').some((seg) => seg.startsWith('.') && seg !== '')) return plain(res, 404, 'Not Found');

        let file = path.resolve(base, '.' + rel);
        if (file !== base && !file.startsWith(base + path.sep)) return plain(res, 403, 'Forbidden');

        try {
            let st = fs.statSync(file);
            if (st.isDirectory()) {
                file = path.join(file, 'index.html');
                st = fs.statSync(file);
            }
            if (!st.isFile()) return plain(res, 404, 'Not Found');
            const real = fs.realpathSync(file);
            if (real !== realBase && !real.startsWith(realBase + path.sep)) return plain(res, 403, 'Forbidden');

            res.writeHead(200, {
                'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
                'Content-Length': st.size,
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            });
            if (req.method === 'HEAD') return res.end();
            const stream = fs.createReadStream(real);
            stream.on('error', () => res.destroy());
            stream.pipe(res);
        } catch {
            plain(res, 404, 'Not Found');
        }
    });
}


const REF_RX = /(?:src|href)\s*=\s*["']([^"'#?\s]+)["']/gi;

export function stageFromSandbox(dir) {
    const entry = path.join(SANDBOX_ROOT, 'index.html');
    if (!fs.existsSync(entry)) return 0;
    const html = fs.readFileSync(entry, 'utf8');
    const wanted = new Set(['index.html']);
    for (const m of html.matchAll(REF_RX)) {
        const ref = m[1];
        if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('/')) continue;
        wanted.add(ref.replace(/^\.\//, ''));
        if (wanted.size > 100) break;
    }
    let copied = 0;
    for (const rel of wanted) {
        const src = path.resolve(SANDBOX_ROOT, rel);
        if (!src.startsWith(SANDBOX_ROOT + path.sep) || src.startsWith(SITES_ROOT + path.sep)) continue;
        const cleanRel = path.relative(SANDBOX_ROOT, src);
        if (cleanRel.split(path.sep).some((seg) => seg.startsWith('.'))) continue;
        let st;
        try { st = fs.lstatSync(src); } catch { continue; }
        if (!st.isFile() || st.size > 10 * 1024 * 1024) continue;
        const dest = path.join(dir, cleanRel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
        copied++;
    }
    return copied;
}

function listen(server) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
}

function openTunnel(bin, port) {
    return new Promise((resolve, reject) => {
        const child = spawn(bin, [
            'tunnel',
            '--url', `http://127.0.0.1:${port}`,
            '--no-autoupdate',
            '--protocol', 'http2',
            '--edge-ip-version', '4',
        ], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: { PATH: process.env.PATH || '', HOME: process.env.HOME || process.cwd(), TMPDIR: process.env.TMPDIR || '/tmp' },
        });

        let url = null;
        let registered = false;
        let settled = false;
        let tail = '';
        let graceTimer = null;

        const hardTimer = setTimeout(() => fail(new Error(`Tunnel tidak siap dalam ${TUNNEL_TIMEOUT_MS / 1000} detik. ${tail.trim().split('\n').pop() || ''}`)), TUNNEL_TIMEOUT_MS);

        function cleanup() {
            clearTimeout(hardTimer);
            clearTimeout(graceTimer);
        }
        function fail(err) {
            if (settled) return;
            settled = true;
            cleanup();
            try { child.kill('SIGTERM'); } catch {}
            reject(err);
        }
        function ok() {
            if (settled) return;
            settled = true;
            cleanup();
            resolve({ child, url });
        }
        function onData(chunk) {
            const text = chunk.toString();
            tail = (tail + text).slice(-500);
            if (!url) {
                const m = text.match(URL_RX);
                if (m) {
                    url = m[0];
                    graceTimer = setTimeout(ok, REGISTER_GRACE_MS);
                }
            }
            if (/Registered tunnel connection/i.test(text)) registered = true;
            if (url && registered) ok();
        }

        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('error', (e) => fail(e));
        child.on('exit', (code, signal) => fail(new Error(`cloudflared berhenti (code=${code} signal=${signal || '-'}). ${tail.trim().split('\n').pop() || ''}`)));
    });
}

function formatLeft(ms) {
    const min = Math.max(0, Math.round(ms / 60_000));
    return `${min} menit`;
}

export async function stopSite(name) {
    const site = sites.get(name);
    if (!site) return false;
    sites.delete(name);
    clearTimeout(site.timer);
    site.stopping = true;
    try { site.child.kill('SIGTERM'); } catch {}
    try { site.server.close(); site.server.closeAllConnections?.(); } catch {}
    logger.info(`[site] ${name} dihentikan`);
    return true;
}

export function stopAllSites() {
    for (const name of [...sites.keys()]) stopSite(name);
}

process.on('exit', () => {
    for (const site of sites.values()) {
        try { site.child.kill('SIGTERM'); } catch {}
    }
});

export async function deploySite(name, ttlMin = DEFAULT_TTL_MIN) {
    if (!NAME_RX.test(name || '')) throw new Error('Nama situs harus huruf kecil/angka/strip, maksimal 31 karakter. Contoh: site_deploy demo-1');

    const dir = path.join(SITES_ROOT, name);
    if (!fs.existsSync(path.join(dir, 'index.html'))) {
        const staged = stageFromSandbox(dir);
        if (!staged) {
            throw new Error(`Belum ada index.html. Tulis lewat sandbox_write sites/${name}/index.html (atau index.html di root .sandbox) lalu panggil site_deploy ${name} lagi.`);
        }
    }

    const existing = sites.get(name);
    if (existing) {
        return `🌐 ${name} sudah hidup: ${existing.url}\nSisa waktu ±${formatLeft(existing.expiresAt - Date.now())}. Pakai site_stop ${name} dulu kalau mau mulai ulang.`;
    }
    if (sites.size >= MAX_SITES) {
        throw new Error(`Sudah ada ${sites.size} situs aktif (maks ${MAX_SITES}): ${[...sites.keys()].join(', ')}. Hentikan satu dengan site_stop <nama>.`);
    }

    const ttl = Math.min(Math.max(Number(ttlMin) || DEFAULT_TTL_MIN, 1), MAX_TTL_MIN);
    const bin = await ensureBinary();
    const server = createStaticServer(dir);
    const port = await listen(server);

    let tunnel;
    try {
        tunnel = await openTunnel(bin, port);
    } catch (e) {
        try { server.close(); } catch {}
        throw e;
    }

    const site = {
        name,
        port,
        server,
        child: tunnel.child,
        url: tunnel.url,
        startedAt: Date.now(),
        expiresAt: Date.now() + ttl * 60_000,
        stopping: false,
        timer: null,
    };
    site.timer = setTimeout(() => { stopSite(name); }, ttl * 60_000);
    site.timer.unref?.();
    tunnel.child.on('exit', () => {
        if (!site.stopping && sites.get(name) === site) stopSite(name);
    });
    sites.set(name, site);
    logger.success(`[site] ${name} → ${site.url} (ttl ${ttl}m)`);

    return `🌐 Situs "${name}" online\n${site.url}\nMati otomatis dalam ${ttl} menit. Hentikan lebih awal: site_stop ${name}\nKalau link belum kebuka, tunggu sekitar 10 detik lalu coba lagi.`;
}

function parseDeployArgs(args) {
    const tokens = String(args || '').trim().split(/\s+/).filter(Boolean);
    let name = '';
    let ttl;
    for (const t of tokens) {
        const m = t.match(/^ttl=(\d+)$/i);
        if (m) ttl = Number(m[1]);
        else if (!name) name = t.toLowerCase();
    }
    return { name, ttl };
}

export const SITE_TOOL_DEFS = [
    {
        name: 'site_deploy',
        aliases: ['deploy_site', 'site_up'],
        ownerOnly: true,
        dangerous: true,
        description: 'Publish a STATIC website (HTML/CSS/JS/images) from .sandbox/sites/<name>/ (must contain index.html) to a temporary public https URL via Cloudflare quick tunnel. Write the files first with sandbox_write using paths like sites/<name>/index.html (an index.html at the .sandbox root, plus the local files it references, is also picked up automatically). Auto-stops after a TTL (default 60 min, max 360). Returns the public URL. No backend/server code, static files only',
        examples: ['site_deploy demo', 'site_deploy portfolio ttl=120'],
        argsHint: 'name [ttl=minutes]',
        run: async (args) => {
            const { name, ttl } = parseDeployArgs(args);
            return deploySite(name, ttl);
        },
    },
    {
        name: 'site_list',
        aliases: ['list_sites', 'sites'],
        ownerOnly: true,
        parallelSafe: true,
        description: 'List currently running tunneled test sites with URL and remaining time',
        examples: ['site_list'],
        argsHint: '(no args)',
        run: async () => {
            if (!sites.size) return 'Tidak ada situs yang sedang online.';
            return [...sites.values()]
                .map((s) => `• ${s.name} → ${s.url} (sisa ±${formatLeft(s.expiresAt - Date.now())})`)
                .join('\n');
        },
    },
    {
        name: 'site_stop',
        aliases: ['stop_site', 'site_down'],
        ownerOnly: true,
        dangerous: true,
        description: 'Stop a running tunneled test site by name, or "all" to stop every site',
        examples: ['site_stop demo', 'site_stop all'],
        argsHint: 'name | all',
        run: async (args) => {
            const name = String(args || '').trim().split(/\s+/)[0]?.toLowerCase();
            if (!name) throw new Error('Nama situs wajib. Contoh: site_stop demo');
            if (name === 'all') {
                const n = sites.size;
                stopAllSites();
                return `✅ ${n} situs dihentikan.`;
            }
            const ok = await stopSite(name);
            return ok ? `✅ Situs "${name}" dihentikan.` : `Situs "${name}" tidak sedang online.`;
        },
    },
];
