import { downloadMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('toimg')
    .in('tools')
    .desc('Convert WhatsApp sticker to image')
    .prefixOnly()
    .signal('User asks to convert stiker jadi gambar atau foto', ['convert this sticker to image', 'toimg'])
    .run(async (sock, {
        message,
        raw,
        reply,
        typing
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['sticker']);
        if (!result) return reply(msg('need.sticker'));

        await typing();
        try {
            await reply({ image: result.buffer, caption: msg('done.sticker_img') });
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
