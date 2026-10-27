import axios from 'axios';
import * as cheerio from 'cheerio';
import { fetchBufferLimited } from '../../src/media/mediaLimit.js';
import { getArgs } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('facebook', 'fb')
    .in('download')
    .desc('Download Facebook video/photo')
    .prefixOnly()
    .ai({
        trigger: 'User asks to download from Facebook with a URL',
        examples: ['fb https://www.facebook.com/share/r/xxx/', 'download facebook ini'],
        args: { url: 'Facebook URL' },
    })
    .run(async (sock, { body, reply, typing }) => {
        const url = getArgs(body);
        if (!url) return reply(msg('need.url.fb'));

        await typing();
        await reply(msg('wait.download_fb'));

        try {
            const data = await fbDownloader(url);

            if (!data || !data.video) {
                return await reply(msg('fail.link_fb'));
            }

            const videoBuffer = await fetchBufferLimited(data.video, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
                    'Referer': 'https://fget.io/'
                },
                timeout: 60000,
            });

            await reply({
                video: videoBuffer,
                caption: '📸 *facebook*',
            });

        } catch (e) {
            console.error(e);
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });

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
            throw new Error('Video link not found or private.');
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
        throw new Error(err.response ? `Server rejected request (${err.response.status})` : err.message);
    }
}
