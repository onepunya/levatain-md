import { downloadMedia, getArgs } from '../../src/util/index.js';
import { makeSticker, parseStickerMode } from '../../src/util/sticker.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('sticker', 's')
    .in('tools')
    .desc('Convert image/video to a WhatsApp sticker')
    .prefixOnly()
    .signal('User asks to make a sticker from a sent image or video', ['make this a sticker', 'sticker from this image'])
    .run(async (sock, {
        body,
        message,
        raw,
        pushname,
        reply,
        send,
        typing
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['image', 'video']);
        if (!result) return reply(msg('need.image_video'));

        await typing();
        try {
            const buffer = await makeSticker(result.buffer, {
                type: result.type,
                mimetype: result.mimetype || '',
                pack: global.botName,
                author: pushname || 'Levatain',
                mode: parseStickerMode(getArgs(body || '')),
            });
            await send({ sticker: buffer });
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
