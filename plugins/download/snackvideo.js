import { typing, getArgs, sendAnyMedia, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('snackvideo')
    .in('download')
    .desc('Download SnackVideo without watermark')
    .prefixOnly()
    .ai({
        trigger: 'User asks to download a SnackVideo with a URL',
        examples: ['snackvideo https://sck.io/p/xxx', 'download snack ini'],
        args: { url: 'SnackVideo URL' },
    })
    .run(async (sock, { body, raw, from, db, primaryId }) => {
        const url = getArgs(body);
        if (!url) return sock.sendMessage(from, {
            text: msg('need.url.snack')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.download_snack') }, { quoted: raw });

        try {
            const formData = new FormData();
            formData.append('url', url);
            formData.append('locale', 'id');
            formData.append('type', 'video');
            formData.append('service', 'snackvideo');

            const response = await fetch('https://dvsnackvideo.com/download.php', {
                method: 'POST',
                headers: {
                    'accept': '*/*',
                    'origin': 'https://dvsnackvideo.com',
                    'referer': 'https://dvsnackvideo.com/id/',
                    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Server DV SnackVideo error (Status: ${response.status})`);
            }

            const html = await response.text();
            const hdMatch = html.match(/data-url="([^"]+)"[^>]*>Download Without Watermark \[HD\]/i);
            const normalMatch = html.match(/data-url="([^"]+)"[^>]*>Download Without Watermark</i);

            let videoUrl = hdMatch ? hdMatch[1] : (normalMatch ? normalMatch[1] : null);

            if (!videoUrl) {
                throw new Error('Failed to find video link on the page.');
            }

            videoUrl = videoUrl.replace(/&amp;/g, '&');

            await sendAnyMedia(sock, from, { url: videoUrl, type: 'video' }, {
                caption: '🍿 *SnackVideo Downloader*',
                quoted: raw,
            });

        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

