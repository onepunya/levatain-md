import { api } from '../../src/api/index.js';
import { getArgs, sendAnyMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
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
    .run(async (sock, {
        body,
        raw,
        from,
        reply,
        typing
    }) => {
        const url = getArgs(body);
        if (!url) return reply(msg('need.url.capcut'));

        await typing();
        await reply(msg('wait.download_capcut'));

        try {
            const data = await api.capcut(url);
            await sendAnyMedia(sock, from, { url: data.media, type: 'video' }, {
                caption: `🎬 *CapCut Template*\n${data.title}\n👤 ${data.author}`,
                quoted: raw,
            });
        } catch (e) {
            await reply(msg('fail.generic', { msg: e.message }));
        }
    });
