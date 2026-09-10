import axios from 'axios';
import * as cheerio from 'cheerio';
import { typing, getArgs } from '../../src/lib/utils.js';
import { fetchBufferLimited } from '../../src/lib/mediaLimit.js';

export const meta = {
    cmd:  ['twitter', 'twi', 'x'],
    tag:  'download',
    aliasOnly: true,
    desc: 'Download foto/video dari Twitter (X)',
    ai: {
        trigger: 'User minta download foto atau video dari Twitter/X dengan URL',
        examples: ['tw https://x.com/user/status/xxx', 'download twitter ini'],
        args: { url: 'URL Twitter/X' },
    },
};

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

export async function run(sock, { body, raw, from }) {
    const url = getArgs(body);
    if (!url) return sock.sendMessage(from, {
        text: '❌ Masukkan URL Twitter/X!\nContoh: *.twitter https://x.com/user/status/xxx*'
    }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: '⏳ Mendownload Twitter...' }, { quoted: raw });

    try {
        const result = await twitterDownload(url);

        if (result.type === 'video') {
            const buffer = await fetchBuffer(result.links[0]);
            await sock.sendMessage(from, {
                video: buffer,
                caption: `🐦 *${result.title}*`,
            }, { quoted: raw });
        } else {
            for (let i = 0; i < result.links.length; i++) {
                const buffer = await fetchBuffer(result.links[i]);
                await sock.sendMessage(from, {
                    image: buffer,
                    caption: i === 0 ? `🐦 *${result.title}*` : '',
                }, { quoted: raw });
            }
        }
    } catch (e) {
        console.error(e);
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}

async function twitterDownload(url) {
    const { data: html } = await axios.post(
        'https://twmate.com/en2/twitter-photo-downloader/',
        new URLSearchParams({ page: url, ftype: 'all', ajax: '1' }),
        {
            headers: {
                'accept': '*/*',
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'origin': 'https://twmate.com',
                'referer': 'https://twmate.com/en2/twitter-photo-downloader/',
                'user-agent': USER_AGENT,
                'x-requested-with': 'XMLHttpRequest'
            },
            timeout: 25000
        }
    );

    const $ = cheerio.load(html);
    const videoRow = $('.files-table tbody tr').first();
    if (videoRow.length) {
        const href = videoRow.find('a.btn-dl').attr('href');
        if (!href) throw new Error('Link video tidak ditemukan.');
        const title = $('.video-info h4').first().text().trim() || 'Twitter Video';
        return { type: 'video', title, links: [href] };
    }

    const cards = $('.card.icard');
    if (cards.length) {
        const links = [];
        cards.each((_, el) => {
            const href = $(el).find('a.btn-dl').first().attr('href');
            if (href) links.push(href);
        });
        if (!links.length) throw new Error('Link foto tidak ditemukan.');
        return { type: 'photo', title: 'Twitter Photo', links };
    }

    throw new Error('Media tidak ditemukan. Pastikan URL valid dan tweet bersifat publik.');
}

async function fetchBuffer(mediaUrl) {
    return fetchBufferLimited(mediaUrl, {
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://twmate.com/'
        },
        timeout: 60000,
    });
}
