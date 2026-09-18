import { typing, getArgs, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';
import { scrapeEmoji } from '../../src/lib/scrapeEmoji.js';

export default plugin('emoticon', 'emoji', 'emo', 'kaomoji')
    .in('fun')
    .desc('Search emoji / kaomoji from emojidb.org')
    .prefixOnly()
    .cooldown(4)

    .signal('User asks for emoji, emoticon, or kaomoji by keyword', [
        'find cat emoji',
        'emoticon sad',
        'kaomoji love',
        'smile emoji',
    ])
    .run(async (sock, ctx) => {
        const { body, raw, from } = ctx;
        const query = getArgs(body, 1);

        if (!query) {
            return sock.sendMessage(from, { text: msg('emo.usage') }, { quoted: raw });
        }

        await typing(sock, from);

        try {
            const { results } = await scrapeEmoji(query, { limit: 15 });

            if (!results.length) {
                return sock.sendMessage(
                    from,
                    { text: msg('emo.not_found', { query }) },
                    { quoted: raw }
                );
            }

            const list = results.map((e, i) => `${i + 1}. ${e}`).join('\n');
            const text = msg('emo.result', {
                query,
                count: results.length,
                list,
            });

            await sock.sendMessage(from, { text }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(
                from,
                { text: msg('fail.emoji', { msg: e.message }) },
                { quoted: raw }
            );
        }
    });
