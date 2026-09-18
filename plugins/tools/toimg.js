import { typing, downloadMedia, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('toimg')
    .in('tools')
    .desc('Convert WhatsApp sticker to image')
    .prefixOnly()
    .signal('User asks to convert stiker jadi gambar atau foto', ['convert this sticker to image', 'toimg'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['sticker']);
        if (!result) return sock.sendMessage(from, { text: msg('need.sticker') }, { quoted: raw });

        await typing(sock, from);
        try {
            await sock.sendMessage(from, { image: result.buffer, caption: msg('done.sticker_img') }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

