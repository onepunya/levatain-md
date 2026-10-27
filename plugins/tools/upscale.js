import { upscaleImage } from '../../src/api/index.js';
import { downloadMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('upscale', 'hd', 'enhance')
    .in('tools')
    .desc('Upscale image resolution/quality (HD enhance)')
    .prefixOnly()
    .cooldown(15)
    .signal('User asks to upscale an image, increase resolution, or enhance photo quality buram', ['upscale this photo', 'hd enhance this', 'enhance this image'])
    .run(async (sock, {
        message,
        raw,
        reply,
        typing
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['image']);
        if (!result) return reply(msg('need.image'));

        await typing();
        await reply(msg('wait.upscale'));

        try {
            const output = await upscaleImage(result.buffer, result.mimetype || 'image/jpeg');
            const media = Buffer.isBuffer(output) ? { image: output } : { image: { url: output } };
            await reply({ ...media, caption: '✅ Image upscaled successfully!' });
        } catch (e) {
            await reply(msg('fail.upscale_hint', { msg: e.message }));
        }
    });
