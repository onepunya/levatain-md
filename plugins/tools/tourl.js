import { downloadMedia } from '../../src/util/index.js';
import { msg } from '../../src/wa/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tourl', 'geturl', 'uploadfile')
    .in('tools')
    .desc('Upload media and get its URL')
    .prefixOnly()
    .signal('User asks to upload a file, convert media to a link/url, or get a url from an image', ['tourl', 'make this a link', 'upload this image', 'make url from this video'])
    .run(async (sock, {
        message,
        raw,
        reply,
        typing
    }) => {
        const types = ['image', 'video', 'audio', 'sticker', 'document'];
        const result = await downloadMedia(raw, message.quoted, types);

        if (!result) return reply(msg('need.media_full'));

        await typing();
        await reply(msg('wait.upload'));

        try {
            const url = await global.api.tourl(result.buffer);
            const label = LABELS[result.type] || '📁 File';

            await reply(`✅ *${label} uploaded successfully!*\n\n🔗 *URL:*\n${url}\n\n_Link is available as long as the file remains on the server._`);
        } catch (e) {
            await reply(msg('fail.upload', { msg: e.message }));
        }
    });

const LABELS = {
    image: '🖼️ Image',
    video: '🎬 Video',
    audio: '🎵 Audio',
    sticker: '🪄 Sticker',
    document: '📄 Document',
};
