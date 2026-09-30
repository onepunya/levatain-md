import { api, logger } from '../lib/index.js';
import { plugins } from '../core/loader.js';

const getPluginList = () => {
    const seen = new Set();
    const list = [];
    for (const [, p] of plugins) {
        if (!p.meta || seen.has(p.meta)) continue;
        seen.add(p.meta);
        const iface = p.meta.interface || {};
        const cmds  = [iface.cmd].flat().filter(Boolean);
        list.push({
            cmd: cmds,
            tag: iface.tag || 'general',
            desc: iface.desc || cmds[0],
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
            message: '⚠️ AI is unavailable. Try again later!',
            remember: {},
            mood: null,
            voice: false,
            preReply: '',
        };
    }
};