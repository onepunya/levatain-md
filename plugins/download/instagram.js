import { typing, getArgs, sendMediaBatch, base64ToString, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('instagram', 'ig')
    .in('download')
    .desc('Download Instagram video/photo (including multi-media carousel)')
    .prefixOnly()
    .ai({
        trigger: 'User asks to download from Instagram with a URL',
        examples: ['ig https://instagram.com/p/xxx', 'download instagram ini'],
        args: { url: 'Instagram URL' },
    })
    .run(async (sock, { body, raw, from, db, primaryId }) => {
        const url = getArgs(body);
        if (!url) return sock.sendMessage(from, {
            text: msg('need.url.ig')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.download_ig') }, { quoted: raw });

        try {
            const rawText = await fetchDownloadgram(url);
            const items = normalizeDownloadgramMedia(rawText);

            if (!items.length) {
                throw new Error('Media not found. Ensure the URL is correct and the account is not private.');
            }
            const captionText = '📸 *Instagram Downloaded*';
            await sendMediaBatch(sock, from, items, { caption: captionText, quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

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
        throw new Error(`Failed to reach server (Status: ${response.status})`);
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
            const payloadStr = base64ToString(payloadBase64);
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

