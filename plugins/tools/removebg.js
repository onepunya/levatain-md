import { api } from '../../src/api/index.js';
import { downloadMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('removebg', 'rmbg')
    .in('tools')
    .desc('Remove background from an image')
    .prefixOnly()
    .signal('User asks to remove image background or make it transparent', ['remove background foto ini', 'removebg'])
    .run(async (sock, {
        message,
        raw,
        reply,
        typing
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['image']);
        if (!result) return reply(msg('need.image'));

        await typing();
        await reply(msg('wait.removebg'));

        try {
            const output = await api.removebg(result.buffer, result.mimetype || 'image/jpeg');
            await reply({
                image: output,
                mimetype: 'image/png',
                caption: msg('done.bg_removed'),
            });
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
