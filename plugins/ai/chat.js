import { getHistory, clearHistory } from '../../src/ai/memory.js';
import { api } from '../../src/api/index.js';
import { getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('ai', 'tanya')
    .in('ai')
    .desc('Chat with AI (with memory)')
    .prefixOnly()
    .signal('User explicitly asks the AI a question or wants an AI answer', ['ask AI who is Einstein', 'ai explain photosynthesis'])
    .run(async (sock, {
        body,
        message,
        primaryId,
        reply,
        typing
    }) => {
        const { quoted } = message;
        const args = getArgs(body) || quoted?.text;

        if (!args) return reply(msg('need.chat'));

        if (['reset', 'clear', 'forget'].includes(args.toLowerCase().trim())) {
            await clearHistory(primaryId);
            return reply(msg('done.memory_reset'));
        }

        await typing();
        try {
            const history = await getHistory(primaryId);
            const response = await api.chatAI([
                ...history.slice(-10),
                { role: 'user', content: args },
            ], `You are Levatain, a friendly and smart AI assistant. Reply in the same language as the user.`);

            await reply(response);
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
