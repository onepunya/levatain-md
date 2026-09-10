import { typing, getArgs, sendAnyMedia } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['snackvideo'],
    tag:  'download',
    aliasOnly: true,
    desc: 'Download video dari SnackVideo tanpa watermark',
    ai: {
        trigger: 'User minta download video dari SnackVideo dengan URL',
        examples: ['snackvideo https://sck.io/p/xxx', 'download snack ini'],
        args: { url: 'URL SnackVideo' },
    },
};

export async function run(sock, { body, raw, from }) {
    const url = getArgs(body);
    if (!url) return sock.sendMessage(from, {
        text: '❌ Masukkan URL SnackVideo!\nContoh: *.snackvideo https://sck.io/p/xxx*'
    }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: '⏳ Mengekstrak video dari SnackVideo...' }, { quoted: raw });

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
            throw new Error('Gagal menemukan link video di dalam halaman.');
        }

        videoUrl = videoUrl.replace(/&amp;/g, '&');

        await sendAnyMedia(sock, from, { url: videoUrl, type: 'video' }, {
            caption: '🍿 *SnackVideo Downloader*',
            quoted: raw,
        });

    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}
