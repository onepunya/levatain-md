import { typing, getArgs, sendAnyMedia } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:  ['threads', 'thread'],
        tag:  'download',
        aliasOnly: true,
        desc: 'Download foto/video dari Threads',
        ai: {
            trigger: 'User minta download media dari Threads dengan URL',
            examples: ['threads https://www.threads.net/@user/post/xxx', 'download threads ini'],
            args: { url: 'URL Threads' },
        },
        async run(sock, { body, raw, from }) {
            const url = getArgs(body);
            if (!url) return sock.sendMessage(from, {
                text: '❌ Masukkan URL Threads!\nContoh: *.threads https://www.threads.net/@user/post/xxx*'
            }, { quoted: raw });

            await typing(sock, from);
            await sock.sendMessage(from, { text: '⏳ Mendownload media Threads...' }, { quoted: raw });

            try {
                const response = await fetch('https://www.threadsdl.app/api/threads', {
                    method: 'POST',
                    headers: {
                        'authority': 'www.threadsdl.app',
                        'accept': '*/*',
                        'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                        'content-type': 'application/json',
                        'origin': 'https://www.threadsdl.app',
                        'referer': 'https://www.threadsdl.app/id/',
                        'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
                        'sec-ch-ua-mobile': '?1',
                        'sec-ch-ua-platform': '"Android"',
                        'sec-fetch-dest': 'empty',
                        'sec-fetch-mode': 'cors',
                        'sec-fetch-site': 'same-origin',
                        'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
                    },
                    body: JSON.stringify({ url: url })
                });

                if (!response.ok) {
                    throw new Error(`Gagal menghubungi server (Status: ${response.status})`);
                }

                const data = await response.json();

                if (!data || !data.medias || data.medias.length === 0) {
                    throw new Error('Media tidak ditemukan atau URL tidak valid');
                }

                const captionText = `🧵 *Threads* - @${data.username || 'user'}\n\n${data.text || ''}`.trim();

                for (const item of data.medias) {
                    let mediaUrl = '';
                    let isVideo = false;

                    if (item.videos && item.videos.length > 0) {
                        mediaUrl = item.videos[0].url;
                        isVideo = true;
                    } else if (item.images && item.images.length > 0) {
                        mediaUrl = item.images[0].url || item.images[0];
                    }

                    if (!mediaUrl) continue;

                    await sendAnyMedia(sock, from, { url: mediaUrl, type: isVideo ? 'video' : 'image' }, {
                        caption: captionText,
                        quoted: raw,
                    });
                }
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

