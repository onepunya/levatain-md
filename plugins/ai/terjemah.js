import { api } from '../../src/api/index.js';
import { getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tr', 'terjemah', 'translate')
    .in('ai')
    .desc('Translate text with AI. Example: .tr id good morning')
    .prefixOnly()
    .cooldown(4)
    .signal('User asks to translate text into another language', [
        'terjemahkan ke inggris',
        'translate this to japanese',
    ])
    .run(async (sock, {
        body,
        message,
        reply,
        typing
    }) => {
        const args = (getArgs(body, 1) || '').trim();
        const first = args.split(/\s+/)[0] || '';
        const codeName = /^[a-z]{2}$/i.test(first) ? api.langName(first) : null;

        const target = codeName || 'English';
        const inline = codeName ? args.slice(first.length).trim() : args;
        const text = inline || message.quoted?.text || '';

        if (!text) {
            return reply(msg('need.translate'));
        }

        await typing();
        try {
            const result = await api.translate(text, target);
            return reply(`${result}\n\n_→ ${target} · Gemini_`);
        } catch (e) {
            return reply(msg('fail.generic', { msg: e.message }));
        }
    });
