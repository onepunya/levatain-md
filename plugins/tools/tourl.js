import { typing, downloadMedia } from '../../src/lib/utils.js';

export const meta = {
    cmd:  ['tourl', 'geturl', 'uploadfile'],
    tag:  'tools',
    aliasOnly: true,
    desc: 'Upload media dan dapatkan URL-nya',
    ai: {
        trigger: 'User minta upload file, convert media ke link/url, atau dapatkan url dari gambar/video/audio/stiker',
        examples: ['tourl', 'jadiin link dong', 'upload gambar ini', 'buatin url dari video ini'],
    },
};

const LABELS = {
    image:    '🖼️ Gambar',
    video:    '🎬 Video',
    audio:    '🎵 Audio',
    sticker:  '🪄 Stiker',
    document: '📄 Dokumen',
};

export async function run(sock, { message, raw, from }) {
    const types  = ['image', 'video', 'audio', 'sticker', 'document'];
    const result = await downloadMedia(raw, message.quoted, types);

    if (!result) return sock.sendMessage(from, {
        text: '❌ Kirim atau reply media dulu.\nSupport: gambar, video, audio, stiker, dokumen.'
    }, { quoted: raw });

    await typing(sock, from);
    await sock.sendMessage(from, { text: '⏳ Mengupload...' }, { quoted: raw });

    try {
        const url   = await global.api.tourl(result.buffer);
        const label = LABELS[result.type] || '📁 File';

        await sock.sendMessage(from, {
            text: `✅ *${label} berhasil diupload!*\n\n🔗 *URL:*\n${url}\n\n_Link tersedia selama file masih ada di server._`
        }, { quoted: raw });
    } catch (e) {
        await sock.sendMessage(from, {
            text: `❌ Gagal upload: ${e.message}`
        }, { quoted: raw });
    }
}
