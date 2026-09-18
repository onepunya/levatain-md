import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { typing, downloadMedia, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('sticker', 's')
    .in('tools')
    .desc('Convert image/video to a WhatsApp sticker')
    .prefixOnly()
    .signal('User asks to make a sticker from a sent image or video', ['make this a sticker', 'sticker from this image'])
    .run(async (sock, { message, raw, from, pushname, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['image', 'video']);
        if (!result) return sock.sendMessage(from, { text: msg('need.image_video') }, { quoted: raw });

        await typing(sock, from);
        try {
            const sticker = new Sticker(result.buffer, {
                pack:    global.botName,
                author:  pushname || 'Levatain',
                type:    StickerTypes.FULL,
                quality: 70,
            });
            await sock.sendMessage(from, { sticker: await sticker.toBuffer() }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

