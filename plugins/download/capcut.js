import { typing, getArgs, sendAnyMedia, api, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('capcut')
    .in('download')
    .desc('Download CapCut video template without watermark')
    .prefixOnly()
    .ai({
        trigger: 'User asks to download a CapCut template with a URL',
        examples: ['capcut https://www.capcut.com/template/xxx', 'download capcut ini'],
        args: { url: 'CapCut template URL' },
    })
    .run(async (sock, { body, raw, from, db, primaryId }) => {
        const url = getArgs(body);
        if (!url) return sock.sendMessage(from, {
            text: msg('need.url.capcut')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.download_capcut') }, { quoted: raw });

        try {
            const data = await api.capcut(url);
            await sendAnyMedia(sock, from, { url: data.media, type: 'video' }, {
                caption: `🎬 *CapCut Template*\n${data.title}\n👤 ${data.author}`,
                quoted: raw,
            });
        } catch (e) {
            await sock.sendMessage(from, { text: msg('fail.generic', { msg: e.message }) }, { quoted: raw });
        }
    });

