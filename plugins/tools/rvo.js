import { typing, downloadMedia, msg } from '../../src/lib/index.js';
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
    .run(async (sock, ctx) => {
        const { message, raw, from } = ctx;
        const result = await downloadMedia(raw, message.quoted, ['image', 'video', 'audio']);

        if (!result) {
            return sock.sendMessage(from, { text: msg('need.viewonce') }, { quoted: raw });
        }

        await typing(sock, from);

        try {
            const caption = msg('done.viewonce');
            const opts = { quoted: raw };

            if (result.type === 'image') {
                await sock.sendMessage(from, {
                    image: result.buffer,
                    caption,
                    mimetype: result.mimetype || 'image/jpeg',
                }, opts);
            } else if (result.type === 'video') {
                await sock.sendMessage(from, {
                    video: result.buffer,
                    caption,
                    mimetype: result.mimetype || 'video/mp4',
                }, opts);
            } else if (result.type === 'audio') {
                await sock.sendMessage(from, {
                    audio: result.buffer,
                    mimetype: result.mimetype || 'audio/ogg; codecs=opus',
                    ptt: true,
                }, opts);
                await sock.sendMessage(from, { text: caption }, opts);
            } else {
                await sock.sendMessage(from, { text: msg('fail.unsupported') }, opts);
            }
        } catch (e) {
            await sock.sendMessage(
                from,
                { text: msg('fail.viewonce', { msg: e.message }) },
                { quoted: raw }
            );
        }
    });
