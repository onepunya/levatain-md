import axios from 'axios';
import * as cheerio from 'cheerio';
import { typing, getArgs } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['fb', 'facebook'],
    tag:  'download',
    aliasOnly: true,
    desc: 'Download video/foto facebook',
    ai: {
        trigger: 'User minta download dari facebook dengan URL',
        examples: ['fb https://www.facebook.com/share/r/xxx/', 'download facebook ini'],
        args: { url: 'URL facebook' },
    },
};

export async function run(sock, { body, raw, from }) {
    const url = getArgs(body);
    if (!url) return sock.sendMessage(from, {
        text: '❌ Masukkan URL Facebook\nContoh: *.fb https://www.facebook.com/share/r/xxx/*'
    }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: '⏳ Mendownload Facebook...' }, { quoted: raw });

    try {
        const data = await fbDownloader(url);

        if (!data || !data.video) {
            return await sock.sendMessage(from, { text: '❌ Gagal mendapatkan link video dari Facebook.' }, { quoted: raw });
        }

        const videoResponse = await axios.get(data.video, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://fget.io/'
            },
            timeout: 60000
        });

        const videoBuffer = Buffer.from(videoResponse.data, 'binary');

        await sock.sendMessage(from, {
            video: videoBuffer,
            caption: '📸 *facebook*',
        }, { quoted: raw });

    } catch (e) {
        console.error(e);
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}

async function fbDownloader(url) {
    try {
        const payload = new URLSearchParams();
        payload.append('id', url);
        payload.append('locale', 'id');

        const { data } = await axios.post('https://fget.io/process', payload, {
            headers: {
                'accept': '*/*',
                'content-type': 'application/x-www-form-urlencoded',
                'hx-request': 'true',
                'hx-target': 'target',
                'origin': 'https://fget.io',
                'referer': 'https://fget.io/id',
                'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36'
            },
            timeout: 25000
        });

        const $ = cheerio.load(data);

        const title = $('.result-title').text().trim() || '-';
        const thumbnail = $('.result-thumbnail img').attr('src') || '';

        const hd = $('a.download-result.hd').attr('href') || $("a:contains('720p')").attr('href') || '';
        const sd = $('a.download-result.sd').attr('href') || $("a:contains('360p')").attr('href') || '';
        const audio = $('a.download-result.mp3, a.mp3').attr('href') || '';

        if (!hd && !sd) {
            throw new Error('Link video tidak ditemukan atau private.');
        }

        return {
            title,
            thumbnail,
            video: hd || sd,
            hd,
            sd,
            audio
        };
    } catch (err) {
        throw new Error(err.response ? `Server menolak request (${err.response.status})` : err.message);
    }
}
