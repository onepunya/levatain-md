import { typing, getArgs, downloadMedia, getExtFromMime } from '../../src/lib/utils.js';
import { config } from '../../src/config.js';
const apiKeys = config.magicHour.keys;

let keyIndex = 0;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function uploadToMagicHour(currentKey, buffer, mimetype) {
    const ext = getExtFromMime(mimetype || 'image/jpeg');

    const urlRes = await fetch('https://api.magichour.ai/v1/files/upload-urls', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'authorization': `Bearer ${currentKey}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({ items: [{ type: 'image', extension: ext }] })
    });

    if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.message || `Gagal minta upload URL (${urlRes.status})`);
    }

    const urlData = await urlRes.json();
    const { upload_url, file_path } = urlData.items[0];

    const putRes = await fetch(upload_url, { method: 'PUT', body: buffer });
    if (!putRes.ok) {
        throw new Error(`Gagal upload ke storage Magic Hour (${putRes.status})`);
    }

    return file_path;
}

export const meta = {
    interface: {
        cmd:  ['editimage', 'aiedit'],
        tag:  'ai',
        aliasOnly: true,
        desc: 'Edit gambar pakai prompt AI (Magic Hour)',
        ai: {
            trigger: 'User minta edit gambar menggunakan AI dengan prompt',
            examples: ['editimage berikan kacamata hitam', 'aiedit ganti background jadi pantai'],
            args: { input: 'Prompt Edit (reply/kirim gambar)' },
        },
        async run(sock, { body, message, raw, from }) {
            const prompt = getArgs(body);

            if (!prompt) {
                return sock.sendMessage(from, {
                    text: '❌ Format salah!\nContoh: *.editimage berikan kacamata hitam di wajahnya*\n\nJangan lupa reply/kirim gambarnya ya.'
                }, { quoted: raw });
            }

            const result = await downloadMedia(raw, message.quoted, ['image']);
            if (!result) {
                return sock.sendMessage(from, { text: '❌ Kirim atau reply gambar dulu.' }, { quoted: raw });
            }

            if (apiKeys.length === 0) {
                return sock.sendMessage(from, { text: '❌ Fitur ini belum dikonfigurasi (MAGICHOUR_KEY_* kosong di .env).' }, { quoted: raw });
            }

            await typing(sock, from);
            await sock.sendMessage(from, { text: '⏳ Mengupload gambar & mengirim instruksi ke AI...' }, { quoted: raw });

            try {
                const currentKey = apiKeys[keyIndex];
                keyIndex = (keyIndex + 1) % apiKeys.length;

                const filePath = await uploadToMagicHour(currentKey, result.buffer, result.mimetype);

                const initResponse = await fetch('https://api.magichour.ai/v1/ai-image-editor', {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json',
                        'authorization': `Bearer ${currentKey}`,
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: `Bot Edit - ${Date.now()}`,
                        image_count: 1,
                        model: "flux-2-klein",
                        aspect_ratio: "auto",
                        resolution: "640px",
                        style: { prompt: prompt },
                        assets: { image_file_paths: [filePath] }
                    })
                });

                if (!initResponse.ok) {
                    const err = await initResponse.json();
                    throw new Error(err.message || `Init Error: ${initResponse.status}`);
                }

                const initData = await initResponse.json();
                const projectId = initData.id;

                let isCompleted = false;
                let imageUrl = null;
                let attempts = 0;
                const maxAttempts = 15;

                await sock.sendMessage(from, { text: `🔄 AI sedang menggambar... (ID: ${projectId})` }, { quoted: raw });

                while (!isCompleted && attempts < maxAttempts) {
                    await delay(5000);

                    const checkResponse = await fetch(`https://api.magichour.ai/v1/image-projects/${projectId}`, {
                        method: 'GET',
                        headers: {
                            'accept': 'application/json',
                            'authorization': `Bearer ${currentKey}`
                        }
                    });

                    if (checkResponse.ok) {
                        const checkData = await checkResponse.json();
                        const status = checkData.status?.toLowerCase();

                        if (status === 'complete') {
                            isCompleted = true;
                            imageUrl = checkData.downloads?.[0]?.url || null;
                        } else if (status === 'error') {
                            const msg = checkData.error?.message || checkData.error?.code || 'Alasan tidak diketahui';
                            throw new Error(`AI gagal merender gambar: ${msg} (kredit sudah di-refund otomatis).`);
                        } else if (status === 'canceled') {
                            throw new Error('Proses dibatalkan.');
                        }
                    }

                    attempts++;
                }

                if (isCompleted && imageUrl) {
                    await sock.sendMessage(from, {
                        image: { url: imageUrl },
                        caption: `🎨 *AI Image Editor*\n\n*Prompt:* ${prompt}`
                    }, { quoted: raw });
                } else {
                    throw new Error('Waktu tunggu habis (Timeout). Server AI terlalu sibuk.');
                }

            } catch (e) {
                await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
            }
        },
    },
};

