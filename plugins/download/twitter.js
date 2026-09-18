import axios from 'axios';
import * as cheerio from 'cheerio';
import { typing, getArgs, fetchBufferLimited, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('twitter', 'twi', 'x')
    .in('download')
    .desc('Download photo/video from Twitter (X)')
    .prefixOnly()
    .ai({
        trigger: 'User asks to download photo or video from Twitter/X with a URL',
        examples: ['tw https://x.com/user/status/xxx', 'download twitter ini'],
        args: { url: 'Twitter/X URL' },
    })
    .run(async (sock, { body, raw, from, db, primaryId }) => {
        const url = getArgs(body);
        if (!url) return sock.sendMessage(from, {
            text: msg('need.url.twitter')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.download_tw') }, { quoted: raw });

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
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

const USER_AGENT = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

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
        if (!href) throw new Error('Video link not found.');
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
        if (!links.length) throw new Error('Photo link not found.');
        return { type: 'photo', title: 'Twitter Photo', links };
    }

    throw new Error('Media not found. Ensure the URL is valid and the tweet is public.');
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
