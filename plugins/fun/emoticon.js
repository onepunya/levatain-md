import { getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';
import { scrapeEmoji } from '../../src/util/scrapeEmoji.js';

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
    .run(async (sock, { body, reply, typing }) => {
        const query = getArgs(body, 1);

        if (!query) {
            return reply(msg('emo.usage'));
        }

        await typing();

        try {
            const { results } = await scrapeEmoji(query, { limit: 15 });

            if (!results.length) {
                return reply(msg('emo.not_found', { query }));
            }

            const list = results.map((e, i) => `${i + 1}. ${e}`).join('\n');
            const text = msg('emo.result', {
                query,
                count: results.length,
                list,
            });

            await reply(text);
        } catch (e) {
            await reply(msg('fail.emoji', { msg: e.message }));
        }
    });
