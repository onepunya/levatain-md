import { readdirSync } from 'fs';
import { logger } from '../lib/logger.js';

export const plugins = new Map();

function getAllFiles(dir) {
    try {
        return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
            e.isDirectory()
                ? getAllFiles(`${dir}/${e.name}`)
                : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []
        );
    } catch {
        return [];
    }
}

function resolveMeta(mod) {
    if (mod?.meta?.interface?.run) return mod.meta;
    if (mod?.default?.meta?.interface?.run) return mod.default.meta;
    return null;
}

function registerMeta(meta, file, counters) {
    const iface = meta.interface;
    if (!iface?.run) {
        logger.warn(`[Loader] Skip ${file} — tidak ada run()`);
        return;
    }
    const cmds = Array.isArray(iface.cmd) ? iface.cmd : [iface.cmd];
    for (const cmd of cmds) {
        if (!cmd) continue;
        plugins.set(String(cmd).toLowerCase(), { meta, run: iface.run });
    }
    counters.ok++;
}

export async function loadPlugins(dir = './plugins') {
    plugins.clear();
    const files = getAllFiles(dir);
    const counters = { ok: 0, fail: 0 };

    for (const file of files) {
        try {
            const mod = await import(`../../${file}`);
            const meta = resolveMeta(mod);
            if (!meta) {
                logger.warn(`[Loader] Skip ${file} — bukan plugin valid (meta lama / plugin() baru)`);
                continue;
            }
            registerMeta(meta, file, counters);
        } catch (e) {
            logger.error(`[Loader] ${file}: ${e.message}`);
            counters.fail++;
        }
    }

    logger.info(
        `Plugins: ${counters.ok} loaded${counters.fail ? `, ${counters.fail} failed` : ''} | Commands: ${plugins.size}`
    );
    return counters;
}

export async function reloadPlugins() {
    const v = Date.now();
    const files = getAllFiles('./plugins');
    plugins.clear();
    const counters = { ok: 0, fail: 0 };

    for (const file of files) {
        try {
            const mod = await import(`../../${file}?v=${v}`);
            const meta = resolveMeta(mod);
            if (!meta) continue;
            registerMeta(meta, file, counters);
        } catch (e) {
            logger.error(`[Reload] ${file}: ${e.message}`);
            counters.fail++;
        }
    }

    logger.success(`Reload: ${counters.ok} plugins | ${plugins.size} commands`);
    return counters;
}
