import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { downloadMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('sticker', 's')
    .in('tools')
    .desc('Convert image/video to a WhatsApp sticker')
    .prefixOnly()
    .signal('User asks to make a sticker from a sent image or video', ['make this a sticker', 'sticker from this image'])
    .run(async (sock, {
        message,
        raw,
        pushname,
        reply,
        typing
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['image', 'video']);
        if (!result) return reply(msg('need.image_video'));

        await typing();
        try {
            const sticker = new Sticker(result.buffer, {
                pack: global.botName,
                author: pushname || 'Levatain',
                type: StickerTypes.FULL,
                quality: 70,
            });
            await reply({ sticker: await sticker.toBuffer() });
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
