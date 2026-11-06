import { api } from '../api/index.js';
import { logger } from '../util/index.js';
import { plugins } from '../core/loader.js';
import { listAgentToolsForPrompt } from './tools.js';

const getPluginList = () => {
    const seen = new Set();
    const list = [];
    for (const [, p] of plugins) {
        if (!p.meta || seen.has(p.meta)) continue;
        seen.add(p.meta);
        const iface = p.meta.interface || {};
        const cmds = [iface.cmd].flat().filter(Boolean);
        list.push({
            cmd: cmds,
            tag: iface.tag || 'general',
            desc: iface.desc || cmds[0],
            ai: iface.ai
        });
    }
    return list;
};

export const intentEngine = async (text, history, userCtx, scratch = []) => {
    try {
        const toolsPrompt = listAgentToolsForPrompt(!!userCtx?.isOwner);
        return await api.intent(text, getPluginList(), history, userCtx, toolsPrompt, scratch);
    } catch (e) {
        logger.error(`[engine] ${e.message}`);
        const refusedText = userCtx?.lang === 'id'
            ? '⚠️ Gemini menolak menjawab pesan ini. Coba persingkat, ubah kalimatnya, atau kirim bagian kodenya saja.'
            : '⚠️ Gemini refused to answer this message. Try shortening it, rewording, or sending only part of the code.';
        return {
            command: 'chat',
            args: '',
            message: e.refused ? refusedText : '⚠️ AI is unavailable. Try again later!',
            remember: {},
            mood: null,
            voice: false,
            messages: [],
            preReply: '',
            isError: true,
        };
    }
};
