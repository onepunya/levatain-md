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
    } catch { return []; }
}

export async function loadPlugins(dir = './plugins') {
    plugins.clear();
    const files = getAllFiles(dir);
    let ok = 0, fail = 0;

    for (const file of files) {
        try {
            const mod = await import(`../../${file}`);
            if (!mod.meta || !mod.run) {
                logger.warn(`[Loader] Skip ${file} — tidak ada meta/run`);
                continue;
            }
            const cmds = Array.isArray(mod.meta.cmd) ? mod.meta.cmd : [mod.meta.cmd];
            for (const cmd of cmds) {
                plugins.set(cmd.toLowerCase(), { meta: mod.meta, run: mod.run });
            }
            ok++;
        } catch (e) {
            logger.error(`[Loader] ${file}: ${e.message}`);
            fail++;
        }
    }

    logger.info(`Plugins: ${ok} loaded${fail ? `, ${fail} failed` : ''} | Commands: ${plugins.size}`);
    return { ok, fail };
}

export async function reloadPlugins() {
    const v      = Date.now();
    const files  = getAllFiles('./plugins');
    plugins.clear();
    let ok = 0, fail = 0;

    for (const file of files) {
        try {
            const mod = await import(`../../${file}?v=${v}`);
            if (!mod.meta || !mod.run) continue;
            const cmds = Array.isArray(mod.meta.cmd) ? mod.meta.cmd : [mod.meta.cmd];
            for (const cmd of cmds) {
                plugins.set(cmd.toLowerCase(), { meta: mod.meta, run: mod.run });
            }
            ok++;
        } catch (e) {
            logger.error(`[Reload] ${file}: ${e.message}`);
            fail++;
        }
    }

    logger.success(`Reload: ${ok} plugins | ${plugins.size} commands`);
    return { ok, fail };
}
