import { typing, getArgs } from '../../src/lib/utils.js';
import { api } from '../../src/lib/api.js';

export const meta = {
    cmd:  ['capcut'],
    tag:  'download',
    aliasOnly: true,
    desc: 'Download video template CapCut tanpa watermark',
    ai: {
        trigger: 'User minta download template CapCut dengan URL',
        examples: ['capcut https://www.capcut.com/template/xxx', 'download capcut ini'],
        args: { url: 'URL template CapCut' },
    },
};

export async function run(sock, { body, raw, from }) {
    const url = getArgs(body);
    if (!url) return sock.sendMessage(from, {
        text: '❌ Masukkan URL CapCut!\nContoh: *.capcut https://www.capcut.com/template/xxx*'
    }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: '⏳ Mendownload template CapCut...' }, { quoted: raw });

    try {
        const data = await api.capcut(url);
        await sock.sendMessage(from, {
            video: { url: data.media },
            caption: `🎬 *CapCut Template*\n${data.title}\n👤 ${data.author}`,
        }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
    }
}
