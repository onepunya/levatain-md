import { typing, getArgs, sendMediaBatch } from '../../src/lib/utils.js';

export const meta = {
    interface: {
        cmd:  ['instagram', 'ig'],
        tag:  'download',
        aliasOnly: true,
        desc: 'Download video/foto Instagram (termasuk carousel multi-media)',
        ai: {
            trigger: 'User minta download dari Instagram dengan URL',
            examples: ['ig https://instagram.com/p/xxx', 'download instagram ini'],
            args: { url: 'URL Instagram' },
        },
        async run(sock, { body, raw, from }) {
            const url = getArgs(body);
            if (!url) return sock.sendMessage(from, {
                text: '❌ Masukkan URL Instagram!\nContoh: *.instagram https://www.instagram.com/p/xxx*'
            }, { quoted: raw });

            await typing(sock, from);
            await sock.sendMessage(from, { text: '⏳ Mendownload Instagram...' }, { quoted: raw });

            try {
                const rawText = await fetchDownloadgram(url);
                const items = normalizeDownloadgramMedia(rawText);

                if (!items.length) {
                    throw new Error('Media tidak ditemukan. Pastikan URL benar dan akun tidak di-private.');
                }
                const captionText = '📸 *Instagram Downloaded*';
                await sendMediaBatch(sock, from, items, { caption: captionText, quoted: raw });
            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

async function fetchDownloadgram(igUrl) {
    const response = await fetch("https://api.downloadgram.org/media", {
        method: "POST",
        headers: {
            "accept": "*/*",
            "content-type": "application/x-www-form-urlencoded",
            "referrer": "https://downloadgram.org/",
            "sec-ch-ua": '"Chromium";v="137", "Not/A)Brand";v="24"',
            "sec-ch-ua-mobile": "?1",
            "sec-ch-ua-platform": '"Android"'
        },
        body: new URLSearchParams({ url: igUrl, v: "3", lang: "en" }).toString()
    });

    if (!response.ok) {
        throw new Error(`Gagal menghubungi server (Status: ${response.status})`);
    }

    const text = await response.text();
    return text;
}

function normalizeDownloadgramMedia(text) {
    const itemsMap = new Map();
    const regex = /https:\/\/cdn\.downloadgram\.org\/\?token=([A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const fullUrl = match[0];
        const token = match[1];

        try {
            const payloadBase64 = token.split('.')[1];
            const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf-8');
            const payload = JSON.parse(payloadStr);

            if (payload.filename && !itemsMap.has(payload.filename)) {

                const isVideo = payload.filename.endsWith('.mp4');
                itemsMap.set(payload.filename, {
                    url: fullUrl,
                    type: isVideo ? 'video' : 'image'
                });
            }
        } catch (e) {

        }
    }

    return Array.from(itemsMap.values());
}

