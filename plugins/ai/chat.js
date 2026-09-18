import { getHistory, clearHistory } from '../../src/ai/memory.js';
import { typing, getArgs, api, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('ai', 'tanya')
    .in('ai')
    .desc('Chat with AI (with memory)')
    .prefixOnly()
    .signal('User explicitly asks the AI a question or wants an AI answer', ['ask AI who is Einstein', 'ai explain photosynthesis'])
    .run(async (sock, { body, message, raw, from, primaryId, db }) => {
        const { quoted } = message;
        const args = getArgs(body) || quoted?.text;

        if (!args) return sock.sendMessage(from, {
            text: msg('need.chat')
        }, { quoted: raw });

        if (['reset', 'clear', 'forget'].includes(args.toLowerCase().trim())) {
            await clearHistory(primaryId);
            return sock.sendMessage(from, { text: msg('done.memory_reset') }, { quoted: raw });
        }

        await typing(sock, from);
        try {
            const history = await getHistory(primaryId);
            const response = await api.naga([
                ...history.slice(-10),
                { role: 'user', content: args },
            ], `You are Levatain, a friendly and smart AI assistant. Reply in the same language as the user.`);

            await sock.sendMessage(from, { text: response }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

