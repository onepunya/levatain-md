import { typing, downloadMedia, upscaleImage, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('upscale', 'hd', 'enhance')
    .in('tools')
    .desc('Upscale image resolution/quality (HD enhance)')
    .prefixOnly()
    .cooldown(15)
    .signal('User asks to upscale an image, increase resolution, or enhance photo quality buram', ['upscale this photo', 'hd enhance this', 'enhance this image'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const result = await downloadMedia(raw, message.quoted, ['image']);
        if (!result) return sock.sendMessage(from, { text: msg('need.image') }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.upscale') }, { quoted: raw });

        try {
            const output = await upscaleImage(result.buffer, result.mimetype || 'image/jpeg');
            const media  = Buffer.isBuffer(output) ? { image: output } : { image: { url: output } };
            await sock.sendMessage(from, { ...media, caption: '✅ Image upscaled successfully!' }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.upscale_hint', { msg: e.message }) }, { quoted: raw });
        }
    });

