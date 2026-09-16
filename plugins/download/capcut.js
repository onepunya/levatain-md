import { typing, getArgs, sendAnyMedia, api } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('capcut')
    .in('download')
    .desc('Download video template CapCut tanpa watermark')
    .prefixOnly()
    .ai({
        trigger: 'User minta download template CapCut dengan URL',
        examples: ['capcut https://www.capcut.com/template/xxx', 'download capcut ini'],
        args: { url: 'URL template CapCut' },
    })
    .run(async (sock, { body, raw, from }) => {
        const url = getArgs(body);
        if (!url) return sock.sendMessage(from, {
            text: '❌ Masukkan URL CapCut!\nContoh: *.capcut https://www.capcut.com/template/xxx*'
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: '⏳ Mendownload template CapCut...' }, { quoted: raw });

        try {
            const data = await api.capcut(url);
            await sendAnyMedia(sock, from, { url: data.media, type: 'video' }, {
                caption: `🎬 *CapCut Template*\n${data.title}\n👤 ${data.author}`,
                quoted: raw,
            });
        } catch (e) {
            await sock.sendMessage(from, { text: `❌ Gagal: ${e.message}` }, { quoted: raw });
        }
    });

