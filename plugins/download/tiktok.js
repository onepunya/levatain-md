import { api } from '../../src/api/index.js';
import { getArgs, sendAnyMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tiktok', 'tt')
    .in('download')
    .desc('Download TikTok video without watermark')
    .prefixOnly()
    .ai({
        trigger: 'User asks to download a TikTok video with a URL (only for getting the video file — if they ask what song/music is in it, use songfinder instead)',
        examples: ['tiktok https://tiktok.com/xxx', 'download this tiktok'],
        args: { url: 'TikTok URL' },
    })
    .run(async (sock, {
        body,
        raw,
        from,
        reply,
        typing
    }) => {
        const url = getArgs(body);
        if (!url) return reply(msg('need.url.tiktok'));

        await typing();
        await reply(msg('wait.download_tiktok'));

        try {
            const data = await api.tiktok(url);
            await sendAnyMedia(sock, from, { url: data.media, type: 'video' }, {
                caption: `🎵 *${data.title || 'TikTok Video'}*\n👤 ${data.author || ''}`,
                quoted: raw,
            });
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
