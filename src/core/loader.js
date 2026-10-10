import { readdirSync } from 'fs';
import { logger } from '../util/logger.js';

export const plugins = new Map();

const PLUGIN_DIR = './plugins';

export function getAllFiles(dir) {
    try {
        return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
            const path = `${dir}/${entry.name}`;
            if (entry.isDirectory()) return getAllFiles(path);
            return entry.name.endsWith('.js') ? [path] : [];
        });
    } catch {
        return [];
    }
}

function resolveMeta(candidate) {
    if (!candidate || typeof candidate !== 'object') return null;
    if (candidate.meta?.interface?.run) return candidate.meta;
    if (candidate.default?.meta?.interface?.run) return candidate.default.meta;
    if (candidate.default?.default?.meta?.interface?.run) return candidate.default.default.meta;
    if (candidate.default?.interface?.run) return candidate.default;
    if (candidate.interface?.run) return candidate;
    return null;
}

export function collectMetas(mod) {
    const exported = mod?.default;
    if (Array.isArray(exported)) return exported.map(resolveMeta).filter(Boolean);
    const single = resolveMeta(mod);
    return single ? [single] : [];
}

function registerMeta(meta) {
    const { cmd, run } = meta.interface;
    for (const name of [cmd].flat()) {
        if (name) plugins.set(String(name).toLowerCase(), { meta, run });
    }
}

async function importPlugins({ bustCache = false } = {}) {
    plugins.clear();
    const counters = { ok: 0, fail: 0 };
    const version  = bustCache ? `?v=${Date.now()}` : '';

    for (const file of getAllFiles(PLUGIN_DIR)) {
        try {
            const metas = collectMetas(await import(`../../${file}${version}`));
            if (!metas.length) {
                logger.warn(`[Loader] Skip ${file} — invalid plugin (missing meta.interface.run)`);
                continue;
            }
            metas.forEach(registerMeta);
            counters.ok += metas.length;
        } catch (e) {
            logger.error(`[Loader] ${file}: ${e.message}`);
            counters.fail++;
        }
    }

    return counters;
}

export async function loadPlugins() {
    const counters = await importPlugins();
    logger.info(`Plugins: ${counters.ok} loaded${counters.fail ? `, ${counters.fail} failed` : ''} | Commands: ${plugins.size}`);
    return counters;
}

export async function reloadPlugins() {
    const counters = await importPlugins({ bustCache: true });
    logger.success(`Reload: ${counters.ok} plugins | ${plugins.size} commands`);
    return counters;
}
