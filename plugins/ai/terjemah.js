import { typing, getArgs, api, msg } from '../../src/lib/index.js';
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
        raw,
        from
    }) => {
        const args = (getArgs(body, 1) || '').trim();
        const first = args.split(/\s+/)[0] || '';
        const codeName = /^[a-z]{2}$/i.test(first) ? api.langName(first) : null;

        const target = codeName || 'English';
        const inline = codeName ? args.slice(first.length).trim() : args;
        const text = inline || message.quoted?.text || '';

        if (!text) {
            return sock.sendMessage(from, { text: msg('need.translate') }, { quoted: raw });
        }

        await typing(sock, from);
        try {
            const result = await api.translate(text, target);
            return sock.sendMessage(from, { text: `${result}\n\n_→ ${target} · Gemini_` }, { quoted: raw });
        } catch (e) {
            return sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });
