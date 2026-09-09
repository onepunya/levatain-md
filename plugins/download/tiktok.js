import { typing, getArgs } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';

export const meta = {
    cmd:  ['tiktok', 'tt'],
    tag:  'download',
    aliasOnly: true,
    desc: 'Download video TikTok tanpa watermark',
    ai: {
        trigger: 'User minta download video TikTok dengan URL',
        examples: ['tt https://tiktok.com/xxx', 'download tiktok ini'],
        args: { url: 'URL TikTok' },
    },
};

export async function run(sock, { body, raw, from }) {
    const url = getArgs(body);
    if (!url) return sock.sendMessage(from, {
        text: '❌ Masukkan URL TikTok!\nContoh: *.tt https://vt.tiktok.com/xxx*'
    }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: '⏳ Mendownload TikTok...' }, { quoted: raw });

    try {
        const data = await api.tiktok(url);
        await sock.sendMessage(from, {
            video: { url: data.media },
            caption: `🎵 *${data.title || 'TikTok Video'}*\n👤 ${data.author || ''}`,
        }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}
