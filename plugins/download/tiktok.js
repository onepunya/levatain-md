import { typing, getArgs, sendAnyMedia, api, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tiktok', 'tt')
    .in('download')
    .desc('Download TikTok video without watermark')
    .prefixOnly()
    .ai({
        trigger: 'User asks to download a TikTok video with a URL',
        examples: ['tiktok https://tiktok.com/xxx', 'download this tiktok'],
        args: { url: 'TikTok URL' },
    })
    .run(async (sock, { body, raw, from, db, primaryId }) => {
        const url = getArgs(body);
        if (!url) return sock.sendMessage(from, {
            text: msg('need.url.tiktok')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.download_tiktok') }, { quoted: raw });

        try {
            const data = await api.tiktok(url);
            await sendAnyMedia(sock, from, { url: data.media, type: 'video' }, {
                caption: `🎵 *${data.title || 'TikTok Video'}*\n👤 ${data.author || ''}`,
                quoted: raw,
            });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

