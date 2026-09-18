import { typing, downloadMedia, msg } from '../../src/lib/index.js';
import { plugin } from '../../src/core/plugin.js';

export default plugin('tourl', 'geturl', 'uploadfile')
    .in('tools')
    .desc('Upload media and get its URL')
    .prefixOnly()
    .signal('User asks to upload a file, convert media to a link/url, or get a url from an image', ['tourl', 'make this a link', 'upload this image', 'make url from this video'])
    .run(async (sock, { message, raw, from, db, primaryId }) => {
        const types  = ['image', 'video', 'audio', 'sticker', 'document'];
        const result = await downloadMedia(raw, message.quoted, types);

        if (!result) return sock.sendMessage(from, {
            text: msg('need.media_full')
        }, { quoted: raw });

        await typing(sock, from);
        await sock.sendMessage(from, { text: msg('wait.upload') }, { quoted: raw });

        try {
            const url   = await global.api.tourl(result.buffer);
            const label = LABELS[result.type] || '📁 File';

            await sock.sendMessage(from, {
                text: `✅ *${label} uploaded successfully!*\n\n🔗 *URL:*\n${url}\n\n_Link is available as long as the file remains on the server._`
            }, { quoted: raw });
        } catch (e) {
            await sock.sendMessage(from, {
                text: msg('fail.upload', { msg: e.message })
            }, { quoted: raw });
        }
    });

const LABELS = {
    image:    '🖼️ Image',
    video:    '🎬 Video',
    audio:    '🎵 Audio',
    sticker:  '🪄 Sticker',
    document: '📄 Document',
};

