import { typing, getArgs } from '../../src/lib/utils.js';
import axios from 'axios';

export const meta = {
    interface: {
        cmd: ['porn', 'bokep'],
        tag: 'download',
        aliasOnly: true,
        desc: 'Dapatkan daftar link download video dewasa dari semua situs dewasa',
        ai: {
            trigger: 'User minta daftar link download video dewasa',
            examples: ['porn url video dewasa', 'download video porno ini'],
            args: { url: 'URL dewasa pornhub, xnxx dll' },
        },
        async run(sock, { body, raw, from }) {
            const url = getArgs(body);
            if (!url) return sock.sendMessage(from, {
                text: '❌ Masukkan URL video dewasa dari situs apa pun, pornhub, xnxx, xvideos dll'
            }, { quoted: raw });

            await typing(sock, from);
            await sock.sendMessage(from, { text: '⏳ Mendapatkan info video...' }, { quoted: raw });

            try {
                const data = await getVideoInfo(url);

                if (!data || !data.download_urls) {
                    return await sock.sendMessage(from, { text: '❌ Gagal mendapatkan link download video.' }, { quoted: raw });
                }

                let listLinks = '📋 *Daftar Link Download Video:*\n\n';
                for (const item of data.download_urls) {
                    listLinks += `*Kualitas:* ${item.name}\n*Link:* ${item.url}\n\n`;
                }

                await sock.sendMessage(from, { text: listLinks }, { quoted: raw });
            } catch (e) {
                console.error(e);
                await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

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

