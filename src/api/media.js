import { logger } from '../util/logger.js';
import { config } from '../config.js';
import { sleep, uploadToUrl } from '../util/utils.js';
import { curlRequest, curlMultipart, curlMultipartFile } from './http.js';
import { ytHandler } from './youtube.js';

const FLUX_BASE_URL = 'https://www.techgrapple.com';
const FLUX_HEADERS = {
    'accept': '*/*',
    'origin': FLUX_BASE_URL,
    'referer': `${FLUX_BASE_URL}/online-tools/free-ai-text-to-image-generation-with-flux-1-1/`,
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
};

const fluxRetry = async (fn, max = 2) => {
    try {
        return await fn();
    } catch (e) {
        if (max <= 0) throw e;
        await sleep(2000);
        return fluxRetry(fn, max - 1);
    }
};

const generateFlux = (prompt) => fluxRetry(async () => {
    const rawGen = await curlMultipart(`${FLUX_BASE_URL}/flux-image/generate`, FLUX_HEADERS, {
        model: 'schnell',
        prompt,
        width: '1024',
        height: '768',
        guidance: '0.0',
        seed_type: 'random',
        seed_value: '',
    });
    logger.debug(`[flux:generate] → ${rawGen.slice(0, 300)}`);

    let data;
    try {
        data = JSON.parse(rawGen);
    } catch {
        throw new Error(`GENERATE_NOT_JSON: ${rawGen.slice(0, 150)}`);
    }
    if (!data.task_id) throw new Error(`NO_TASK_ID: ${JSON.stringify(data).slice(0, 150)}`);
    const taskId = data.task_id;

    for (let i = 0; i < 20; i++) {
        await sleep(2000 + Math.random() * 1000);

        const rawStatus = await curlRequest('GET', `${FLUX_BASE_URL}/flux-image/status/${taskId}`, FLUX_HEADERS);
        logger.debug(`[flux:status ${i}] → ${rawStatus.slice(0, 200)}`);

        let result;
        try {
            result = JSON.parse(rawStatus);
        } catch {
            throw new Error(`STATUS_NOT_JSON: ${rawStatus.slice(0, 150)}`);
        }

        if (result.status === 'done') {
            if (!result.image) throw new Error(`NO_IMAGE_FIELD: ${JSON.stringify(result).slice(0, 150)}`);
            return result.image;
        }
        if (result.status === 'failed') throw new Error(`GENERATION_FAILED: ${JSON.stringify(result).slice(0, 150)}`);
    }
    throw new Error('TIMEOUT: task did not complete after 20x polling');
});

export const mediaApi = {
    imagine: async (prompt) => {
        let txtz = prompt;
        try {
            const email = config.translateEmail ? `&de=${config.translateEmail}` : '';
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(prompt)}&langpair=id|en${email}`;
            const raw = await curlRequest('GET', url, {});
            const data = JSON.parse(raw);
            if (data?.responseData?.translatedText) txtz = data.responseData.translatedText;
        } catch (e) {
            logger.warn(`[imagine] Translate failed, using original prompt: ${e.message}`);
        }

        const base64 = await generateFlux(txtz);
        const buffer = Buffer.from(base64, 'base64');
        if (buffer.length < 1000) throw new Error('Gambar hasil generate invalid.');
        return buffer;
    },

    ytdl: async (url, format = 'mp4', onProgress) => await ytHandler.download(url, format, onProgress),
    ytplay: async (query, onProgress) => await ytHandler.play(query, onProgress),

    tiktok: async (url) => {
        const { default: axios } = await import('axios');
        const TIKWM = 'https://www.tikwm.com';
        const abs = (u) => (u && u.startsWith('/') ? `${TIKWM}${u}` : u);

        let res;
        for (let i = 0; i < 3; i++) {
            const { data } = await axios.get(`${TIKWM}/api/`, {
                params: { url },
                headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' },
                timeout: 25000,
            });
            res = data;
            if (data && data.code === 0 && data.data) break;
            if (i < 2) await sleep(1500);
        }

        if (!res || res.code !== 0 || !res.data) throw new Error(res?.msg || 'Failed to download TikTok.');

        const d = res.data;
        const media = abs(d.play) || abs(d.hdplay);
        if (!media) throw new Error('Video TikTok tidak ditemukan (kemungkinan postingan slideshow/foto).');

        return {
            title: d.title || '',
            author: d.author?.nickname || d.author?.unique_id || '',
            duration: d.duration,
            format: 'mp4',
            media,
            cover: abs(d.cover),
            size: d.size || 'unknown',
        };
    },


    removebg: async (input, mimetype = 'image/jpeg') => {
        const { default: axios } = await import('axios');

        let buffer;
        if (Buffer.isBuffer(input)) {
            buffer = input;
        } else if (typeof input === 'string') {
            const res = await axios.get(input, { responseType: 'arraybuffer', timeout: 30000 });
            buffer = Buffer.from(res.data);
            const ct = res.headers['content-type'];
            if (ct && ct.startsWith('image/')) mimetype = ct.split(';')[0].trim();
        } else {
            throw new Error('removebg: input harus Buffer atau URL string');
        }

        const mimeMap = {
            'image/jpeg': 'image/jpeg',
            'image/jpg': 'image/jpeg',
            'image/png': 'image/png',
            'image/webp': 'image/webp',
            'image/gif': 'image/gif',
        };
        const mime = mimeMap[mimetype] || 'image/jpeg';
        const ext = mime.split('/')[1] === 'jpeg' ? 'jpg' : mime.split('/')[1];
        const dataURL = `data:${mime};base64,${buffer.toString('base64')}`;

        const { data } = await axios.post(
            'https://background-remover.com/removeImageBackground',
            {
                encodedImage: dataURL,
                title: `image.${ext}`,
                mimeType: mime,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Origin': 'https://background-remover.com',
                    'Referer': 'https://background-remover.com/upload',
                    'Accept': '*/*',
                    'User-Agent':
                        'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
                },
                timeout: 60000,
                maxContentLength: 50 * 1024 * 1024,
                maxBodyLength: 50 * 1024 * 1024,
            }
        );

        if (!data?.encodedImageWithoutBackground) {
            throw new Error('Response tidak mengandung encodedImageWithoutBackground');
        }

        let b64 = data.encodedImageWithoutBackground;
        if (typeof b64 === 'string' && b64.startsWith('data:')) {
            b64 = b64.split(',')[1];
        }

        const pngBuffer = Buffer.from(b64, 'base64');
        if (pngBuffer.length < 100) throw new Error('Hasil remove background invalid / terlalu kecil');
        return pngBuffer;
    },

    tourl: async (buffer, mimetype = 'image/jpeg') => uploadToUrl(buffer, mimetype),


};
