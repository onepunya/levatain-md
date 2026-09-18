import { typing, getArgs, msg } from '../../src/lib/index.js';
import axios from 'axios';
import { plugin } from '../../src/core/plugin.js';

export default plugin('porn', 'bokep')
    .in('download')
    .desc('Get adult video download links from supported sites')
    .prefixOnly()
    .ai({
        trigger: 'User asks for adult video download links',
        examples: ['porn url video dewasa', 'download video porno ini'],
        args: { url: 'Adult video URL' },
    })
    .run(async (sock, { body, raw, from, db, primaryId }) => {
        const url = getArgs(body);
        if (!url) return sock.sendMessage(from, {
            text: msg('need.url.porn')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.video_info') }, { quoted: raw });

        try {
            const data = await getVideoInfo(url);

            if (!data || !data.download_urls) {
                return await sock.sendMessage(from, { text: msg('fail.link') }, { quoted: raw });
            }

            let listLinks = '📋 *Video Download Links:*\n\n';
            for (const item of data.download_urls) {
                listLinks += `*Quality:* ${item.name}\n*Link:* ${item.url}\n\n`;
            }

            await sock.sendMessage(from, { text: listLinks }, { quoted: raw });
        } catch (e) {
            console.error(e);
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

async function getVideoInfo(videoUrl) {
    const apiEndpoint = 'https://xxxdl.net/api/video-download/info/';
    const params = new URLSearchParams({ url: videoUrl });
    const response = await axios.get(`${apiEndpoint}?${params.toString()}`, {
        headers: {
            'authority': 'xxxdl.net',
            'accept': '*/*',
            'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',
            'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
            'x-requested-with': 'XMLHttpRequest'
        }
    });
    return response.data;
}

