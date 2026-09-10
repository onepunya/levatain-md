import axios from 'axios';
import https from 'https';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { typing, getArgs, sendMediaBatch, sendAnyMedia } from '../../src/lib/utils.js';

const execFileAsync = promisify(execFile);

export const meta = {
    cmd:  ['pinterest', 'pin'],
    tag:  'download',
    aliasOnly: true,
    desc: 'Download Pinterest dari link, atau cari gambar Pinterest dari kata kunci',
    ai: {
        trigger: 'User minta download Pinterest dengan URL, atau cari/search gambar di Pinterest',
        examples: [
            'pin https://pin.it/xxxxx',
            'pin https://www.pinterest.com/pin/123456789/',
            'pin kucing lucu',
            'cariin gambar aesthetic di pinterest',
        ],
        args: { input: 'URL pin Pinterest, atau kata kunci pencarian' },
    },
};

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';
const IS_LINK = (s) => /pin\.it\//i.test(s) || (/pinterest\.[a-z.]+/i.test(s) && /\/pin\//i.test(s));

const BROWSER_HEADERS = {
    'accept-language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua': '"Chromium";v="137", "Not/A)Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
};

async function pinterestDownloader(url) {
    if (url.includes('pin.it')) {
        try {
            const expand = await axios.get(url, {
                headers: { 'User-Agent': USER_AGENT, ...BROWSER_HEADERS },
                timeout: 15000,
            });
            url = expand.request.res.responseUrl;
        } catch (e) {
            if (e.response) {
                throw new Error(`Gagal expand pin.it (${e.response.status}). Coba pakai link pinterest.com/pin/... langsung.`);
            }
            throw e;
        }
    }

    if (!url.endsWith('/')) url += '/';

    const step1 = Buffer.from(url).toString('base64');
    const step2 = Buffer.from(step1).toString('base64');
    const token = 'a' + step2;

    const target = `https://pindl.directget.online/get-info?url=${encodeURIComponent(url)}&token=${token}`;

    const curlArgs = [
        target,
        '-H', 'authority: pindl.directget.online',
        '-H', 'accept: */*',
        '-H', `accept-language: ${BROWSER_HEADERS['accept-language']}`,
        '-H', 'origin: https://www.pinflik.com',
        '-H', 'referer: https://www.pinflik.com/',
        '-H', `sec-ch-ua: ${BROWSER_HEADERS['sec-ch-ua']}`,
        '-H', `sec-ch-ua-mobile: ${BROWSER_HEADERS['sec-ch-ua-mobile']}`,
        '-H', `sec-ch-ua-platform: ${BROWSER_HEADERS['sec-ch-ua-platform']}`,
        '-H', `sec-fetch-dest: ${BROWSER_HEADERS['sec-fetch-dest']}`,
        '-H', `sec-fetch-mode: ${BROWSER_HEADERS['sec-fetch-mode']}`,
        '-H', `sec-fetch-site: ${BROWSER_HEADERS['sec-fetch-site']}`,
        '-H', `user-agent: ${USER_AGENT}`,
        '--compressed',
        '-s',
        '-w', '\n%{http_code}',
        '--max-time', '25',
    ];

    let stdout;
    try {
        ({ stdout } = await execFileAsync('curl', curlArgs));
    } catch (e) {
        throw new Error(`curl gagal dieksekusi: ${e.message}`);
    }

    const lastNewline = stdout.lastIndexOf('\n');
    const body = stdout.slice(0, lastNewline);
    const statusCode = parseInt(stdout.slice(lastNewline + 1).trim(), 10);

    if (statusCode >= 400) {
        throw new Error(`pindl API ${statusCode}: ${body.slice(0, 200)}`);
    }

    try {
        return JSON.parse(body);
    } catch {
        throw new Error(`pindl API respon bukan JSON valid: ${body.slice(0, 200)}`);
    }
}

async function pinterestSearch(query) {
    const agent = new https.Agent({ keepAlive: true });

    const home = await axios.get('https://id.pinterest.com/', {
        httpsAgent: agent,
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        },
        timeout: 15000,
    });

    const rawCookies = home.headers['set-cookie'] || [];
    const cookies    = rawCookies.map(c => c.split(';')[0]).join('; ');
    const csrfMatch  = rawCookies.find(c => c.startsWith('csrftoken=')) || '';
    const csrf       = csrfMatch.split('=')[1]?.split(';')[0] || '4b99c664d3befbbc8e8a86c367936b38';

    const source_url = `/search/pins/?q=${encodeURIComponent(query)}&rs=rs`;
    const postData = {
        options: { query, scope: 'pins', rs: 'rs', redux_normalize_feed: true },
        context: {},
    };

    const body = new URLSearchParams({
        source_url,
        data: JSON.stringify(postData),
    });

    try {
        const res = await axios.post(
            'https://id.pinterest.com/resource/BaseSearchResource/get/',
            body.toString(),
            {
                httpsAgent: agent,
                headers: {
                    'authority': 'id.pinterest.com',
                    'accept': 'application/json, text/javascript, */*; q=0.01',
                    'content-type': 'application/x-www-form-urlencoded',
                    'referer': `https://id.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
                    'user-agent': USER_AGENT,
                    'x-csrftoken': csrf,
                    'x-requested-with': 'XMLHttpRequest',
                    'cookie': cookies,
                    ...BROWSER_HEADERS,
                },
                timeout: 25000,
            }
        );
        return res.data;
    } catch (e) {
        if (e.response) {
            throw new Error(`pinterest search ${e.response.status}: ${JSON.stringify(e.response.data).slice(0, 200)}`);
        }
        throw e;
    }
}

const bestImageUrl = (images = {}) =>
    images.orig?.url || images['736x']?.url || images['474x']?.url || images['236x']?.url || null;

const pinUrl = (id) => `https://www.pinterest.com/pin/${id}/`;

export async function run(sock, { body, raw, from }) {
    const input = getArgs(body);
    if (!input) return sock.sendMessage(from, {
        text: '❌ Masukkan link Pinterest atau kata kunci pencarian!\n\n'
            + 'Contoh:\n'
            + '• *.pinterest https://pin.it/xxxxx* _(download pin)_\n'
            + '• *.pinterest kucing lucu* _(cari gambar)_',
    }, { quoted: raw });

    await typing(sock, from);

    if (IS_LINK(input)) {
        await sock.sendMessage(from, { text: '⏳ Mendownload Pinterest...' }, { quoted: raw });
        try {
            const res = await pinterestDownloader(input);
            const data = res?.data;
            if (!res?.success || !data?.url) {
                throw new Error(res?.message || 'Media tidak ditemukan. Pastikan link pin valid.');
            }

            const captionParts = [`📌 *${data.title || 'Pinterest'}*`];
            if (data.author) captionParts.push(`by ${data.author}`);

            await sendMediaBatch(sock, from, [{ url: data.url, type: data.type === 'video' ? 'video' : 'image' }], {
                caption: captionParts.join('\n'),
                quoted: raw,
            });
        } catch (e) {
            console.error(e);
            await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
        }
        return;
    }

    await sock.sendMessage(from, { text: `⏳ Mencari "${input}" di Pinterest...` }, { quoted: raw });
    try {
        const res = await pinterestSearch(input);
        const results = res?.resource_response?.data?.results || [];

        const items = results
            .map(r => ({ id: r.id, title: r.title, url: bestImageUrl(r.images) }))
            .filter(r => r.url)
            .slice(0, 6);

        if (!items.length) {
            throw new Error('Gambar tidak ditemukan. Coba kata kunci lain.');
        }

        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const caption = i === 0
                ? `📌 *Hasil pencarian: "${input}"*\n_Balas .pin <link> pakai link di bawah untuk download versi original_\n${pinUrl(it.id)}`
                : pinUrl(it.id);
            await sendAnyMedia(sock, from, { url: it.url, type: 'image' }, { caption, quoted: raw });
        }
    } catch (e) {
        console.error(e);
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}
