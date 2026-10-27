import { downloadMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('rvo', 'readviewonce', 'readvo', 'viewonce')
    .in('tools')
    .desc('Open a View Once message (image/video/audio) so it can be viewed again')
    .prefixOnly()
    .cooldown(3)
    .signal('User asks to buka / baca pesan view once atau rvo', [
        'open this view once',
        'rvo',
        'read view once',
        'open once-viewed message',
    ])
    .run(async (sock, {
        message,
        raw,
        reply,
        typing
    }) => {
        const result = await downloadMedia(raw, message.quoted, ['image', 'video', 'audio']);

        if (!result) {
            return reply(msg('need.viewonce'));
        }

        await typing();

        try {
            const caption = msg('done.viewonce');

            if (result.type === 'image') {
                await reply({ image: result.buffer, caption, mimetype: result.mimetype || 'image/jpeg' });
            } else if (result.type === 'video') {
                await reply({ video: result.buffer, caption, mimetype: result.mimetype || 'video/mp4' });
            } else if (result.type === 'audio') {
                await reply({ audio: result.buffer, mimetype: result.mimetype || 'audio/ogg; codecs=opus', ptt: true });
                await reply(caption);
            } else {
                await reply(msg('fail.unsupported'));
            }
        } catch (e) {
            await reply(msg('fail.viewonce', { msg: e.message }));
        }
    });
