import { typing, downloadMedia, uploadToUrl, api, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('removebg', 'rmbg')
    .in('tools')
    .desc('Remove background from an image')
    .prefixOnly()
    .signal('User asks to remove image background or make it transparent', ['remove background foto ini', 'removebg'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['image']);
        if (!result) return sock.sendMessage(from, { text: msg('need.image') }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.removebg') }, { quoted: raw });

        try {
            const imageUrl = await uploadToUrl(result.buffer, result.mimetype || 'image/jpeg');
            const output   = await api.removebg(imageUrl);
            await sock.sendMessage(from, { image: { url: output }, caption: msg('done.bg_removed') }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

