import { api } from '../lib/api.js';
import { logger } from '../lib/logger.js';
import { plugins } from '../core/loader.js';

const getPluginList = () => {
    const seen = new Set();
    const list = [];
    for (const [, p] of plugins) {
        if (!p.meta || seen.has(p.meta)) continue;
        seen.add(p.meta);
        const iface = p.meta.interface || {};
        list.push({
            cmd: iface.cmd,
            tag: iface.tag || 'general',
            desc: iface.desc || iface.cmd?.[0],
            ai: iface.ai
        });
    }
    return list;
};

export const intentEngine = async (text, history, userCtx) => {
    try {
        return await api.intent(text, getPluginList(), history, userCtx);
    } catch (e) {
        logger.error(`[engine] ${e.message}`);
        return {
            command: 'chat',
            args: '',
            message: '⚠️ AI sedang tidak bisa diakses. Coba lagi nanti!',
            remember: {},
            mood: null,
            voice: false,
            preReply: '',
        };
    }
};